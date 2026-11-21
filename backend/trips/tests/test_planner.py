from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import pytest

from trips.domain import LatLon, Place, RouteOption
from trips.services import planner
from trips.services.errors import InputError

REQUEST = {
    'origin': 'Dallas',
    'destination': 'Dallas, TX',
    'departure': datetime(2026, 1, 1, tzinfo=timezone.utc),
    'load_weight_lb': 0,
}


# Two spellings of the same city must not reach the router
@patch.object(planner, 'get_route_options')
@patch.object(planner, 'geocode', return_value=Place('Dallas', LatLon(32.78, -96.80)))
def test_same_place_is_rejected(_geocode, get_route_options):
    with pytest.raises(InputError, match='same place'):
        planner.prepare_trip(REQUEST, 1)
    get_route_options.assert_not_called()


########################################
#########Two requests, one plan#########
########################################

DALLAS = Place('Dallas', LatLon(32.78, -96.80))
OKLAHOMA_CITY = Place('Oklahoma City', LatLon(35.47, -97.52))


def one_route(*_args) -> list[RouteOption]:
    return [RouteOption(id='A', geometry=[DALLAS.position, OKLAHOMA_CITY.position], distance_miles=200, duration_seconds=3 * 3600)]


# Calm Open-Meteo "hourly" objects for every requested location, wind set to wind_mph
def calm_forecasts(forecast: dict, wind_mph: float = 5) -> list[dict]:
    start = datetime.fromisoformat(forecast['start_date']).replace(tzinfo=timezone.utc)
    days = (datetime.fromisoformat(forecast['end_date']) - datetime.fromisoformat(forecast['start_date'])).days + 1
    times = [int((start + timedelta(hours=h)).timestamp()) for h in range(days * 24)]
    hourly = {'time': times, 'wind_speed_10m': [wind_mph] * len(times), 'wind_gusts_10m': [None] * len(times)}
    hourly |= {name: [0] * len(times) for name in ('rain', 'showers', 'snowfall')}
    return [hourly for _ in forecast['latitudes']]


def prepare(user_id: int = 1) -> dict:
    departure = datetime.now(timezone.utc) + timedelta(hours=1)
    request = {'origin': 'Dallas', 'destination': 'Oklahoma City', 'departure': departure, 'load_weight_lb': 0}
    with (
        patch.object(planner, 'geocode', side_effect=[DALLAS, OKLAHOMA_CITY]),
        patch.object(planner, 'get_route_options', side_effect=one_route),
    ):
        return planner.prepare_trip(request, user_id)


def test_prepare_lists_forecasts_and_finish_scores_them():
    prepared = prepare()
    forecast = prepared['forecast']
    assert len(forecast['latitudes']) == len(forecast['longitudes']) > 0
    assert forecast['hourly'] == ['wind_speed_10m', 'wind_gusts_10m', 'rain', 'showers', 'snowfall']

    plan = planner.finish_trip(prepared['plan_id'], 1, calm_forecasts(forecast, wind_mph=40))
    assert plan['recommended_route_id'] == 'A'
    assert {cp['risk'] for cp in plan['routes'][0]['checkpoints']} == {'HIGH'}
    assert plan['heatmap']['hours'] == 48


def test_finish_rejects_unknown_plan_and_other_users():
    prepared = prepare(user_id=1)
    forecasts = calm_forecasts(prepared['forecast'])
    with pytest.raises(InputError, match='expired'):
        planner.finish_trip('unknown', 1, forecasts)
    with pytest.raises(InputError, match='expired'):
        planner.finish_trip(prepared['plan_id'], 2, forecasts)


def test_finish_rejects_forecasts_that_do_not_match():
    prepared = prepare()
    forecasts = calm_forecasts(prepared['forecast'])
    with pytest.raises(InputError, match='does not match'):
        planner.finish_trip(prepared['plan_id'], 1, forecasts[:-1])
    with pytest.raises(InputError, match='Invalid forecast'):
        planner.finish_trip(prepared['plan_id'], 1, [{'time': [1]}] * len(forecasts))
