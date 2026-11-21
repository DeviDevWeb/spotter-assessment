import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { FiLogOut } from 'react-icons/fi';
import { WiDaySunny } from 'react-icons/wi';
import { planTrip } from '../api/client';
import type { LatLon, PlaceField, PlaceValue, TripPlan, TripRequest, User } from '../types';
import { formatLatLon } from '../utils/format';
import ForecastSlider from './ForecastSlider';
import RouteList from './RouteList';
import RouteMap from './RouteMap';
import TripForm from './TripForm';

const EMPTY_PLACE: PlaceValue = { text: '', point: null };

interface Props {
    user: User;
    onLogout: () => void;
}

// Holds the trip plan, form places and map state, sidebar on the left and map on the right.
// While selecting a spot on the map everything else is hidden
const Planner = ({ user, onLogout }: Props) => {
    const [plan, setPlan] = useState<TripPlan | null>(null);
    // Bumped for every new plan so the route cards animate in again
    const [planCount, setPlanCount] = useState(0);
    // Bumped on reset so the form remounts with its default departure and load
    const [formKey, setFormKey] = useState(0);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [places, setPlaces] = useState<Record<PlaceField, PlaceValue>>({ origin: EMPTY_PLACE, destination: EMPTY_PLACE });
    const [pickTarget, setPickTarget] = useState<PlaceField | null>(null);

    const [forecastHour, setForecastHour] = useState(0);
    const [showHeatmap, setShowHeatmap] = useState(true);

    const handlePlaceChange = (field: PlaceField, value: PlaceValue) => setPlaces((prev) => ({ ...prev, [field]: value }));

    // A map click fills the field being picked and brings the UI back
    const handlePick = (point: LatLon) => {
        if (!pickTarget) return;
        handlePlaceChange(pickTarget, { text: formatLatLon(point), point });
        setPickTarget(null);
    };

    useEffect(() => {
        if (!pickTarget) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setPickTarget(null);
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [pickTarget]);

    // Fetches the routes and preselects the recommended one
    const handleSubmit = async (request: TripRequest) => {
        setLoading(true);
        setError(null);
        try {
            const result = await planTrip(request);
            setPlan(result);
            setPlanCount((count) => count + 1);
            setSelectedId(result.recommended_route_id);
            setForecastHour(0);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setLoading(false);
        }
    };

    // Back to a clean slate: no plan, empty form, default slider. The map keeps its position
    const handleReset = () => {
        setPlan(null);
        setSelectedId(null);
        setError(null);
        setPlaces({ origin: EMPTY_PLACE, destination: EMPTY_PLACE });
        setPickTarget(null);
        setForecastHour(0);
        setShowHeatmap(true);
        setFormKey((key) => key + 1);
    };

    // Markers follow the chosen points in the fields, else the planned places
    const originPoint = places.origin.point ?? plan?.origin ?? null;
    const destinationPoint = places.destination.point ?? plan?.destination ?? null;

    // Constant average speed, same as the checkpoint ETAs
    const selectedRoute = plan?.routes.find((route) => route.id === selectedId) ?? null;
    const arrival = plan && selectedRoute ? new Date(new Date(plan.departure).getTime() + selectedRoute.duration_seconds * 1000) : null;

    return (
        <div
            className={`grid h-full ${pickTarget ? 'grid-cols-1 grid-rows-1' : 'grid-rows-[auto_60vh] md:grid-cols-[380px_1fr] md:grid-rows-none'}`}
        >
            <aside className={`flex-col gap-4 overflow-y-auto p-4 md:border-r md:border-line ${pickTarget ? 'hidden' : 'flex'}`}>
                <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 font-semibold">
                        <span className="flex size-7 items-center justify-center rounded-full bg-brand text-xs text-white">{user.username[0].toUpperCase()}</span>
                        {user.username}
                    </span>
                    <motion.button type="button" className="btn-ghost hover:border-danger hover:text-danger" onClick={onLogout} whileTap={{ scale: 0.94 }}>
                        <FiLogOut />
                        Log out
                    </motion.button>
                </div>
                <TripForm
                    key={formKey}
                    origin={places.origin}
                    destination={places.destination}
                    onPlaceChange={handlePlaceChange}
                    onSelectOnMap={setPickTarget}
                    onSubmit={handleSubmit}
                    onReset={handleReset}
                    loading={loading}
                />
                {error && (
                    <motion.p key={error} className="alert-error" role="alert" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}>
                        {error}
                    </motion.p>
                )}
                {plan && (
                    <p className="text-[0.8rem] text-muted">
                        <strong>From</strong> {plan.origin.name}
                        <br />
                        <strong>To</strong> {plan.destination.name}
                    </p>
                )}
                <RouteList
                    key={planCount}
                    routes={plan?.routes ?? []}
                    recommendedId={plan?.recommended_route_id ?? null}
                    recommendationReason={plan?.recommendation_reason ?? null}
                    selectedId={selectedId}
                    onSelect={setSelectedId}
                />
            </aside>
            <main className="relative">
                <RouteMap
                    plan={plan}
                    selectedId={selectedId}
                    onSelect={setSelectedId}
                    forecastHour={forecastHour}
                    showHeatmap={showHeatmap && !pickTarget}
                    originPoint={originPoint}
                    destinationPoint={destinationPoint}
                    pickTarget={pickTarget}
                    onPick={handlePick}
                />
                <AnimatePresence>
                    {loading && (
                        <motion.div
                            className="absolute inset-0 z-5 flex flex-col items-center justify-center gap-3 bg-white/55 font-semibold"
                            role="status"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                        >
                            <motion.span
                                className="flex text-5xl text-[#f0a500]"
                                animate={{ rotate: 360 }}
                                transition={{ repeat: Infinity, duration: 2.5, ease: 'linear' }}
                            >
                                <WiDaySunny />
                            </motion.span>
                            <span>Finding routes and checking the weather…</span>
                        </motion.div>
                    )}
                </AnimatePresence>
                {pickTarget && (
                    // Centered with auto margins, not a transform, because the drop-in animation sets transform
                    <motion.div
                        className="absolute inset-x-0 top-3 mx-auto flex w-max items-center gap-3 rounded-full bg-[#111827] py-2 pr-2 pl-4 text-sm whitespace-nowrap text-white shadow-[0_2px_8px_rgba(0,0,0,0.25)]"
                        initial={{ opacity: 0, y: -12 }}
                        animate={{ opacity: 1, y: 0 }}
                    >
                        <span>Click the map to set the {pickTarget}</span>
                        <motion.button
                            type="button"
                            className="cursor-pointer rounded-full bg-white px-3 py-1.5 font-semibold text-[#111827]"
                            onClick={() => setPickTarget(null)}
                            whileTap={{ scale: 0.92 }}
                        >
                            Cancel
                        </motion.button>
                    </motion.div>
                )}
                {plan && !pickTarget && (
                    <ForecastSlider
                        start={plan.heatmap.start}
                        maxHour={plan.heatmap.hours}
                        hour={forecastHour}
                        onChange={setForecastHour}
                        arrival={arrival}
                        showHeatmap={showHeatmap}
                        onToggleHeatmap={setShowHeatmap}
                    />
                )}
            </main>
        </div>
    );
};

export default Planner;
