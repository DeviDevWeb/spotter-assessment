import { useEffect, useId, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { FiMapPin } from 'react-icons/fi';
import { searchPlaces } from '../api/client';
import type { PlaceSuggestion, PlaceValue } from '../types';
import { parseLatLon } from '../utils/format';

const MIN_QUERY_LENGTH = 2;
const SEARCH_DELAY_MS = 250;

interface Props {
    label: string;
    placeholder: string;
    value: PlaceValue;
    onChange: (value: PlaceValue) => void;
    onSelectOnMap: () => void;
}

// Place field with a suggestion list while typing, and a button to pick the spot on the map
const PlaceInput = ({ label, placeholder, value, onChange, onSelectOnMap }: Props) => {
    const id = useId();
    const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
    const [open, setOpen] = useState(false);
    const [highlighted, setHighlighted] = useState(-1);
    // Only search for text the user typed, not for a suggestion they just chose
    const [typed, setTyped] = useState(false);

    const query = value.text.trim();
    const searchable = typed && query.length >= MIN_QUERY_LENGTH && !parseLatLon(query);

    // Waits for a pause in typing, and cancels the previous search when the text changes
    useEffect(() => {
        if (!searchable) return;

        const controller = new AbortController();
        const timer = setTimeout(() => {
            searchPlaces(query, controller.signal)
                .then((results) => {
                    setSuggestions(results);
                    setHighlighted(-1);
                })
                .catch(() => {
                    // aborted or offline, the field still works as free text
                });
        }, SEARCH_DELAY_MS);

        return () => {
            clearTimeout(timer);
            controller.abort();
        };
    }, [query, searchable]);

    const choose = (suggestion: PlaceSuggestion) => {
        onChange({ text: suggestion.label, point: { lat: suggestion.lat, lon: suggestion.lon } });
        setTyped(false);
        setOpen(false);
    };

    const showList = open && searchable && suggestions.length > 0;

    // Arrow keys move through the list, Enter picks, Escape closes
    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (!showList) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlighted((i) => (i + 1) % suggestions.length);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlighted((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
        } else if (e.key === 'Enter' && highlighted >= 0 && highlighted < suggestions.length) {
            e.preventDefault();
            choose(suggestions[highlighted]);
        } else if (e.key === 'Escape') {
            setOpen(false);
        }
    };

    return (
        <div className="field">
            <label htmlFor={id}>{label}</label>
            <div className="flex gap-1.5">
                <div className="relative min-w-0 flex-1">
                    <input
                        id={id}
                        className="input"
                        type="text"
                        required
                        autoComplete="off"
                        placeholder={placeholder}
                        value={value.text}
                        role="combobox"
                        aria-expanded={showList}
                        aria-controls={`${id}-list`}
                        onChange={(e) => {
                            onChange({ text: e.target.value, point: parseLatLon(e.target.value) });
                            setTyped(true);
                            setOpen(true);
                        }}
                        onKeyDown={handleKeyDown}
                        onFocus={() => setOpen(true)}
                        onBlur={() => setOpen(false)}
                    />
                    <AnimatePresence>
                        {showList && (
                            <motion.ul
                                id={`${id}-list`}
                                className="absolute inset-x-0 top-[calc(100%+4px)] z-10 rounded-md border border-input bg-white py-1 shadow-[0_4px_12px_rgba(0,0,0,0.12)]"
                                role="listbox"
                                initial={{ opacity: 0, y: -4 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -4 }}
                                transition={{ duration: 0.12 }}
                            >
                                {suggestions.map((suggestion, index) => (
                                    <li
                                        key={`${suggestion.lat},${suggestion.lon}`}
                                        role="option"
                                        aria-selected={index === highlighted}
                                        className={`cursor-pointer px-2.5 py-2 text-sm ${index === highlighted ? 'bg-brand-soft' : ''}`}
                                        // mousedown so the choice lands before the input's blur closes the list
                                        onMouseDown={(e) => {
                                            e.preventDefault();
                                            choose(suggestion);
                                        }}
                                        onMouseEnter={() => setHighlighted(index)}
                                    >
                                        {suggestion.label}
                                    </li>
                                ))}
                            </motion.ul>
                        )}
                    </AnimatePresence>
                </div>
                <motion.button
                    type="button"
                    className="flex shrink-0 cursor-pointer items-center gap-1 rounded-md bg-brand-soft px-2.5 text-[0.8rem] font-semibold text-brand transition-colors hover:bg-[#d6e4fd]"
                    onClick={onSelectOnMap}
                    title={`Select ${label.toLowerCase()} on the map`}
                    whileTap={{ scale: 0.92 }}
                >
                    <FiMapPin />
                    Select
                </motion.button>
            </div>
        </div>
    );
};

export default PlaceInput;
