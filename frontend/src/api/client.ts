import type { PlaceSuggestion, PreparedTrip, Session, TripPlan, TripRequest, User } from '../types';

// Base URL of the API, empty in dev so Vite's proxy handles /api
const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

////////////////////////////////////////
////////////////Session/////////////////
////////////////////////////////////////

const SESSION_KEY = 'session';

// Stored session, null when missing or storage is unavailable
export const getStoredSession = (): Session | null => {
    try {
        const raw = localStorage.getItem(SESSION_KEY);
        return raw ? (JSON.parse(raw) as Session) : null;
    } catch {
        return null;
    }
};

let token: string | null = getStoredSession()?.token ?? null;

const saveSession = (session: Session) => {
    token = session.token;
    try {
        localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } catch {
        // storage unavailable, the session only lives in memory for this tab
    }
};

const clearSession = () => {
    token = null;
    try {
        localStorage.removeItem(SESSION_KEY);
    } catch {
        // ignore
    }
};

// Called whenever the server rejects the token (expired / deleted)
let unauthorizedHandler: (() => void) | null = null;
export const setUnauthorizedHandler = (handler: (() => void) | null) => {
    unauthorizedHandler = handler;
};

////////////////////////////////////////
////////////////Requests////////////////
////////////////////////////////////////

// Turns a DRF error body ({detail} or {field: [messages]}) into one readable line
const readError = async (res: Response): Promise<string> => {
    try {
        const body = await res.json();
        if (typeof body.detail === 'string') return body.detail;
        return Object.entries(body)
            .map(([field, messages]) => {
                const text = ([] as unknown[]).concat(messages).join(' ');
                return field === 'non_field_errors' ? text : `${field.replace(/_/g, ' ')}: ${text}`;
            })
            .join('. ');
    } catch {
        return `Request failed (${res.status})`;
    }
};

