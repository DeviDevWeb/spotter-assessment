import { motion } from 'motion/react';
import { FiFlag } from 'react-icons/fi';
import { WiTime4 } from 'react-icons/wi';
import { formatDateTime } from '../utils/format';
import { RISK_COLORS, RISK_LABELS, RISK_LEVELS } from '../utils/risk';

const HOUR_MS = 60 * 60 * 1000;

// Native track hidden, the thumb restyled so it lines up with the drawn track below it
const RANGE_INPUT =
    'absolute inset-0 w-full cursor-pointer appearance-none bg-transparent focus-visible:outline-none ' +
    '[&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full ' +
    '[&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-brand ' +
    '[&::-webkit-slider-thumb]:shadow-[0_1px_3px_rgba(0,0,0,0.3)] focus-visible:[&::-webkit-slider-thumb]:ring-3 ' +
    'focus-visible:[&::-webkit-slider-thumb]:ring-brand/30 ' +
    '[&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 ' +
    '[&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-brand [&::-moz-range-thumb]:shadow-[0_1px_3px_rgba(0,0,0,0.3)] ' +
    '[&::-moz-range-track]:bg-transparent';

interface Props {
    start: string; // hour 0, the departure
    maxHour: number;
    hour: number;
    onChange: (hour: number) => void;
    arrival: Date | null; // selected route's arrival
    showHeatmap: boolean;
    onToggleHeatmap: (show: boolean) => void;
}

// Picks the forecast hour (0-48 from departure) shown by the heatmap and the truck marker. The
// track marks the selected route's arrival: hours after it are striped, the truck waits at the destination
const ForecastSlider = ({ start, maxHour, hour, onChange, arrival, showHeatmap, onToggleHeatmap }: Props) => {
    const startMs = new Date(start).getTime();
    const time = new Date(startMs + hour * HOUR_MS);

    const arrivalHour = arrival ? (arrival.getTime() - startMs) / HOUR_MS : null;
    // Arrival past the last hour leaves the whole track as driving
    const arrivalPercent = arrivalHour === null ? 100 : Math.min(Math.max(arrivalHour / maxHour, 0), 1) * 100;
    const arrivalShown = arrivalHour !== null && arrivalHour <= maxHour;
    const arrived = arrivalHour !== null && hour >= arrivalHour;

    return (
        <motion.div
            className="absolute inset-x-3 bottom-7 mx-auto flex max-w-[560px] flex-col gap-1.5 rounded-lg bg-white/95 px-3.5 py-2.5 text-sm shadow-[0_2px_8px_rgba(0,0,0,0.15)]"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 26 }}
        >
            <div className="flex flex-wrap items-center justify-between gap-2">
                <strong className="flex items-center gap-1 [&_svg]:shrink-0 [&_svg]:text-xl [&_svg]:text-brand">
                    <WiTime4 />
                    Departure +{hour}h · {formatDateTime(time)}
                </strong>
                {arrived && arrival && (
                    <span className="flex items-center gap-1 rounded-full bg-[#e7f5ea] px-2 py-0.5 text-xs font-semibold text-[#1e7b34]">
                        <FiFlag />
                        Arrived {formatDateTime(arrival)}
                    </span>
                )}
                <label className="flex cursor-pointer items-center gap-1">
                    <input type="checkbox" checked={showHeatmap} onChange={(e) => onToggleHeatmap(e.target.checked)} />
                    Heatmap
                </label>
            </div>

            <div className="relative h-4">
                {/* Inset by half the thumb width, the range the thumb's center actually covers */}
                <div className="absolute inset-x-2 top-1/2 flex h-1.5 -translate-y-1/2 overflow-hidden rounded-full">
                    <div className="h-full bg-brand/60" style={{ width: `${arrivalPercent}%` }} />
                    <div className="h-full flex-1 bg-[repeating-linear-gradient(45deg,#c8ced8_0_3px,#eef0f3_3px_6px)]" />
                </div>
                {arrivalShown && (
                    <div className="absolute inset-x-2 inset-y-0">
                        <div className="absolute inset-y-0 w-0.5 -translate-x-1/2 rounded-full bg-ink" style={{ left: `${arrivalPercent}%` }} />
                    </div>
                )}
                <input
                    type="range"
                    className={RANGE_INPUT}
                    min={0}
                    max={maxHour}
                    step={1}
                    value={hour}
                    onChange={(e) => onChange(Number(e.target.value))}
                    aria-label="Forecast hour"
                />
            </div>

            <div className="relative mx-2 h-4 text-[0.7rem] text-muted">
                {arrivalShown ? (
                    <span
                        className="absolute flex -translate-x-1/2 items-center gap-0.5 font-semibold whitespace-nowrap text-ink"
                        style={{ left: `${arrivalPercent}%` }}
                    >
                        <FiFlag />
                        Arrival
                    </span>
                ) : (
                    <span className="absolute right-0">Arrival after +{maxHour}h</span>
                )}
            </div>

            <div className="flex flex-wrap gap-2.5 text-xs">
                {RISK_LEVELS.map((level) => (
                    <span key={level} className="flex items-center gap-1">
                        <i className="inline-block size-2.5 rounded-full" style={{ background: RISK_COLORS[level] }} />
                        {RISK_LABELS[level]}
                    </span>
                ))}
            </div>
        </motion.div>
    );
};

export default ForecastSlider;
