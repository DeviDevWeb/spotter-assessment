from datetime import date, datetime, timedelta, timezone

from trips.domain import LatLon, RouteOption, WeatherSample
from trips.services import heatmap
from trips.services.heatmap import HEATMAP_HOURS, build_heatmap, heatmap_cells

DEPARTURE = datetime(2026, 1, 1, 8, 20, tzinfo=timezone.utc)
WINDOW = (date(2026, 1, 1), date(2026, 1, 4))


def route(start: LatLon, end: LatLon) -> RouteOption:
    return RouteOption(id='A', geometry=[start, end], distance_miles=0, duration_seconds=0)


# Fake forecast: wind grows 1 mph per hour from departure, same everywhere
def fake_series(locations):
    first = int(DEPARTURE.replace(minute=0).timestamp())
    series = {
        first + h * 3600: WeatherSample(time=DEPARTURE, wind_mph=float(h), rain_in_per_hr=0, snow_in_per_hr=0)
        for h in range(HEATMAP_HOURS + 1)
    }
    return {location: series for location in locations}


def heatmap_for(*routes: RouteOption) -> dict:
    grid, locations = heatmap_cells(list(routes))
    return build_heatmap(locations, grid, fake_series(locations), DEPARTURE, 0)


def test_heatmap_shape_and_hourly_values():
    result = heatmap_for(route(LatLon(40, -100), LatLon(41, -100)))

    assert result['hours'] == HEATMAP_HOURS
    assert result['start'] == '2026-01-01T08:00:00+00:00'
    assert len(result['points']) == len(result['values'])
    assert all(len(row) == HEATMAP_HOURS + 1 for row in result['values'])
    # Wind grows 1 mph per hour: 24 mph is Low, 25 mph (the Moderate lower bound) is Moderate
    assert result['values'][0][24] == 0
    assert result['values'][0][25] == 1


# A 1 degree north-south route on a 0.5 grid: 3 rows crossed, widened by 1 cell each way
def test_corridor_covers_route_plus_neighbors():
    result = heatmap_for(route(LatLon(40, -100), LatLon(41, -100)))

    lats = sorted({lat for _, lat in result['points']})
    lons = sorted({lon for lon, _ in result['points']})
    assert lats == [39.5, 40.0, 40.5, 41.0, 41.5]
    assert lons == [-100.5, -100.0, -99.5]


# Very long corridors coarsen the grid instead of exceeding the location budget
def test_long_corridor_is_capped():
    result = heatmap_for(route(LatLon(40, -120), LatLon(40, -75)))

    assert len(result['points']) <= heatmap.MAX_CELLS
    assert result['grid_degrees'] > heatmap.BASE_GRID_DEGREES


def test_window_is_shared_and_padded():
    from trips.services.weather import forecast_window

    assert forecast_window(DEPARTURE, DEPARTURE + timedelta(hours=10)) == WINDOW
    assert forecast_window(DEPARTURE, DEPARTURE + timedelta(days=5))[1] == date(2026, 1, 6)