const request = async <T,>(path: string, init?: RequestInit): Promise<T> => {
    let res: Response;
    try {
        res = await fetch(`${BASE_URL}${path}`, {
            ...init,
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Token ${token}` } : {}),
            },
        });
    } catch {
        throw new Error("Couldn't reach the server. Check your connection and try again.");
    }

    if (res.status === 401 && token) {
        clearSession();
        unauthorizedHandler?.();
    }
    if (!res.ok) {
        throw new Error(await readError(res));
    }
    return (res.status === 204 ? undefined : res.json()) as Promise<T>;
};

////////////////////////////////////////
////////////////Auth API////////////////
////////////////////////////////////////

export const login = async (username: string, password: string): Promise<User> => {
    const session = await request<Session>('/api/auth/login/', { method: 'POST', body: JSON.stringify({ username, password }) });
    saveSession(session);
    return session.user;
};

export const register = async (username: string, password: string): Promise<User> => {
    const session = await request<Session>('/api/auth/register/', { method: 'POST', body: JSON.stringify({ username, password }) });
    saveSession(session);
    return session.user;
};

// Server-side logout is best effort, the local session is cleared either way
export const logout = async () => {
    try {
        await request<void>('/api/auth/logout/', { method: 'POST' });
    } catch {
        // ignore
    }
    clearSession();
};

export const getMe = () => request<User>('/api/auth/me/');

////////////////////////////////////////
////////////////Trips API///////////////
////////////////////////////////////////

// Two backend requests with the forecasts fetched in between: the backend lists the forecast
// locations, the browser fetches them, the backend scores the routes
export const planTrip = async (body: TripRequest): Promise<TripPlan> => {
    const prepared = await request<PreparedTrip>('/api/trips/plan/', {
        method: 'POST',
        body: JSON.stringify(body),
    });
    const forecasts = await fetchForecasts(prepared.forecast);
    return request<TripPlan>(`/api/trips/plan/${prepared.plan_id}/weather/`, {
        method: 'POST',
        body: JSON.stringify({ forecasts }),
    });
};

////////////////////////////////////////
////////////////Forecasts///////////////
////////////////////////////////////////

// Open-Meteo's free tier is limited per IP, so the forecasts are fetched from the browser: every
// user gets their own quota instead of sharing the hosted backend's outbound IP with other apps
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';

// Locations per request, and requests in flight at once
const FORECAST_BATCH_SIZE = 50;
const FORECAST_PARALLEL = 4;

// Open-Meteo "hourly" objects in the same order as the requested locations, passed on to the backend as is
const fetchForecasts = async (forecast: PreparedTrip['forecast']): Promise<unknown[]> => {
    const batches: number[][] = [];
    for (let i = 0; i < forecast.latitudes.length; i += FORECAST_BATCH_SIZE) {
        batches.push(forecast.latitudes.slice(i, i + FORECAST_BATCH_SIZE).map((_, k) => i + k));
    }

    const results: unknown[][] = new Array(batches.length);
    let next = 0;
    const worker = async () => {
        while (next < batches.length) {
            const index = next++;
            results[index] = await fetchForecastBatch(forecast, batches[index]);
        }
    };
    await Promise.all(Array.from({ length: Math.min(FORECAST_PARALLEL, batches.length) }, worker));
    return results.flat();
};

const fetchForecastBatch = async (forecast: PreparedTrip['forecast'], indexes: number[]): Promise<unknown[]> => {
    const params = new URLSearchParams({
        latitude: indexes.map((i) => forecast.latitudes[i]).join(','),
        longitude: indexes.map((i) => forecast.longitudes[i]).join(','),
        hourly: forecast.hourly.join(','),
        wind_speed_unit: 'mph',
        precipitation_unit: 'inch',
        timezone: 'GMT',
        timeformat: 'unixtime',
        start_date: forecast.start_date,
        end_date: forecast.end_date,
    });

    let res: Response;
    try {
        res = await fetch(`${FORECAST_URL}?${params}`);
    } catch {
        throw new Error("Couldn't reach the weather service. Check your connection and try again.");
    }
    if (res.status === 429) {
        throw new Error('The weather service is rate limiting this browser, try again in a minute.');
    }

    let data: unknown;
    try {
        data = await res.json();
    } catch {
        throw new Error(`The weather service returned an error (${res.status})`);
    }
    if (!res.ok) {
        const reason = (data as { reason?: string } | null)?.reason;
        throw new Error(reason ? `Weather service error: ${reason}` : `The weather service returned an error (${res.status})`);
    }

    // A single location comes back as an object, several as a list
    const items = (Array.isArray(data) ? data : [data]) as { hourly?: unknown }[];
    if (items.length !== indexes.length || items.some((item) => !item?.hourly)) {
        throw new Error('Unexpected response from the weather service');
    }
    return items.map((item) => item.hourly);
};

////////////////////////////////////////
//////////////Place search//////////////
////////////////////////////////////////

// Open-Meteo's geocoding (cities and towns, no key, CORS enabled) for the suggestion list.
// Called straight from the browser so typing doesn't load our backend
const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const SUGGESTION_COUNT = 6;

interface GeocodingResult {
    id: number;
    name: string;
    admin1?: string;
    country?: string;
    latitude: number;
    longitude: number;
    population?: number;
}

const searchByName = async (name: string, count: number, signal: AbortSignal): Promise<GeocodingResult[]> => {
    const params = new URLSearchParams({ name, count: String(count), language: 'en', format: 'json' });
    const res = await fetch(`${GEOCODING_URL}?${params}`, { signal });
    if (!res.ok) return [];
    const body: { results?: GeocodingResult[] } = await res.json();
    return body.results ?? [];
};

// Lowercase letters only, accents removed: "São Paulo" -> "saopaulo"
const normalize = (text: string) => text.normalize('NFD').toLowerCase().replace(/[^a-z]/g, '');

// Regex that allows one extra letter after each letter of the text: "chcgo" -> /^c.?h.?c.?g.?o$/
const looseRegex = (text: string) => new RegExp('^' + normalize(text).split('').join('.?') + '$');

// Minor typos: the typed name is the real one with a few letters missing, or with a few extra
const isCloseMatch = (typed: string, name: string) => looseRegex(typed).test(normalize(name)) || looseRegex(name).test(normalize(typed));

// Exact matches plus places whose name is close to what was typed (same first 3 letters),
// biggest places first so "Dalas" suggests Dallas, TX
export const searchPlaces = async (query: string, signal: AbortSignal): Promise<PlaceSuggestion[]> => {
    const name = query.split(',')[0].trim(); // "Dallas, TX" -> "Dallas"
    const [exact, similar] = await Promise.all([
        searchByName(name, SUGGESTION_COUNT, signal),
        name.length >= 4 ? searchByName(name.slice(0, 3), 100, signal) : [],
    ]);

    const unique = new Map([...exact, ...similar.filter((result) => isCloseMatch(name, result.name))].map((result) => [result.id, result]));
    return [...unique.values()]
        .sort((a, b) => (b.population ?? 0) - (a.population ?? 0))
        .slice(0, SUGGESTION_COUNT)
        .map((result) => ({
            // "Dallas, Texas, United States", skipping a region that repeats the name
            label: [result.name, result.admin1 !== result.name ? result.admin1 : null, result.country].filter(Boolean).join(', '),
            lat: result.latitude,
            lon: result.longitude,
        }));
};
