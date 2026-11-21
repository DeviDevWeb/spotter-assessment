import { useEffect, useMemo, useRef, useState } from 'react';
import Map, { Layer, Marker, NavigationControl, Popup, Source } from 'react-map-gl/maplibre';
import type { MapLayerMouseEvent, MapRef } from 'react-map-gl/maplibre';
import type { ExpressionSpecification } from 'maplibre-gl';
import { motion } from 'motion/react';
import { FiTruck } from 'react-icons/fi';
import { WiRain, WiSnow, WiStrongWind, WiTime4 } from 'react-icons/wi';
import type { FeatureCollection, LineString, Point } from 'geojson';
import type { Checkpoint, LatLon, PlaceField, RiskFactor, TripPlan } from '../types';
import { formatDateTime } from '../utils/format';
import { cumulativeMiles, pointAlong } from '../utils/geo';
import { prepareHeatmap, renderHeatmapHour } from '../utils/heatmap';
import { MAP_STYLE } from '../utils/map';
import { RISK_COLORS, RISK_LABELS, RISK_LEVELS, RISK_TEXT_COLORS } from '../utils/risk';

// Centered on the continental US
const INITIAL_VIEW = { longitude: -98.5, latitude: 39.8, zoom: 3.5 };

const SELECTED_ROUTE_COLOR = '#1f6feb';
const OTHER_ROUTE_COLOR = '#8a8f98';
const DESTINATION_COLOR = '#222222';
// Clicks are caught by invisible layers bigger than what's drawn, so lines and dots are easy to hit
const INTERACTIVE_LAYERS = ['checkpoints-hit', 'routes-hit'];
const ROUTE_HIT_WIDTH = 24;
const CHECKPOINT_HIT_RADIUS = 16;
const HOUR_MS = 60 * 60 * 1000;

const POPUP_ROW = 'flex items-center gap-1 [&_svg]:shrink-0 [&_svg]:text-xl';
const CALM_ROW = `${POPUP_ROW} [&_svg]:text-brand`;

// Checkpoint fill color by its "risk" property
const RISK_COLOR_EXPRESSION = [
    'match',
    ['get', 'risk'],
    ...RISK_LEVELS.flatMap((level) => [level, RISK_COLORS[level]]),
    '#999999',
] as unknown as ExpressionSpecification;

interface Props {
    plan: TripPlan | null;
    selectedId: string | null;
    onSelect: (id: string) => void;
    forecastHour: number;
    showHeatmap: boolean;
    originPoint: LatLon | null;
    destinationPoint: LatLon | null;
    pickTarget: PlaceField | null;
    onPick: (point: LatLon) => void;
}

