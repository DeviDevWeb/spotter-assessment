// Mirrors the backend response shapes (trips/services/planner.py)

export type RiskLevel = 'LOW' | 'MODERATE' | 'HIGH' | 'SEVERE' | 'NO_TRAVEL';

export type RiskFactor = 'wind' | 'rain' | 'snow' | 'load';

export type PlaceField = 'origin' | 'destination';

export interface LatLon {
    lat: number;
    lon: number;
}

// What a place field holds: the visible text, and coordinates once a suggestion is chosen or "lat, lon" is typed
export interface PlaceValue {
    text: string;
    point: LatLon | null;
}

export interface User {
    id: number;
    username: string;
}

// What login / register return, and what's kept in localStorage
export interface Session {
    token: string;
    user: User;
}

export interface PlaceSuggestion extends LatLon {
    label: string;
}

////////////////////////////////////////
///////////////Requests/////////////////
////////////////////////////////////////

// origin / destination accept an address or "lat, lon", *_name labels chosen coordinates
export interface TripRequest {
    origin: string;
    destination: string;
    origin_name?: string;
    destination_name?: string;
    departure: string; // ISO 8601
    load_weight_lb: number;
}

////////////////////////////////////////
///////////////Responses////////////////
////////////////////////////////////////

export interface Place extends LatLon {
    name: string;
}

export interface WeatherSample {
    time: string;
    wind_mph: number; // sustained
    gust_mph: number;
    rain_in_per_hr: number;
    snow_in_per_hr: number;
}

export interface Checkpoint extends LatLon {
    distance_miles: number;
    eta: string;
    weather: WeatherSample;
    risk: RiskLevel; // worst of the factors
    risk_factors: Record<RiskFactor, RiskLevel>;
}

// Totals used to rank routes against each other
export interface RouteSummary {
    no_travel_miles: number;
    severe_miles: number;
    high_miles: number;
    average_risk: number; // 0 (Low) to 4 (No Travel), distance weighted
    worst_risk: RiskLevel;
}

export interface RouteOption {
    id: string;
    geometry: [number, number][]; // [lon, lat]
    distance_miles: number;
    duration_seconds: number;
    checkpoints: Checkpoint[];
    summary: RouteSummary;
}

export interface TripPlan {
    origin: Place;
    destination: Place;
    departure: string;
    routes: RouteOption[];
    recommended_route_id: string;
    recommendation_reason: string;
}
