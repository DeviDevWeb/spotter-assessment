from datetime import datetime, timedelta, timezone
from itertools import pairwise

from trips.domain import LatLon, RouteOption
from trips.services.checkpoints import build_checkpoints, spacing_for
from trips.services.geo import distance_miles

NOW = datetime(2026, 1, 1, 8, tzinfo=timezone.utc)


# Straight line north along a meridian, 3 degrees of latitude (~207 mi)
def straight_route(duration_hours: float) -> RouteOption:
    start, end = LatLon(40.0, -100.0), LatLon(43.0, -100.0)
    return RouteOption(
        id='A',
        geometry=[start, end],
        distance_miles=distance_miles(start, end),
        duration_seconds=duration_hours * 3600,
    )


def gaps(checkpoints) -> list[float]:
    return [round(b.distance_miles - a.distance_miles, 3) for a, b in pairwise(checkpoints)]


def test_spacing_follows_forecast_lead_time():
    assert spacing_for(NOW + timedelta(hours=1), NOW) == 10
    assert spacing_for(NOW + timedelta(hours=12), NOW) == 10
    assert spacing_for(NOW + timedelta(hours=13), NOW) == 25
    assert spacing_for(NOW + timedelta(hours=48), NOW) == 25
    assert spacing_for(NOW + timedelta(hours=49), NOW) == 50


# Leaving now on a short trip: everything within 12h, so 10 mi apart
def test_near_term_trip_uses_10_mile_spacing():
    route = straight_route(duration_hours=4)
    checkpoints = build_checkpoints(route, NOW, NOW)

    assert set(gaps(checkpoints)[:-1]) == {10}
    assert checkpoints[0].distance_miles == 0
    assert checkpoints[-1].distance_miles == route.distance_miles
    assert checkpoints[-1].position.lat == 43.0


# Leaving in 3 days: everything is more than 48h ahead, so 50 mi apart
def test_far_departure_uses_50_mile_spacing():
    checkpoints = build_checkpoints(straight_route(duration_hours=4), NOW + timedelta(days=3), NOW)
    assert set(gaps(checkpoints)[:-1]) == {50}


# A 20h trip leaving now crosses the 12h mark, spacing switches from 10 to 25 mi
def test_spacing_changes_along_the_trip():
    checkpoints = build_checkpoints(straight_route(duration_hours=20), NOW, NOW)
    spacing = gaps(checkpoints)[:-1]

    assert spacing[0] == 10
    assert spacing[-1] == 25
    # Each gap is chosen from the ETA at the checkpoint it starts from
    for cp, gap in zip(checkpoints, spacing, strict=False):
        assert (cp.eta - NOW <= timedelta(hours=12)) == (gap == 10)


def test_eta_is_proportional_to_distance():
    route = straight_route(duration_hours=2)
    checkpoints = build_checkpoints(route, NOW, NOW)

    assert checkpoints[0].eta == NOW
    assert checkpoints[-1].eta == NOW + timedelta(hours=2)
    third = checkpoints[3]  # mile 30
    assert abs((third.eta - NOW).total_seconds() - 7200 * 30 / route.distance_miles) < 1
