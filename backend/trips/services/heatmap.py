import logging
from datetime import datetime, timezone

from ..domain import RouteOption
from .geo import resample
from .risk import classify
from .weather import Location, Series, nearest_hour

logger = logging.getLogger(__name__)

# Weather risk on a grid around the routes, for every hour from departure to departure + 48h.

HEATMAP_HOURS = 48

# Cells are 0.5 degrees (~35 mi). A route covers the cells it crosses plus NEIGHBOR_CELLS on each
# side. The grid doubles while the corridor needs more than MAX_CELLS forecast locations,
# keeping the heatmap within the weather API's rate limit
BASE_GRID_DEGREES = 0.5
NEIGHBOR_CELLS = 1
MAX_CELLS = 200

MILES_PER_DEGREE = 69
NO_DATA = -1


# Grid size and forecast locations covering every route
def heatmap_cells(routes: list[RouteOption]) -> tuple[float, list[Location]]:
    grid = BASE_GRID_DEGREES
    while len(cells := _corridor_cells(routes, grid)) > MAX_CELLS:
        grid *= 2
    if grid != BASE_GRID_DEGREES:
        logger.info('Heatmap grid coarsened to %s degrees (%s cells)', grid, len(cells))
    return grid, sorted(cells)


def build_heatmap(locations: list[Location], grid: float, series: dict[Location, Series], departure: datetime, load_weight_lb: int) -> dict:
    first_hour = nearest_hour(departure)

    values = []
    for location in locations:
        row = []
        for hour in range(HEATMAP_HOURS + 1):
            sample = series[location].get(first_hour + hour * 3600)
            row.append(NO_DATA if sample is None else int(classify(sample, load_weight_lb)[0]))
        values.append(row)

    return {
        'start': datetime.fromtimestamp(first_hour, tz=timezone.utc).isoformat(),
        'hours': HEATMAP_HOURS,
        'grid_degrees': grid,
        'points': [[lon, lat] for lat, lon in locations],
        'values': values,
    }


# Grid cells every route passes through, widened by NEIGHBOR_CELLS
def _corridor_cells(routes: list[RouteOption], grid: float) -> set[Location]:
    cells: set[tuple[int, int]] = set()
    step_miles = grid * MILES_PER_DEGREE / 2

    for route in routes:
        for point in resample(route.geometry, step_miles):
            row, col = round(point.lat / grid), round(point.lon / grid)
            for dr in range(-NEIGHBOR_CELLS, NEIGHBOR_CELLS + 1):
                for dc in range(-NEIGHBOR_CELLS, NEIGHBOR_CELLS + 1):
                    cells.add((row + dr, col + dc))

    return {(round(row * grid, 4), round(col * grid, 4)) for row, col in cells}
