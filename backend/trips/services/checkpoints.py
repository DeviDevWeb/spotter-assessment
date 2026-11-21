from datetime import datetime, timedelta

from ..domain import Checkpoint, RouteOption
from .geo import cumulative_miles, point_at_distance

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
    hours_per_mile = route.duration_seconds / 3600 / total if total else 0
    cumulative = cumulative_miles(route.geometry)

    checkpoints = []
    distance = 0.0
    while distance < total - MIN_LAST_GAP_MILES:
        eta = departure + timedelta(hours=distance * hours_per_mile)
        position = point_at_distance(route.geometry, cumulative, distance)
        checkpoints.append(Checkpoint(position=position, distance_miles=distance, eta=eta))
        distance += spacing_for(eta, now)

    # Always end at the destination
    arrival = departure + timedelta(seconds=route.duration_seconds)
    checkpoints.append(Checkpoint(position=route.geometry[-1], distance_miles=total, eta=arrival))
    return checkpoints
