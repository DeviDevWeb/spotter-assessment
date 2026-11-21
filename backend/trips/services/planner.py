from dataclasses import dataclass
from datetime import datetime
from uuid import uuid4

from django.core.cache import cache
from django.utils import timezone

from ..domain import Checkpoint, Place, RouteOption, RouteSummary
from .checkpoints import build_checkpoints
from .errors import InputError
from .geo import haversine_miles
from .geocoding import geocode
from .heatmap import build_heatmap, heatmap_cells
from .recommendation import explain, recommend, summarize
from .risk import classify
from .routing import get_route_options
from .weather import HOURLY_VARIABLES, Location, Window, checkpoint_locations, forecast_window, parse_forecasts, sample_checkpoints

# Straight-line distance below which origin and destination count as the same place
MIN_TRIP_MILES = 0.5

# A plan is done in two requests with the browser fetching the forecasts in between (see
# weather.py). The first half waits in the cache for the second
PLAN_CACHE_SECONDS = 60 * 15


@dataclass
class PreparedTrip:
    user_id: int
    origin: Place
    destination: Place
    departure: datetime
    load_weight_lb: int
    routes: list[RouteOption]
    window: Window
    locations: list[Location]  # every forecast location, in the order the browser sends them back
    checkpoint_grid: float
    heatmap_grid: float
    heatmap_locations: list[Location]


def _cache_key(plan_id: str) -> str:
    return f'plan:{plan_id}'


# First half: places, routes and checkpoints. Returns the plan id and the forecasts to fetch
def prepare_trip(request: dict, user_id: int) -> dict:
    departure = request['departure']

    origin = geocode(request['origin'], request.get('origin_name', ''))
    destination = geocode(request['destination'], request.get('destination_name', ''))
    if haversine_miles(origin.position, destination.position) < MIN_TRIP_MILES:
        raise InputError('Origin and destination are the same place')

    routes = get_route_options(origin.position, destination.position)
    now = timezone.now()
    for route in routes:
        route.checkpoints = build_checkpoints(route, departure, now)

    # Checkpoints and heatmap share one forecast window, so overlapping locations are fetched once
    all_checkpoints = [cp for route in routes for cp in route.checkpoints]
    window = forecast_window(departure, max(cp.eta for cp in all_checkpoints))
    checkpoint_grid, checkpoint_cells = checkpoint_locations(all_checkpoints)
    heatmap_grid, heatmap_locations = heatmap_cells(routes)
    locations = sorted(checkpoint_cells | set(heatmap_locations))

    plan_id = uuid4().hex
    prepared = PreparedTrip(
        user_id=user_id,
        origin=origin,
        destination=destination,
        departure=departure,
        load_weight_lb=request['load_weight_lb'],
        routes=routes,
        window=window,
        locations=locations,
        checkpoint_grid=checkpoint_grid,
        heatmap_grid=heatmap_grid,
        heatmap_locations=heatmap_locations,
    )
    cache.set(_cache_key(plan_id), prepared, PLAN_CACHE_SECONDS)

    return {
        'plan_id': plan_id,
        'forecast': {
            'latitudes': [lat for lat, _ in locations],
            'longitudes': [lon for _, lon in locations],
            'start_date': window[0].isoformat(),
            'end_date': window[1].isoformat(),
            'hourly': list(HOURLY_VARIABLES),
        },
    }


# Second half: the browser's forecasts in, scored routes, recommendation and heatmap out
def finish_trip(plan_id: str, user_id: int, forecasts: list) -> dict:
    prepared: PreparedTrip | None = cache.get(_cache_key(plan_id))
    if prepared is None or prepared.user_id != user_id:
        raise InputError('This plan has expired, please plan the trip again')

    series = parse_forecasts(prepared.locations, forecasts)
    routes = prepared.routes
    all_checkpoints = [cp for route in routes for cp in route.checkpoints]
    sample_checkpoints(all_checkpoints, series, prepared.checkpoint_grid)

    for cp in all_checkpoints:
        assert cp.weather is not None
        cp.risk, cp.risk_factors = classify(cp.weather, prepared.load_weight_lb)

    summaries = {route.id: summarize(route) for route in routes}

    return {
        'origin': _place(prepared.origin),
        'destination': _place(prepared.destination),
        'departure': prepared.departure.isoformat(),
        'routes': [_route(route, summaries[route.id]) for route in routes],
        'recommended_route_id': recommend(list(summaries.values())),
        'recommendation_reason': explain(list(summaries.values())),
        'heatmap': build_heatmap(prepared.heatmap_locations, prepared.heatmap_grid, series, prepared.departure, prepared.load_weight_lb),
    }


########################################
#############Serialization##############
########################################


def _place(place: Place) -> dict:
    return {'name': place.name, 'lat': place.position.lat, 'lon': place.position.lon}


def _checkpoint(cp: Checkpoint) -> dict:
    assert cp.weather is not None and cp.risk is not None
    return {
        'lat': round(cp.position.lat, 5),
        'lon': round(cp.position.lon, 5),
        'distance_miles': round(cp.distance_miles, 1),
        'eta': cp.eta.isoformat(),
        'weather': {
            'time': cp.weather.time.isoformat(),
            'wind_mph': cp.weather.wind_mph,
            'gust_mph': cp.weather.gust_mph,
            'rain_in_per_hr': cp.weather.rain_in_per_hr,
            'snow_in_per_hr': cp.weather.snow_in_per_hr,
        },
        'risk': cp.risk.name,
        'risk_factors': {factor: level.name for factor, level in cp.risk_factors.items()},
    }


def _route(route: RouteOption, summary: RouteSummary) -> dict:
    return {
        'id': route.id,
        'geometry': [[round(p.lon, 5), round(p.lat, 5)] for p in route.geometry],
        'distance_miles': round(route.distance_miles, 1),
        'duration_seconds': round(route.duration_seconds),
        'checkpoints': [_checkpoint(cp) for cp in route.checkpoints],
        'summary': {
            'no_travel_miles': round(summary.no_travel_miles, 1),
            'severe_miles': round(summary.severe_miles, 1),
            'high_miles': round(summary.high_miles, 1),
            'average_risk': round(summary.average_risk, 2),
            'worst_risk': summary.worst_risk.name,
        },
    }
