from datetime import datetime, timezone

from trips.domain import Checkpoint, LatLon, RiskLevel, RouteOption, RouteSummary
from trips.services.recommendation import explain, recommend, summarize

NOW = datetime(2026, 1, 1, tzinfo=timezone.utc)


def route_with_risks(risks: list[RiskLevel], step_miles: float = 10) -> RouteOption:
    checkpoints = [
        Checkpoint(position=LatLon(0, 0), distance_miles=i * step_miles, eta=NOW, risk=risk)
        for i, risk in enumerate(risks)
    ]
    return RouteOption(
        id='A', geometry=[], distance_miles=step_miles * (len(risks) - 1), duration_seconds=3600, checkpoints=checkpoints
    )


def summary(route_id, no_travel=0.0, severe=0.0, high=0.0, average=0.0, duration=3600) -> RouteSummary:
    return RouteSummary(route_id, no_travel, severe, high, average, RiskLevel.LOW, duration)


# A stretch takes the worse risk of its two ends
def test_summarize_counts_miles_by_worst_end():
    result = summarize(route_with_risks([RiskLevel.LOW, RiskLevel.HIGH, RiskLevel.LOW, RiskLevel.SEVERE]))

    assert result.high_miles == 20
    assert result.severe_miles == 10
    assert result.no_travel_miles == 0
    assert result.average_risk == (2 + 2 + 3) / 3
    assert result.worst_risk == RiskLevel.SEVERE


# One case per ranking criterion, in priority order
def test_recommend_priority_order():
    assert recommend([summary('A', severe=5, duration=100), summary('B', high=500, duration=9999)]) == 'B'
    assert recommend([summary('A', high=20), summary('B', high=10, average=3)]) == 'B'
    assert recommend([summary('A', average=1.5, duration=100), summary('B', average=0.5, duration=200)]) == 'B'
    assert recommend([summary('A', duration=200), summary('B', duration=100)]) == 'B'


def test_no_travel_ranks_last():
    assert recommend([summary('A', no_travel=1), summary('B', severe=300)]) == 'B'


# The reason names the first criterion where the winner beats the runner-up
def test_explain():
    assert explain([summary('A')]) == 'Only route found'
    assert explain([summary('A', severe=35), summary('B', high=90)]) == 'No Severe miles, route A has 35'
    assert explain([summary('A', high=40), summary('B', high=12)]) == 'Fewest High miles: 12 vs 40 on route A'
    assert explain([summary('A', average=0.8), summary('B', average=0.3)]) == 'Lowest average risk: 0.30 vs 0.80 on route A'
    assert explain([summary('A', duration=7200), summary('B', duration=5400)]) == 'Same weather risk as route A, 30 min faster'
