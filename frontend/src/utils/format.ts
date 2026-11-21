import type { LatLon } from '../types';

export const formatMiles = (miles: number) => `${Math.round(miles).toLocaleString()} mi`;

export const formatDuration = (seconds: number) => {
    const totalMinutes = Math.round(seconds / 60);
    return `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`;
};

// Short local date/time, e.g. "Thu, Nov 19, 03:30 PM"
export const formatDateTime = (date: string | Date) =>
    new Date(date).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

// Value for <input type="datetime-local">, in the browser's local time
export const toDateTimeInputValue = (date: Date) => {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

// Start of the next hour, the default departure
export const nextHour = () => {
    const date = new Date();
    date.setHours(date.getHours() + 1, 0, 0, 0);
    return date;
};

////////////////////////////////////////
//////////////Coordinates///////////////
////////////////////////////////////////

// Same "lat, lon" format the backend accepts in origin / destination
export const formatLatLon = ({ lat, lon }: LatLon) => `${lat.toFixed(5)}, ${lon.toFixed(5)}`;

// Returns the coordinates if the text is "lat, lon", null for addresses
export const parseLatLon = (text: string): LatLon | null => {
    const match = text.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
    if (!match) return null;

    const lat = Number(match[1]);
    const lon = Number(match[2]);
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
    return { lat, lon };
};
