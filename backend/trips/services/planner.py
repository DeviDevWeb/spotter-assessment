from django.utils import timezone

from ..domain import Checkpoint, Place, RouteOption, RouteSummary
from .checkpoints import build_checkpoints
from .errors import InputError
from .geo import haversine_miles
from .geocoding import geocode
from .recommendation import explain, recommend, summarize
from .risk import classify
from .routing import get_route_options
from .weather import forecast_window, sample_checkpoints

# Straight-line distance below which origin and destination count as the same place
MIN_TRIP_MILES = 0.5


# Runs the full pipeline and returns the API response
def plan_trip(request: dict) -> dict:
    departure = request['departure']
    load_weight_lb = request['load_weight_lb']

    origin = geocode(request['origin'], request.get('origin_name', ''))
    destination = geocode(request['destination'], request.get('destination_name', ''))
    if haversine_miles(origin.position, destination.position) < MIN_TRIP_MILES:
        raise InputError('Origin and destination are the same place')

    routes = get_route_options(origin.position, destination.position)
    now = timezone.now()
    for route in routes:
        route.checkpoints = build_checkpoints(route, departure, now)

    all_checkpoints = [cp for route in routes for cp in route.checkpoints]
    window = forecast_window(departure, max(cp.eta for cp in all_checkpoints))
    sample_checkpoints(all_checkpoints, window)

    for cp in all_checkpoints:
        assert cp.weather is not None
        cp.risk, cp.risk_factors = classify(cp.weather, load_weight_lb)

    summaries = {route.id: summarize(route) for route in routes}

    return {
        'origin': _place(origin),
        'destination': _place(destination),
        'departure': departure.isoformat(),
        'routes': [_route(route, summaries[route.id]) for route in routes],
        'recommended_route_id': recommend(list(summaries.values())),
        'recommendation_reason': explain(list(summaries.values())),
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
