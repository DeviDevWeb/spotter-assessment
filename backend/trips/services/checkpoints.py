from datetime import datetime, timedelta

from ..domain import Checkpoint, RouteOption
from .geo import cumulative_miles, points_at

# Checkpoint spacing depends on how far ahead the forecast is at the truck's ETA: forecasts
# are sharpest in the first hours, so those get the densest sampling.
# (max forecast lead time in hours, spacing in miles), checked in order
SPACING_BY_LEAD_HOURS = [
    (12, 10),
    (48, 25),
]
FAR_SPACING_MILES = 50

# No intermediate checkpoint closer than this to the destination
MIN_LAST_GAP_MILES = 0.5


# Miles to the next checkpoint for a truck arriving at eta, as seen from now
def spacing_for(eta: datetime, now: datetime) -> int:
    lead_hours = (eta - now).total_seconds() / 3600
    for max_lead, miles in SPACING_BY_LEAD_HOURS:
        if lead_hours <= max_lead:
            return miles
    return FAR_SPACING_MILES


# Checkpoints from start to destination, spaced by spacing_for(eta). ETAs assume a constant
# average speed over the route's total duration
def build_checkpoints(route: RouteOption, departure: datetime, now: datetime) -> list[Checkpoint]:
    total = route.distance_miles

    def eta_at(distance: float) -> datetime:
        fraction = distance / total if total else 0
        return departure + timedelta(seconds=route.duration_seconds * fraction)

    distances = [0.0]
    while True:
        following = distances[-1] + spacing_for(eta_at(distances[-1]), now)
        if following >= total - MIN_LAST_GAP_MILES:
            break
        distances.append(following)
    if total > 0:
        distances.append(total)

    # The simplified geometry is a bit shorter than the real road, scale distances onto it
    cumulative = cumulative_miles(route.geometry)
    scale = cumulative[-1] / total if total else 0
    positions = points_at(route.geometry, cumulative, [d * scale for d in distances])

    return [
        Checkpoint(position=position, distance_miles=distance, eta=eta_at(distance))
        for position, distance in zip(positions, distances, strict=True)
    ]
