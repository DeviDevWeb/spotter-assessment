from ..domain import RiskLevel, WeatherSample

# Weather and load risk classification

Threshold = tuple[RiskLevel, float, bool]

########################################
###########Weather thresholds###########
########################################

WIND_MPH_THRESHOLDS: list[Threshold] = [
    (RiskLevel.NO_TRAVEL, 55, True),
    (RiskLevel.SEVERE, 45, True),
    (RiskLevel.HIGH, 35, True),
    (RiskLevel.MODERATE, 25, True),
]

RAIN_IN_PER_HR_THRESHOLDS: list[Threshold] = [
    (RiskLevel.NO_TRAVEL, 1.00, False),
    (RiskLevel.SEVERE, 0.50, True),
    (RiskLevel.HIGH, 0.25, True),
    (RiskLevel.MODERATE, 0.10, True),
]

SNOW_IN_PER_HR_THRESHOLDS: list[Threshold] = [
    (RiskLevel.NO_TRAVEL, 3.0, False),
    (RiskLevel.SEVERE, 2.0, True),
    (RiskLevel.HIGH, 1.0, True),
    (RiskLevel.MODERATE, 0.5, True),
]

########################################
##############Load rules################
########################################

# (level, min wind mph inclusive, max wind mph exclusive, load lb it must exceed).
# >= 55 mph is already No Travel for any load through the wind thresholds
LOAD_RULES = [
    (RiskLevel.NO_TRAVEL, 45, 55, 30_000),
    (RiskLevel.SEVERE, 35, 45, 40_000),
]


def _level(value: float, thresholds: list[Threshold]) -> RiskLevel:
    for level, bound, inclusive in thresholds:
        if value > bound or (inclusive and value == bound):
            return level
    return RiskLevel.LOW


def _load_level(wind_mph: float, load_weight_lb: int) -> RiskLevel:
    for level, min_wind, max_wind, min_load in LOAD_RULES:
        if min_wind <= wind_mph < max_wind and load_weight_lb > min_load:
            return level
    return RiskLevel.LOW


########################################
#################Wind###################
########################################

# A gust counts like sustained wind - GUST_OFFSET_MPH

GUST_OFFSET_MPH = 17 # averaged from the US National Weather Service


def effective_wind_mph(weather: WeatherSample) -> float:
    return max(weather.wind_mph, weather.gust_mph - GUST_OFFSET_MPH)


# Level of each factor (wind, rain, snow, load) and the worst of them, which is the checkpoint's level
def classify(weather: WeatherSample, load_weight_lb: int) -> tuple[RiskLevel, dict[str, RiskLevel]]:
    wind = effective_wind_mph(weather)
    factors = {
        'wind': _level(wind, WIND_MPH_THRESHOLDS),
        'rain': _level(weather.rain_in_per_hr, RAIN_IN_PER_HR_THRESHOLDS),
        'snow': _level(weather.snow_in_per_hr, SNOW_IN_PER_HR_THRESHOLDS),
        'load': _load_level(wind, load_weight_lb),
    }
    return max(factors.values()), factors
