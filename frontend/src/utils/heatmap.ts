import type { Heatmap, RiskLevel } from '../types';
import { RISK_COLORS, RISK_LEVELS } from './risk';

// Turns the heatmap grid into a smooth image for a MapLibre image source. blended with bilinear interpolation.

const PIXELS_PER_CELL = 16;
const MAX_SIDE_PIXELS = 1024;

// Opacity by risk level: calm weather stays visible but light, risky weather stands out
const OPACITY_STOPS: [number, number][] = [
    [0, 0.12],
    [1, 0.45],
    [2, 0.65],
    [3, 0.75],
    [4, 0.82],
];

type Rgb = [number, number, number];

const hexToRgb = (hex: string): Rgb => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;

// RISK_LEVELS[i] is the color for level i
const COLOR_STOPS: [number, Rgb][] = RISK_LEVELS.map((level: RiskLevel, i) => [i, hexToRgb(RISK_COLORS[level])]);

const interpolate = <T extends number | Rgb>(stops: [number, T][], value: number): T => {
    if (value <= stops[0][0]) return stops[0][1];
    for (let i = 1; i < stops.length; i++) {
        const [x1, y1] = stops[i];
        if (value <= x1) {
            const [x0, y0] = stops[i - 1];
            const t = (value - x0) / (x1 - x0);
            if (typeof y0 === 'number') return (y0 + ((y1 as number) - y0) * t) as T;
            return (y0 as Rgb).map((c, k) => c + ((y1 as Rgb)[k] - c) * t) as T;
        }
    }
    return stops[stops.length - 1][1];
};

// Eases the weights so the grid's cell edges don't show as visible creases
const smoothstep = (t: number) => t * t * (3 - 2 * t);

// The map uses Web Mercator, where degrees of latitude get taller toward the poles. Image rows
// are placed by Mercator y (0 top, 1 bottom) so cells line up with the map at every latitude
const mercatorY = (lat: number) => 0.5 - Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) / (2 * Math.PI);
const latFromMercatorY = (y: number) => (360 / Math.PI) * Math.atan(Math.exp((0.5 - y) * 2 * Math.PI)) - 90;

export type ImageCorners = [[number, number], [number, number], [number, number], [number, number]];

export interface HeatmapRaster {
    width: number;
    height: number;
    coordinates: ImageCorners; // top-left, top-right, bottom-right, bottom-left
    neighbors: Int32Array; // 4 grid point indexes per pixel, -1 when there is no point
    weights: Float32Array; // matching bilinear weights
}

////////////////////////////////////////
/////////////Per plan setup/////////////
////////////////////////////////////////

export const prepareHeatmap = (heatmap: Heatmap): HeatmapRaster | null => {
    const { points, grid_degrees: grid } = heatmap;
    if (points.length === 0) return null;

    const lons = points.map(([lon]) => lon);
    const lats = points.map(([, lat]) => lat);
    const minLon = Math.min(...lons);
    const minLat = Math.min(...lats);
    const cols = Math.round((Math.max(...lons) - minLon) / grid) + 1;
    const rows = Math.round((Math.max(...lats) - minLat) / grid) + 1;

    const pointAt = new Int32Array(rows * cols).fill(-1);
    points.forEach(([lon, lat], i) => {
        pointAt[Math.round((lat - minLat) / grid) * cols + Math.round((lon - minLon) / grid)] = i;
    });

    // One full cell of padding so the corridor fades to nothing before the image edge
    const west = minLon - grid;
    const east = minLon + (cols - 1) * grid + grid;
    const south = minLat - grid;
    const north = minLat + (rows - 1) * grid + grid;

    const yTop = mercatorY(north);
    const yBottom = mercatorY(south);
    const width = Math.min(Math.ceil((cols + 2) * PIXELS_PER_CELL), MAX_SIDE_PIXELS);
    const aspect = (yBottom - yTop) / ((east - west) / 360);
    const height = Math.max(1, Math.min(Math.round(width * aspect), MAX_SIDE_PIXELS));

    const neighbors = new Int32Array(width * height * 4).fill(-1);
    const weights = new Float32Array(width * height * 4);

    const lookup = (row: number, col: number) => (row >= 0 && row < rows && col >= 0 && col < cols ? pointAt[row * cols + col] : -1);

    for (let py = 0; py < height; py++) {
        const lat = latFromMercatorY(yTop + ((py + 0.5) / height) * (yBottom - yTop));
        const rowF = (lat - minLat) / grid;
        const row0 = Math.floor(rowF);
        const tr = smoothstep(rowF - row0);

        for (let px = 0; px < width; px++) {
            const lon = west + ((px + 0.5) / width) * (east - west);
            const colF = (lon - minLon) / grid;
            const col0 = Math.floor(colF);
            const tc = smoothstep(colF - col0);

            const base = (py * width + px) * 4;
            const corners: [number, number, number][] = [
                [row0, col0, (1 - tr) * (1 - tc)],
                [row0, col0 + 1, (1 - tr) * tc],
                [row0 + 1, col0, tr * (1 - tc)],
                [row0 + 1, col0 + 1, tr * tc],
            ];
            corners.forEach(([row, col, weight], k) => {
                neighbors[base + k] = lookup(row, col);
                weights[base + k] = weight;
            });
        }
    }

    return {
        width,
        height,
        coordinates: [
            [west, north],
            [east, north],
            [east, south],
            [west, south],
        ],
        neighbors,
        weights,
    };
};

////////////////////////////////////////
//////////////Per hour draw/////////////
////////////////////////////////////////

// PNG data URL of the heatmap at one forecast hour
export const renderHeatmapHour = (raster: HeatmapRaster, values: number[][], hour: number): string => {
    const { width, height, neighbors, weights } = raster;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    const image = ctx.createImageData(width, height);
    const pixels = image.data;

    for (let p = 0; p < width * height; p++) {
        let coverage = 0;
        let weighted = 0;
        for (let k = 0; k < 4; k++) {
            const index = neighbors[p * 4 + k];
            if (index < 0) continue;
            const value = values[index][hour];
            if (value < 0) continue; // no forecast for that point
            coverage += weights[p * 4 + k];
            weighted += weights[p * 4 + k] * value;
        }
        if (coverage < 0.001) continue;

        const value = weighted / coverage;
        const [r, g, b] = interpolate(COLOR_STOPS, value);
        const o = p * 4;
        pixels[o] = r;
        pixels[o + 1] = g;
        pixels[o + 2] = b;
        // Coverage drops to 0 toward cells with no data, giving soft corridor edges
        pixels[o + 3] = Math.round(255 * interpolate(OPACITY_STOPS, value) * Math.min(coverage, 1));
    }

    ctx.putImageData(image, 0, 0);
    return canvas.toDataURL();
};
