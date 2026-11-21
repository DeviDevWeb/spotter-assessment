import { useState } from 'react';
import type { FormEvent } from 'react';
import { motion } from 'motion/react';
import { FiRotateCcw } from 'react-icons/fi';
import type { PlaceField, PlaceValue, TripRequest } from '../types';
import { formatLatLon, nextHour, parseLatLon, toDateTimeInputValue } from '../utils/format';
import PlaceInput from './PlaceInput';

// Same limit as the backend (trips/serializers.py)
const MAX_DEPARTURE_HOURS = 48;
const HOUR_MS = 60 * 60 * 1000;

interface Props {
    origin: PlaceValue;
    destination: PlaceValue;
    onPlaceChange: (field: PlaceField, value: PlaceValue) => void;
    onSelectOnMap: (field: PlaceField) => void;
    onSubmit: (request: TripRequest) => void;
    onReset: () => void;
    loading: boolean;
}

// Chosen coordinates go as "lat, lon" with their label, free text goes as is for the backend to geocode
const toRequestPlace = (place: PlaceValue) => {
    if (!place.point) return { value: place.text.trim(), name: '' };
    return { value: formatLatLon(place.point), name: parseLatLon(place.text) ? '' : place.text.trim() };
};

const TripForm = ({ origin, destination, onPlaceChange, onSelectOnMap, onSubmit, onReset, loading }: Props) => {
    const [departure, setDeparture] = useState(() => toDateTimeInputValue(nextHour()));
    // Latest departure the picker offers, set when the form mounts (and again on Reset)
    const [maxDeparture] = useState(() => toDateTimeInputValue(new Date(Date.now() + MAX_DEPARTURE_HOURS * HOUR_MS)));
    const [loadWeight, setLoadWeight] = useState('40000');

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        const from = toRequestPlace(origin);
        const to = toRequestPlace(destination);
        onSubmit({
            origin: from.value,
            origin_name: from.name,
            destination: to.value,
            destination_name: to.name,
            // datetime-local is local time, the API gets UTC
            departure: new Date(departure).toISOString(),
            load_weight_lb: Number(loadWeight),
        });
    };

    return (
        <form className="flex flex-col gap-2.5" onSubmit={handleSubmit}>
            <div className="mb-1 flex items-center justify-between">
                <h2 className="text-xl font-bold">Plan a trip</h2>
                <motion.button type="button" className="btn-ghost" onClick={onReset} disabled={loading} whileTap={{ scale: 0.94 }}>
                    <FiRotateCcw />
                    Reset
                </motion.button>
            </div>

            <PlaceInput
                label="Origin"
                placeholder="Dallas, TX"
                value={origin}
                onChange={(value) => onPlaceChange('origin', value)}
                onSelectOnMap={() => onSelectOnMap('origin')}
            />
            <PlaceInput
                label="Destination"
                placeholder="Chicago, IL"
                value={destination}
                onChange={(value) => onPlaceChange('destination', value)}
                onSelectOnMap={() => onSelectOnMap('destination')}
            />

            <div className="grid grid-cols-2 gap-2.5">
                <div className="field">
                    <label htmlFor="departure">Departure</label>
                    <input
                        id="departure"
                        className="input"
                        type="datetime-local"
                        required
                        max={maxDeparture}
                        value={departure}
                        onChange={(e) => setDeparture(e.target.value)}
                    />
                </div>

                <div className="field">
                    <label htmlFor="load-weight">Load (lb)</label>
                    <input
                        id="load-weight"
                        className="input"
                        type="number"
                        required
                        min={0}
                        max={200000}
                        step={1000}
                        value={loadWeight}
                        onChange={(e) => setLoadWeight(e.target.value)}
                    />
                </div>
            </div>

            <motion.button type="submit" className="btn-primary" disabled={loading} whileTap={{ scale: 0.97 }}>
                {loading ? 'Planning…' : 'Find routes'}
            </motion.button>
        </form>
    );
};

export default TripForm;
