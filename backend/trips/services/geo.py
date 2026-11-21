import math
from itertools import pairwise

from ..domain import LatLon

EARTH_RADIUS_MILES = 3958.8


# Distance between two points
def distance_miles(a: LatLon, b: LatLon) -> float:
    mean_lat = math.radians((a.lat + b.lat) / 2)
    x = math.radians(b.lon - a.lon) * math.cos(mean_lat)
    y = math.radians(b.lat - a.lat)
    return EARTH_RADIUS_MILES * math.sqrt(x * x + y * y)


# Distance from the start of the polyline to each of its vertices
def cumulative_miles(points: list[LatLon]) -> list[float]:
    totals = [0.0]
    for a, b in pairwise(points):
        totals.append(totals[-1] + distance_miles(a, b))
    return totals


# Point that many miles along the polyline, clamped to its first and last point
def point_at_distance(points: list[LatLon], cumulative: list[float], distance: float) -> LatLon:
    if len(points) == 1 or distance <= 0:
        return points[0]

    for i in range(len(points) - 1):
        start_miles, end_miles = cumulative[i], cumulative[i + 1]
        if distance <= end_miles:
            segment_miles = end_miles - start_miles
            if segment_miles == 0:
                return points[i]
            t = (distance - start_miles) / segment_miles  # 0 = segment start, 1 = segment end
            a, b = points[i], points[i + 1]
            return LatLon(a.lat + (b.lat - a.lat) * t, a.lon + (b.lon - a.lon) * t)

    return points[-1]


# Points at the given distances along a polyline
def points_at(points: list[LatLon], cumulative: list[float], distances: list[float]) -> list[LatLon]:
    return [point_at_distance(points, cumulative, d) for d in distances]


# Evenly spaced points every step_miles along a polyline (start and end included)
def resample(points: list[LatLon], step_miles: float) -> list[LatLon]:
    cumulative = cumulative_miles(points)
    total = cumulative[-1]
    count = max(int(total // step_miles), 1)
    distances = [total * i / count for i in range(count + 1)]
    return points_at(points, cumulative, distances)
