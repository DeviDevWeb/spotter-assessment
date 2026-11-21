from datetime import datetime, timezone

import pytest

from trips.domain import RiskLevel, WeatherSample
from trips.services.risk import classify

NOW = datetime(2026, 1, 1, tzinfo=timezone.utc)
LIGHT_LOAD = 10_000


# Gusts default to the sustained speed, so they never decide unless a test sets them
def weather(wind=0.0, rain=0.0, snow=0.0, gust=None) -> WeatherSample:
    return WeatherSample(
        time=NOW, wind_mph=wind, rain_in_per_hr=rain, snow_in_per_hr=snow, gust_mph=wind if gust is None else gust
    )


# Boundaries from the spec table, lower bound belongs to the higher level
@pytest.mark.parametrize(
    'wind, expected',
    [
        (24.9, RiskLevel.LOW),
        (25, RiskLevel.MODERATE),
        (34.9, RiskLevel.MODERATE),
        (35, RiskLevel.HIGH),
        (45, RiskLevel.SEVERE),
        (54.9, RiskLevel.SEVERE),
        (55, RiskLevel.NO_TRAVEL),
    ],
)
def test_wind_thresholds(wind, expected):
    assert classify(weather(wind=wind), LIGHT_LOAD)[0] == expected


# "> 1.00" for No Travel, so exactly 1.00 is still Severe
@pytest.mark.parametrize(
    'rain, expected',
    [
        (0.09, RiskLevel.LOW),
        (0.10, RiskLevel.MODERATE),
        (0.25, RiskLevel.HIGH),
        (0.50, RiskLevel.SEVERE),
        (1.00, RiskLevel.SEVERE),
        (1.01, RiskLevel.NO_TRAVEL),
    ],
)
def test_rain_thresholds(rain, expected):
    assert classify(weather(rain=rain), LIGHT_LOAD)[0] == expected


@pytest.mark.parametrize(
    'snow, expected',
    [
        (0.4, RiskLevel.LOW),
        (0.5, RiskLevel.MODERATE),
        (1.0, RiskLevel.HIGH),
        (2.0, RiskLevel.SEVERE),
        (3.0, RiskLevel.SEVERE),
        (3.1, RiskLevel.NO_TRAVEL),
    ],
)
def test_snow_thresholds(snow, expected):
    assert classify(weather(snow=snow), LIGHT_LOAD)[0] == expected


@pytest.mark.parametrize(
    'wind, load, expected',
    [
        (45, 30_000, RiskLevel.SEVERE),  # not above 30,000
        (45, 30_001, RiskLevel.NO_TRAVEL),
        (54, 45_000, RiskLevel.NO_TRAVEL),
        (35, 40_000, RiskLevel.HIGH),  # not above 40,000
        (35, 40_001, RiskLevel.SEVERE),
        (44, 80_000, RiskLevel.SEVERE),
        (34, 80_000, RiskLevel.MODERATE),  # below the load rules
        (55, 0, RiskLevel.NO_TRAVEL),  # any load
    ],
)
def test_load_rules(wind, load, expected):
    assert classify(weather(wind=wind), load)[0] == expected


# Worst factor wins, and every factor's own level is reported
def test_worst_factor_and_factor_levels():
    level, factors = classify(weather(wind=30, gust=38, snow=2.5), LIGHT_LOAD)
    assert level == RiskLevel.SEVERE
    assert factors == {'wind': RiskLevel.MODERATE, 'rain': RiskLevel.LOW, 'snow': RiskLevel.SEVERE, 'load': RiskLevel.LOW}


# A gust counts like sustained wind 17 mph lower, the stronger of the two decides
@pytest.mark.parametrize(
    'wind, gust, expected',
    [
        (10, 41.9, RiskLevel.LOW),  # 24.9 effective
        (10, 42, RiskLevel.MODERATE),  # 25 effective
        (10, 62, RiskLevel.SEVERE),  # 45 effective
        (10, 72, RiskLevel.NO_TRAVEL),  # 55 effective
        (36, 40, RiskLevel.HIGH),  # sustained wins
    ],
)
def test_gusts(wind, gust, expected):
    assert classify(weather(wind=wind, gust=gust), LIGHT_LOAD)[0] == expected


# Load rules use the same effective wind: 52 mph gusts act like 35 mph sustained, 62 like 45
def test_gusts_trigger_load_rules():
    assert classify(weather(wind=20, gust=52), 45_000)[0] == RiskLevel.SEVERE
    assert classify(weather(wind=20, gust=62), 35_000)[0] == RiskLevel.NO_TRAVEL


def test_calm_weather_is_low_everywhere():
    level, factors = classify(weather(), LIGHT_LOAD)
    assert level == RiskLevel.LOW
    assert set(factors.values()) == {RiskLevel.LOW}
