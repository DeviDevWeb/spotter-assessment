import { motion } from 'motion/react';
import type { RouteOption } from '../types';
import { formatDuration, formatMiles } from '../utils/format';
import { RISK_COLORS, RISK_LABELS } from '../utils/risk';

interface Props {
    routes: RouteOption[];
    recommendedId: string | null;
    recommendationReason: string | null;
    selectedId: string | null;
    onSelect: (id: string) => void;
}

// Route summary cards, the recommended one gets a badge and the reason it won.
// Clicking a card selects it on the map. Cards slide in one after another for a new plan
const RouteList = ({ routes, recommendedId, recommendationReason, selectedId, onSelect }: Props) => {
    if (routes.length === 0) return null;

    return (
        <ul className="flex flex-col gap-2.5">
            {routes.map((route, index) => {
                const { summary } = route;
                return (
                    <motion.li
                        key={route.id}
                        initial={{ opacity: 0, x: -12 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.07 }}
                    >
                        <motion.button
                            type="button"
                            className={`w-full cursor-pointer rounded-lg border-2 bg-white p-3 text-left ${route.id === selectedId ? 'border-brand' : 'border-line'}`}
                            onClick={() => onSelect(route.id)}
                            whileTap={{ scale: 0.97 }}
                        >
                            <div className="flex items-center gap-2">
                                <strong>Route {route.id}</strong>
                                {route.id === recommendedId && <span className="rounded-full bg-brand-soft px-2 py-0.5 text-xs font-semibold text-brand">Recommended</span>}
                                <span className="ml-auto rounded-full px-2 py-0.5 text-xs font-semibold text-white" style={{ background: RISK_COLORS[summary.worst_risk] }}>
                                    {RISK_LABELS[summary.worst_risk]}
                                </span>
                            </div>
                            {route.id === recommendedId && recommendationReason && (
                                <div className="mt-1.5 text-[0.8rem] text-brand">{recommendationReason}</div>
                            )}
                            <div className="my-1.5 text-lg">
                                {formatMiles(route.distance_miles)} · {formatDuration(route.duration_seconds)}
                            </div>
                            <dl className="grid grid-cols-4 gap-1 text-xs [&_dd]:font-semibold [&_dt]:text-muted">
                                <div>
                                    <dt>No Travel</dt>
                                    <dd>{formatMiles(summary.no_travel_miles)}</dd>
                                </div>
                                <div>
                                    <dt>Severe</dt>
                                    <dd>{formatMiles(summary.severe_miles)}</dd>
                                </div>
                                <div>
                                    <dt>High</dt>
                                    <dd>{formatMiles(summary.high_miles)}</dd>
                                </div>
                                <div>
                                    <dt>Avg risk</dt>
                                    <dd>{summary.average_risk.toFixed(2)} / 4</dd>
                                </div>
                            </dl>
                        </motion.button>
                    </motion.li>
                );
            })}
        </ul>
    );
};

export default RouteList;
