from unittest.mock import patch

import pytest

from trips.services import geocoding
from trips.services.errors import InputError
from trips.services.geocoding import geocode


# Coordinates never call Nominatim, they keep the suggestion's name or are named after the numbers
@patch.object(geocoding, 'get_json')
def test_coordinates_skip_lookup(get_json):
    named = geocode('32.78306, -96.80667', 'Dallas, Texas, United States')
    assert named.name == 'Dallas, Texas, United States'
    assert (named.position.lat, named.position.lon) == (32.78306, -96.80667)

    assert geocode('31.5, -97.25').name == '31.50000, -97.25000'
    get_json.assert_not_called()


def test_out_of_range_coordinates_rejected():
    with pytest.raises(InputError):
        geocode('95, 10', 'Nowhere')
