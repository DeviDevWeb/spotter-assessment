import { useEffect, useMemo, useRef } from 'react';
import Map, { Layer, Marker, NavigationControl, Source } from 'react-map-gl/maplibre';
import type { MapLayerMouseEvent, MapRef } from 'react-map-gl/maplibre';
import type { ExpressionSpecification } from 'maplibre-gl';
import type { FeatureCollection, LineString, Point } from 'geojson';
import type { TripPlan } from '../types';
import { RISK_COLORS } from '../utils/risk';

// Free OpenStreetMap vector tiles, no key needed
const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

// Centered on the continental US
const INITIAL_VIEW = { longitude: -98.5, latitude: 39.8, zoom: 3.5 };

const SELECTED_ROUTE_COLOR = '#1f6feb';
const OTHER_ROUTE_COLOR = '#8a8f98';

// Checkpoint fill color by its "risk" property
const RISK_COLOR_EXPRESSION = [
    'match',
    ['get', 'risk'],
    ...Object.entries(RISK_COLORS).flat(),
    '#999999',
] as unknown as ExpressionSpecification;

interface Props {
    plan: TripPlan | null;
    selectedId: string | null;
    onSelect: (id: string) => void;
}

// Routes (selected one highlighted) and the selected route's checkpoints colored by risk
const RouteMap = ({ plan, selectedId, onSelect }: Props) => {
    const mapRef = useRef<MapRef>(null);

    const selectedRoute = plan?.routes.find((route) => route.id === selectedId) ?? null;

    const routesData = useMemo<FeatureCollection<LineString>>(
        () => ({
            type: 'FeatureCollection',
            features: (plan?.routes ?? []).map((route) => ({
                type: 'Feature',
                properties: { id: route.id },
                geometry: { type: 'LineString', coordinates: route.geometry },
            })),
        }),
        [plan]
    );

    const checkpointsData = useMemo<FeatureCollection<Point>>(
        () => ({
            type: 'FeatureCollection',
            features: (selectedRoute?.checkpoints ?? []).map((cp) => ({
                type: 'Feature',
                properties: { risk: cp.risk },
                geometry: { type: 'Point', coordinates: [cp.lon, cp.lat] },
            })),
        }),
        [selectedRoute]
    );

    // Fit the map to every route whenever a new plan arrives
    useEffect(() => {
        const coordinates = plan?.routes.flatMap((route) => route.geometry) ?? [];
        if (coordinates.length === 0) return;

        const lons = coordinates.map(([lon]) => lon);
        const lats = coordinates.map(([, lat]) => lat);
        mapRef.current?.fitBounds(
            [
                [Math.min(...lons), Math.min(...lats)],
                [Math.max(...lons), Math.max(...lats)],
            ],
            { padding: 60 }
        );
    }, [plan]);

    // Clicking a route line selects it
    const handleClick = (e: MapLayerMouseEvent) => {
        const id = e.features?.[0]?.properties?.id;
        if (id) onSelect(id);
    };

    return (
        <Map
            ref={mapRef}
            initialViewState={INITIAL_VIEW}
            mapStyle={MAP_STYLE}
            interactiveLayerIds={['routes']}
            onClick={handleClick}
            style={{ width: '100%', height: '100%' }}
        >
            <NavigationControl position="top-right" />

            <Source id="routes" type="geojson" data={routesData}>
                <Layer
                    id="routes"
                    type="line"
                    layout={{ 'line-join': 'round', 'line-cap': 'round' }}
                    paint={{
                        'line-color': ['case', ['==', ['get', 'id'], selectedId ?? ''], SELECTED_ROUTE_COLOR, OTHER_ROUTE_COLOR],
                        'line-width': ['case', ['==', ['get', 'id'], selectedId ?? ''], 6, 4],
                    }}
                />
            </Source>

            <Source id="checkpoints" type="geojson" data={checkpointsData}>
                <Layer
                    id="checkpoints"
                    type="circle"
                    paint={{
                        'circle-radius': 5,
                        'circle-color': RISK_COLOR_EXPRESSION,
                        'circle-stroke-width': 1.5,
                        'circle-stroke-color': '#ffffff',
                    }}
                />
            </Source>

            {plan && <Marker longitude={plan.origin.lon} latitude={plan.origin.lat} color={SELECTED_ROUTE_COLOR} />}
            {plan && <Marker longitude={plan.destination.lon} latitude={plan.destination.lat} color="#222222" />}
        </Map>
    );
};

export default RouteMap;
