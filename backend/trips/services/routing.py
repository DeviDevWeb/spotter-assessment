import math

from django.conf import settings

from ..domain import LatLon, RouteOption
from .errors import InputError, PlanningError, UpstreamError
from .http import get_json

ROUTE_ALTERNATIVES = 3
METERS_PER_MILE = 1609.344

# OSRM often returns fewer than 3 alternatives. The rest are built by routing through a point
# pushed sideways from the trip's midpoint, by this fraction of the straight-line distance
VIA_OFFSETS = (0.2, -0.2, 0.35, -0.35)

# Detours slower than this compared to the fastest route aren't worth offering
MAX_DURATION_RATIO = 1.6

# Two routes whose distance and time are both this close (2%) are treated as the same road
SAME_ROUTE_TOLERANCE = 0.02


# Up to 3 distinct driving routes, fastest first, with ids A, B, C
def get_route_options(origin: LatLon, destination: LatLon) -> list[RouteOption]:
    routes = _request_routes([origin, destination], alternatives=True)
    fastest = min(route.duration_seconds for route in routes)

    for offset in VIA_OFFSETS:
        if len(routes) >= ROUTE_ALTERNATIVES:
            break
        via = _offset_midpoint(origin, destination, offset)
        try:
            candidate = _request_routes([origin, via, destination], alternatives=False)[0]
        except PlanningError:
            continue
        if candidate.duration_seconds > fastest * MAX_DURATION_RATIO:
            continue
        if not any(_is_similar(candidate, route) for route in routes):
            routes.append(candidate)

    routes = sorted(routes, key=lambda route: route.duration_seconds)[:ROUTE_ALTERNATIVES]
    for index, route in enumerate(routes):
        route.id = chr(ord('A') + index)
    return routes


def _request_routes(points: list[LatLon], alternatives: bool) -> list[RouteOption]:
    coordinates = ';'.join(f'{p.lon},{p.lat}' for p in points)
    data = get_json(
        f'{settings.OSRM_BASE_URL}/route/v1/driving/{coordinates}',
        {
            'alternatives': ROUTE_ALTERNATIVES if alternatives else 'false',
            'overview': 'simplified',
            'geometries': 'geojson',
        },
    )

    code = data.get('code') if isinstance(data, dict) else None
    if code == 'NoRoute':
        raise InputError('No road route found between these places')
    if code != 'Ok' or not data.get('routes'):
        raise UpstreamError(f'Routing failed: {data.get("message", code) if isinstance(data, dict) else "bad response"}')

    return [
        RouteOption(
            id='',
            geometry=[LatLon(lat, lon) for lon, lat in route['geometry']['coordinates']],
            distance_miles=route['distance'] / METERS_PER_MILE,
            duration_seconds=route['duration'],
        )
        for route in data['routes']
    ]


# Midpoint of the origin-destination line, pushed sideways by `fraction` of its length (the
# direction vector rotated 90°). Longitudes are scaled by cos(latitude) first so "sideways" is
# perpendicular on the ground; treating the area as flat is close enough for picking a via point
def _offset_midpoint(origin: LatLon, destination: LatLon, fraction: float) -> LatLon:
    lat0 = math.radians((origin.lat + destination.lat) / 2)
    x1, y1 = origin.lon * math.cos(lat0), origin.lat
    x2, y2 = destination.lon * math.cos(lat0), destination.lat
    mx, my = (x1 + x2) / 2, (y1 + y2) / 2
    dx, dy = x2 - x1, y2 - y1
    return LatLon(lat=my + fraction * dx, lon=(mx - fraction * dy) / math.cos(lat0))


def _is_similar(a: RouteOption, b: RouteOption) -> bool:
    def close(x: float, y: float) -> bool:
        return abs(x - y) <= SAME_ROUTE_TOLERANCE * max(x, y)

    return close(a.distance_miles, b.distance_miles) and close(a.duration_seconds, b.duration_seconds)
