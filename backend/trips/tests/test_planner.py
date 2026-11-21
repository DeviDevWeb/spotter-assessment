from datetime import datetime, timezone
from unittest.mock import patch

import pytest

from trips.domain import LatLon, Place
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
        planner.plan_trip(REQUEST)
    get_route_options.assert_not_called()
