from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import IntEnum

# Plain data types shared across services


# Ordered so max() picks the worst level
class RiskLevel(IntEnum):
    LOW = 0
    MODERATE = 1
    HIGH = 2
    SEVERE = 3
    NO_TRAVEL = 4


@dataclass(frozen=True)
class LatLon:
    lat: float
    lon: float


@dataclass(frozen=True)
class Place:
    name: str
    position: LatLon


# Forecast values for one point at one hour
@dataclass(frozen=True)
class WeatherSample:
    time: datetime
    wind_mph: float
    rain_in_per_hr: float
    snow_in_per_hr: float
    gust_mph: float = 0.0


# A point along a route, weather and risk are filled in later in the pipeline
@dataclass
class Checkpoint:
    position: LatLon
    distance_miles: float
    eta: datetime
    weather: WeatherSample | None = None
    risk: RiskLevel | None = None
    risk_factors: dict[str, RiskLevel] = field(default_factory=dict)


@dataclass
class RouteOption:
    id: str
    geometry: list[LatLon]
    distance_miles: float
    duration_seconds: float
    checkpoints: list[Checkpoint] = field(default_factory=list)


# Totals used to rank routes against each other
@dataclass
class RouteSummary:
    route_id: str
    no_travel_miles: float
    severe_miles: float
    high_miles: float
    average_risk: float
    worst_risk: RiskLevel
    duration_seconds: float
