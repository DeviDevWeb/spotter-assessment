import logging
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone

from django.conf import settings
from django.core.cache import cache

from ..domain import Checkpoint, LatLon, WeatherSample
from .errors import InputError, UpstreamError
from .http import get_json

logger = logging.getLogger(__name__)

# Hourly forecasts from Open-Meteo. Rain and snowfall values are the total for the preceding
# hour, so they read directly as in/hr

HOURLY_VARIABLES = ('wind_speed_10m', 'wind_gusts_10m', 'rain', 'showers', 'snowfall')

# Locations per Open-Meteo request, and parallel requests
BATCH_SIZE = 50
MAX_WORKERS = 4

# Checkpoints are snapped to a 0.25 degree grid (~17 mi, about the resolution of global forecast
# models) so nearby ones share one forecast and cache entry. Open-Meteo counts every location as
# a call (~600/min on the free tier, shared with the heatmap), so when a trip still needs more than
# MAX_CHECKPOINT_LOCATIONS the grid is doubled until it fits. Checkpoints keep their spacing
GRID_DEGREES = 0.25
MAX_CHECKPOINT_LOCATIONS = 250

# Every forecast covers at least this many days from the departure date, so the checkpoints and
# the 0-48h heatmap ask for the same window and share cache entries
MIN_WINDOW_DAYS = 3

FORECAST_CACHE_SECONDS = 60 * 30

Location = tuple[float, float]  # (lat, lon) on a grid
Series = dict[int, WeatherSample]  # unix hour -> sample
Window = tuple[date, date]  # first and last UTC day to fetch


# Days to fetch for a trip leaving at departure and arriving at last_eta
def forecast_window(departure: datetime, last_eta: datetime) -> Window:
    start = departure.astimezone(timezone.utc).date()
    end = max(start + timedelta(days=MIN_WINDOW_DAYS), last_eta.astimezone(timezone.utc).date())
    return start, end


# Fills checkpoint.weather with the forecast hour closest to its ETA
def sample_checkpoints(checkpoints: list[Checkpoint], window: Window) -> None:
    if not checkpoints:
        return

    grid = GRID_DEGREES
    while len(locations := {snap(cp.position, grid) for cp in checkpoints}) > MAX_CHECKPOINT_LOCATIONS:
        grid *= 2
    if grid != GRID_DEGREES:
        logger.info('Checkpoint weather grid coarsened to %s degrees (%s locations)', grid, len(locations))

    series = load_series(sorted(locations), window)

    for cp in checkpoints:
        sample = series[snap(cp.position, grid)].get(nearest_hour(cp.eta))
        if sample is None:
            raise InputError('The forecast does not cover the whole trip, try an earlier departure')
        cp.weather = sample


def snap(position: LatLon, grid: float) -> Location:
    def to_grid(value: float) -> float:
        return round(round(value / grid) * grid, 4)

    return (to_grid(position.lat), to_grid(position.lon))


# Unix timestamp of the hour closest to when
def nearest_hour(when: datetime) -> int:
    rounded = (when + timedelta(minutes=30)).replace(minute=0, second=0, microsecond=0)
    return int(rounded.timestamp())


def _cache_key(location: Location, window: Window) -> str:
    return f'forecast:{location[0]}:{location[1]}:{window[0]}:{window[1]}'


# Cached series where available, the rest fetched in parallel batches
def load_series(locations: list[Location], window: Window) -> dict[Location, Series]:
    result: dict[Location, Series] = {}
    missing = []
    for location in locations:
        cached = cache.get(_cache_key(location, window))
        if cached is None:
            missing.append(location)
        else:
            result[location] = cached

    batches = [missing[i : i + BATCH_SIZE] for i in range(0, len(missing), BATCH_SIZE)]
    with ThreadPoolExecutor(MAX_WORKERS) as pool:
        for batch, batch_series in zip(batches, pool.map(lambda b: _fetch(b, window), batches), strict=True):
            for location, series in zip(batch, batch_series, strict=True):
                result[location] = series
                cache.set(_cache_key(location, window), series, FORECAST_CACHE_SECONDS)

    return result


def _fetch(locations: list[Location], window: Window) -> list[Series]:
    data = get_json(
        settings.OPEN_METEO_BASE_URL,
        {
            'latitude': ','.join(str(lat) for lat, _ in locations),
            'longitude': ','.join(str(lon) for _, lon in locations),
            'hourly': ','.join(HOURLY_VARIABLES),
            'wind_speed_unit': 'mph',
            'precipitation_unit': 'inch',
            'timezone': 'GMT',
            'timeformat': 'unixtime',
            'start_date': window[0].isoformat(),
            'end_date': window[1].isoformat(),
        },
    )

    # A single location comes back as an object, several as a list
    if isinstance(data, dict):
        if data.get('error'):
            raise UpstreamError(f'Weather service error: {data.get("reason")}')
        data = [data]
    if not isinstance(data, list) or len(data) != len(locations):
        raise UpstreamError('Unexpected response from the weather service')

    return [_parse(item['hourly']) for item in data]


def _parse(hourly: dict) -> Series:
    # Missing values (null) are treated as calm / dry
    def value(name: str, i: int) -> float:
        return hourly[name][i] or 0.0

    return {
        t: WeatherSample(
            time=datetime.fromtimestamp(t, tz=timezone.utc),
            wind_mph=value('wind_speed_10m', i),
            gust_mph=value('wind_gusts_10m', i),
            rain_in_per_hr=value('rain', i) + value('showers', i),
            snow_in_per_hr=value('snowfall', i),
        )
        for i, t in enumerate(hourly['time'])
    }
