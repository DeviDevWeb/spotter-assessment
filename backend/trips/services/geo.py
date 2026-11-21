import math
from itertools import pairwise

from ..domain import LatLon

EARTH_RADIUS_MILES = 3958.8

# Distance between two points in a straight line over a sphere
def haversine_miles(a: LatLon, b: LatLon) -> float:
    lat1, lat2 = math.radians(a.lat), math.radians(b.lat)
    dlat = lat2 - lat1
    dlon = math.radians(b.lon - a.lon)
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * EARTH_RADIUS_MILES * math.asin(math.sqrt(h))


# Distance from the start of the polyline to each of its vertices
def cumulative_miles(points: list[LatLon]) -> list[float]:
    totals = [0.0]
    for a, b in pairwise(points):
        totals.append(totals[-1] + haversine_miles(a, b))
    return totals


# Points at the given distances along a polyline. Distances must be sorted ascending
def points_at(points: list[LatLon], cumulative: list[float], distances: list[float]) -> list[LatLon]:
    if len(points) < 2:
        return [points[0] for _ in distances]

    result = []
    i = 0
    for d in distances:
        while i < len(points) - 2 and cumulative[i + 1] < d:
            i += 1
        segment = cumulative[i + 1] - cumulative[i]
        t = 0.0 if segment == 0 else min(max((d - cumulative[i]) / segment, 0.0), 1.0)
        a, b = points[i], points[i + 1]
        result.append(LatLon(a.lat + (b.lat - a.lat) * t, a.lon + (b.lon - a.lon) * t))
    return result


# Evenly spaced points every step_miles along a polyline (start and end included)
def resample(points: list[LatLon], step_miles: float) -> list[LatLon]:
    cumulative = cumulative_miles(points)
    total = cumulative[-1]
    count = max(int(total // step_miles), 1)
    distances = [total * i / count for i in range(count + 1)]
    return points_at(points, cumulative, distances)
