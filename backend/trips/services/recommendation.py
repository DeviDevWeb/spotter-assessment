from itertools import pairwise

from ..domain import Checkpoint, RiskLevel, RouteOption, RouteSummary

# Ranking (in order): fewest No Travel miles, fewest Severe miles, fewest High miles,
# lowest average risk, shortest travel time.

# Miles are compared at 0.1 mi so float noise doesn't decide between routes
MILES_PRECISION = 1


def _risk(checkpoint: Checkpoint) -> RiskLevel:
    if checkpoint.risk is None:
        raise ValueError('Checkpoint risk must be classified before summarizing')
    return checkpoint.risk


# Each stretch between two checkpoints counts as the worse of its two ends
def summarize(route: RouteOption) -> RouteSummary:
    miles = {level: 0.0 for level in RiskLevel}
    weighted = 0.0
    checkpoints = route.checkpoints

    for a, b in pairwise(checkpoints):
        length = b.distance_miles - a.distance_miles
        level = max(_risk(a), _risk(b))
        miles[level] += length
        weighted += length * level

    total = sum(miles.values())
    levels = [_risk(cp) for cp in checkpoints]

    return RouteSummary(
        route_id=route.id,
        no_travel_miles=miles[RiskLevel.NO_TRAVEL],
        severe_miles=miles[RiskLevel.SEVERE],
        high_miles=miles[RiskLevel.HIGH],
        average_risk=weighted / total if total else float(max(levels, default=0)),
        worst_risk=max(levels, default=RiskLevel.LOW),
        duration_seconds=route.duration_seconds,
    )


def ranking_key(summary: RouteSummary) -> tuple:
    return (
        round(summary.no_travel_miles, MILES_PRECISION),
        round(summary.severe_miles, MILES_PRECISION),
        round(summary.high_miles, MILES_PRECISION),
        round(summary.average_risk, 3),
        summary.duration_seconds,
    )


def recommend(summaries: list[RouteSummary]) -> str:
    return min(summaries, key=ranking_key).route_id


########################################
##############Explanation###############
########################################

# (summary field, label) for the risk criteria, in ranking order
MILE_CRITERIA = [
    ('no_travel_miles', 'No Travel'),
    ('severe_miles', 'Severe'),
    ('high_miles', 'High'),
]


def _format_minutes(seconds: float) -> str:
    minutes = round(seconds / 60)
    return f'{minutes // 60}h {minutes % 60}m' if minutes >= 60 else f'{minutes} min'


# One sentence on why the recommended route beats the runner-up: the first ranking
# criterion where it's strictly better
def explain(summaries: list[RouteSummary]) -> str:
    ranked = sorted(summaries, key=ranking_key)
    best = ranked[0]
    if len(ranked) == 1:
        return 'Only route found'

    runner = ranked[1]
    best_key, runner_key = ranking_key(best), ranking_key(runner)

    for i, (field, label) in enumerate(MILE_CRITERIA):
        if best_key[i] < runner_key[i]:
            ours, theirs = getattr(best, field), getattr(runner, field)
            if ours == 0:
                return f'No {label} miles, route {runner.route_id} has {theirs:.0f}'
            return f'Fewest {label} miles: {ours:.0f} vs {theirs:.0f} on route {runner.route_id}'

    if best_key[3] < runner_key[3]:
        return f'Lowest average risk: {best.average_risk:.2f} vs {runner.average_risk:.2f} on route {runner.route_id}'

    faster = runner.duration_seconds - best.duration_seconds
    if faster > 0:
        return f'Same weather risk as route {runner.route_id}, {_format_minutes(faster)} faster'
    return f'Same weather risk and time as route {runner.route_id}'
