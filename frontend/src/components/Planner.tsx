import { useState } from 'react';
import { motion } from 'motion/react';
import { FiLogOut } from 'react-icons/fi';
import { planTrip } from '../api/client';
import type { PlaceField, PlaceValue, TripPlan, TripRequest, User } from '../types';
import RouteList from './RouteList';
import RouteMap from './RouteMap';
import TripForm from './TripForm';

const EMPTY_PLACE: PlaceValue = { text: '', point: null };

interface Props {
    user: User;
    onLogout: () => void;
}

// Holds the trip plan and the form places, sidebar on the left and map on the right
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

    const handlePlaceChange = (field: PlaceField, value: PlaceValue) => setPlaces((prev) => ({ ...prev, [field]: value }));

    // Fetches the routes and preselects the recommended one
    const handleSubmit = async (request: TripRequest) => {
        setLoading(true);
        setError(null);
        try {
            const result = await planTrip(request);
            setPlan(result);
            setPlanCount((count) => count + 1);
            setSelectedId(result.recommended_route_id);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setLoading(false);
        }
    };

    // Back to a clean slate: no plan, empty form
    const handleReset = () => {
        setPlan(null);
        setSelectedId(null);
        setError(null);
        setPlaces({ origin: EMPTY_PLACE, destination: EMPTY_PLACE });
        setFormKey((key) => key + 1);
    };

    return (
        <div className="grid h-full grid-rows-[auto_60vh] md:grid-cols-[380px_1fr] md:grid-rows-none">
            <aside className="flex flex-col gap-4 overflow-y-auto p-4 md:border-r md:border-line">
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
                <RouteMap plan={plan} selectedId={selectedId} onSelect={setSelectedId} />
            </main>
        </div>
    );
};

export default Planner;
