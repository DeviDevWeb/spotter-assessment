import re
import threading
import time

from django.conf import settings
from django.core.cache import cache

from ..domain import LatLon, Place
from .errors import InputError
from .http import get_json

GEOCODE_CACHE_SECONDS = 60 * 60 * 24

# Coordinates typed by the user, picked from the suggestion list or clicked on the map
COORDINATES_PATTERN = re.compile(r'^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$')

# Nominatim's usage policy allows at most 1 request per second
MIN_REQUEST_INTERVAL_SECONDS = 1.0
_lock = threading.Lock()
_last_request_at = 0.0


# Blocks until at least MIN_REQUEST_INTERVAL_SECONDS passed since the previous Nominatim call
def _wait_for_slot() -> None:
    global _last_request_at
    with _lock:
        wait = _last_request_at + MIN_REQUEST_INTERVAL_SECONDS - time.monotonic()
        if wait > 0:
            time.sleep(wait)
        _last_request_at = time.monotonic()


# Free-text address or "lat, lon" -> place. Coordinates are used as they are (named after the
# suggestion they came from, or after the numbers), addresses go to OpenStreetMap Nominatim
def geocode(query: str, name: str = '') -> Place:
    query = query.strip()

    match = COORDINATES_PATTERN.match(query)
    if match:
        lat, lon = float(match.group(1)), float(match.group(2))
        if not (-90 <= lat <= 90 and -180 <= lon <= 180):
            raise InputError(f'"{query}" are not valid coordinates')
        return Place(name=name.strip() or f'{lat:.5f}, {lon:.5f}', position=LatLon(lat, lon))

    cache_key = f'geocode:{query.lower()}'
    cached = cache.get(cache_key)
    if cached:
        return cached

    _wait_for_slot()
    results = get_json(f'{settings.NOMINATIM_BASE_URL}/search', {'q': query, 'format': 'jsonv2', 'limit': 1})
    if not isinstance(results, list) or not results:
        raise InputError(f'Could not find "{query}"')

    best = results[0]
    place = Place(name=best['display_name'], position=LatLon(float(best['lat']), float(best['lon'])))
    cache.set(cache_key, place, GEOCODE_CACHE_SECONDS)
    return place
