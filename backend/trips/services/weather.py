import logging
from datetime import date, datetime, timedelta, timezone

from ..domain import Checkpoint, LatLon, WeatherSample
from .errors import InputError

logger = logging.getLogger(__name__)

# Hourly forecasts from Open-Meteo, fetched by the browser: the free tier is limited per IP, and a
# hosted backend shares its outbound IP with other apps on the same host, which used up the quota
# for everyone. The backend picks the locations and the window, the browser fetches them and sends
# the hourly data back. Rain and snowfall values are the total for the preceding hour, so they read
# directly as in/hr

HOURLY_VARIABLES = ('wind_speed_10m', 'wind_gusts_10m', 'rain', 'showers', 'snowfall')

# Checkpoints are snapped to a 0.25 degree grid (~17 mi, about the resolution of global forecast
# models) so nearby ones share one forecast. Open-Meteo counts every location as a call (~600/min
# per IP on the free tier, shared with the heatmap), so when a trip still needs more than
# MAX_CHECKPOINT_LOCATIONS the grid is doubled until it fits. Checkpoints keep their spacing
GRID_DEGREES = 0.25
MAX_CHECKPOINT_LOCATIONS = 250

# Every forecast covers at least this many days from the departure date, so the checkpoints and
# the 0-48h heatmap use the same window and share locations
MIN_WINDOW_DAYS = 3

Location = tuple[float, float]  # (lat, lon) on a grid
Series = dict[int, WeatherSample]  # unix hour -> sample
Window = tuple[date, date]  # first and last UTC day to fetch


# Days to fetch for a trip leaving at departure and arriving at last_eta
def forecast_window(departure: datetime, last_eta: datetime) -> Window:
    start = departure.astimezone(timezone.utc).date()
    end = max(start + timedelta(days=MIN_WINDOW_DAYS), last_eta.astimezone(timezone.utc).date())
    return start, end


# Grid size and forecast locations for the checkpoints
def checkpoint_locations(checkpoints: list[Checkpoint]) -> tuple[float, set[Location]]:
    grid = GRID_DEGREES
    while len(locations := {snap(cp.position, grid) for cp in checkpoints}) > MAX_CHECKPOINT_LOCATIONS:
        grid *= 2
    if grid != GRID_DEGREES:
        logger.info('Checkpoint weather grid coarsened to %s degrees (%s locations)', grid, len(locations))
    return grid, locations


# Fills checkpoint.weather with the forecast hour closest to its ETA
def sample_checkpoints(checkpoints: list[Checkpoint], series: dict[Location, Series], grid: float) -> None:
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


# Open-Meteo "hourly" objects sent by the browser, one per location in the same order
def parse_forecasts(locations: list[Location], forecasts: list) -> dict[Location, Series]:
    if len(forecasts) != len(locations):
        raise InputError('The forecast data does not match the plan, please plan the trip again')
    try:
        return {location: _parse(hourly) for location, hourly in zip(locations, forecasts, strict=True)}
    except (KeyError, IndexError, TypeError, ValueError) as exc:
        raise InputError('Invalid forecast data, please plan the trip again') from exc


def _parse(hourly: dict) -> Series:
    # Missing values (null) are treated as calm / dry
    def value(name: str, i: int) -> float:
        return float(hourly[name][i] or 0)

    return {
        int(t): WeatherSample(
            time=datetime.fromtimestamp(int(t), tz=timezone.utc),
            wind_mph=value('wind_speed_10m', i),
            gust_mph=value('wind_gusts_10m', i),
            rain_in_per_hr=value('rain', i) + value('showers', i),
            snow_in_per_hr=value('snowfall', i),
        )
        for i, t in enumerate(hourly['time'])
    }