// Routes (selected one highlighted), risk-colored checkpoints, corridor heatmap for the chosen
// hour, the truck's position at that hour, and picking origin / destination by clicking
const RouteMap = ({ plan, selectedId, onSelect, forecastHour, showHeatmap, originPoint, destinationPoint, pickTarget, onPick }: Props) => {
    const mapRef = useRef<MapRef>(null);
    const [popup, setPopup] = useState<Checkpoint | null>(null);
    const [hovering, setHovering] = useState(false);

    const selectedRoute = useMemo(() => plan?.routes.find((route) => route.id === selectedId) ?? null, [plan, selectedId]);

    // Only shown while its checkpoint is on the selected route, so it disappears with a new plan or route
    const popupCheckpoint = popup && selectedRoute?.checkpoints.includes(popup) ? popup : null;

    // A popup row raising the risk is colored by its level, icon included (with the level as tooltip). Calm rows stay plain
    const factorRow = (factor: RiskFactor) => {
        const level = popupCheckpoint?.risk_factors[factor] ?? 'LOW';
        return level === 'LOW'
            ? { className: CALM_ROW }
            : { className: `${POPUP_ROW} font-semibold`, style: { color: RISK_TEXT_COLORS[level] }, title: RISK_LABELS[level] };
    };

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
            features: (selectedRoute?.checkpoints ?? []).map((cp, index) => ({
                type: 'Feature',
                properties: { index, risk: cp.risk },
                geometry: { type: 'Point', coordinates: [cp.lon, cp.lat] },
            })),
        }),
        [selectedRoute]
    );

    // Heatmap image for the slider's hour. The pixel lookup is built once per plan, so drawing an
    // hour is a single quick pass over the pixels
    const heatmapRaster = useMemo(() => (plan ? prepareHeatmap(plan.heatmap) : null), [plan]);
    const heatmapUrl = useMemo(
        () => (plan && heatmapRaster ? renderHeatmapHour(heatmapRaster, plan.heatmap.values, forecastHour) : null),
        [plan, heatmapRaster, forecastHour]
    );

    // Truck position on the selected route at the slider's time (constant average speed)
    const routeCumulative = useMemo(() => (selectedRoute ? cumulativeMiles(selectedRoute.geometry) : null), [selectedRoute]);
    const truckPosition = useMemo(() => {
        if (!plan || !selectedRoute || !routeCumulative) return null;
        // Hour 0 is departure rounded to the hour, so measure from the real departure time
        const shownTime = new Date(plan.heatmap.start).getTime() + forecastHour * HOUR_MS;
        const elapsedSeconds = (shownTime - new Date(plan.departure).getTime()) / 1000;
        return pointAlong(selectedRoute.geometry, routeCumulative, elapsedSeconds / selectedRoute.duration_seconds);
    }, [plan, selectedRoute, routeCumulative, forecastHour]);

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
            { padding: 60, duration: 800 }
        );
    }, [plan]);

    // Picking wins. Otherwise the topmost feature: checkpoint opens its popup, route line selects it
    const handleClick = (e: MapLayerMouseEvent) => {
        if (pickTarget) {
            onPick({ lat: e.lngLat.lat, lon: e.lngLat.lng });
            return;
        }

        const feature = e.features?.[0];
        if (!feature) {
            setPopup(null);
        } else if (feature.layer.id === 'checkpoints-hit') {
            setPopup(selectedRoute?.checkpoints[feature.properties?.index] ?? null);
        } else {
            onSelect(feature.properties?.id);
        }
    };

    const cursor = pickTarget ? 'crosshair' : hovering ? 'pointer' : '';

    return (
        <Map
            ref={mapRef}
            initialViewState={INITIAL_VIEW}
            mapStyle={MAP_STYLE}
            style={{ width: '100%', height: '100%' }}
            interactiveLayerIds={INTERACTIVE_LAYERS}
            cursor={cursor}
            onMouseEnter={() => setHovering(true)}
            onMouseLeave={() => setHovering(false)}
            onClick={handleClick}
        >
            <NavigationControl position="top-right" />

            {heatmapRaster && heatmapUrl && (
                <Source id="heatmap" type="image" url={heatmapUrl} coordinates={heatmapRaster.coordinates}>
                    {/* beforeId keeps it under the routes and checkpoints even though it mounts later */}
                    <Layer
                        id="heatmap"
                        type="raster"
                        beforeId="routes-other"
                        layout={{ visibility: showHeatmap ? 'visible' : 'none' }}
                        paint={{ 'raster-resampling': 'linear', 'raster-fade-duration': 0 }}
                    />
                </Source>
            )}

            <Source id="routes" type="geojson" data={routesData}>
                <Layer
                    id="routes-other"
                    type="line"
                    filter={['!=', ['get', 'id'], selectedId ?? '']}
                    layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                    paint={{ 'line-color': OTHER_ROUTE_COLOR, 'line-width': 5, 'line-opacity': 0.8 }}
                />
                <Layer
                    id="routes-selected"
                    type="line"
                    filter={['==', ['get', 'id'], selectedId ?? '']}
                    layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                    paint={{ 'line-color': SELECTED_ROUTE_COLOR, 'line-width': 7 }}
                />
                {/* Invisible, much wider copy of every route that catches clicks near the line */}
                <Layer
                    id="routes-hit"
                    type="line"
                    layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                    paint={{ 'line-color': '#000000', 'line-width': ROUTE_HIT_WIDTH, 'line-opacity': 0 }}
                />
            </Source>

            <Source id="checkpoints" type="geojson" data={checkpointsData}>
                <Layer
                    id="checkpoints"
                    type="circle"
                    paint={{
                        'circle-radius': 7,
                        'circle-color': RISK_COLOR_EXPRESSION,
                        'circle-stroke-color': '#ffffff',
                        'circle-stroke-width': 2,
                    }}
                />
                {/* Invisible larger circle around each checkpoint, declared last so it wins over routes */}
                <Layer id="checkpoints-hit" type="circle" paint={{ 'circle-radius': CHECKPOINT_HIT_RADIUS, 'circle-opacity': 0 }} />
            </Source>

            {originPoint && <Marker longitude={originPoint.lon} latitude={originPoint.lat} color={SELECTED_ROUTE_COLOR} />}
            {destinationPoint && <Marker longitude={destinationPoint.lon} latitude={destinationPoint.lat} color={DESTINATION_COLOR} />}

            {truckPosition && (
                <Marker longitude={truckPosition.lon} latitude={truckPosition.lat}>
                    <div
                        className="size-[18px] rounded-full border-3 border-white bg-[#111827] shadow-[0_0_0_2px_#1f6feb]"
                        title={`Truck at departure +${forecastHour}h`}
                    />
                </Marker>
            )}

            {popupCheckpoint && (
                <Popup
                    longitude={popupCheckpoint.lon}
                    latitude={popupCheckpoint.lat}
                    closeOnClick={false}
                    onClose={() => setPopup(null)}
                    maxWidth="280px"
                    className="checkpoint-popup-container"
                >
                    {/* key restarts the pop animation for every checkpoint clicked */}
                    <motion.div
                        key={`${popupCheckpoint.lat},${popupCheckpoint.lon}`}
                        className="flex flex-col gap-1 rounded-lg bg-white px-3.5 py-3 text-[0.8rem] shadow-[0_2px_10px_rgba(0,0,0,0.18)]"
                        initial={{ opacity: 0, scale: 0.85 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 22 }}
                    >
                        <strong className="pr-6">
                            Mile {Math.round(popupCheckpoint.distance_miles)} ·{' '}
                            <span style={{ color: RISK_TEXT_COLORS[popupCheckpoint.risk] }}>{RISK_LABELS[popupCheckpoint.risk]}</span>
                        </strong>
                        <div className={CALM_ROW}>
                            <WiTime4 /> ETA {formatDateTime(popupCheckpoint.eta)}
                        </div>
                        <div {...factorRow('wind')}>
                            <WiStrongWind /> {popupCheckpoint.weather.wind_mph.toFixed(0)} mph, gusts {popupCheckpoint.weather.gust_mph.toFixed(0)} mph
                        </div>
                        <div {...factorRow('rain')}>
                            <WiRain /> {popupCheckpoint.weather.rain_in_per_hr.toFixed(2)} in/hr rain
                        </div>
                        <div {...factorRow('snow')}>
                            <WiSnow /> {popupCheckpoint.weather.snow_in_per_hr.toFixed(2)} in/hr snow
                        </div>
                        {popupCheckpoint.risk_factors.load !== 'LOW' && (
                            <div {...factorRow('load')}>
                                <FiTruck /> Load too heavy for this wind
                            </div>
                        )}
                    </motion.div>
                </Popup>
            )}
        </Map>
    );
};

export default RouteMap;
