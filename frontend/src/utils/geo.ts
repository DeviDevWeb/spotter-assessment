import type { LatLon } from '../types';

const EARTH_RADIUS_MILES = 3958.8;

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

// Distance between two points in a straight line over a sphere
const haversineMiles = ([lon1, lat1]: [number, number], [lon2, lat2]: [number, number]) => {
    const dLat = toRadians(lat2 - lat1);
    const dLon = toRadians(lon2 - lon1);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * EARTH_RADIUS_MILES * Math.asin(Math.sqrt(h));
};

// Distance from the start of the line to each vertex
export const cumulativeMiles = (line: [number, number][]) => {
    const totals = [0];
    for (let i = 1; i < line.length; i++) {
        totals.push(totals[i - 1] + haversineMiles(line[i - 1], line[i]));
    }
    return totals;
};

// Point at a fraction (0..1) of the line's length
export const pointAlong = (line: [number, number][], cumulative: number[], fraction: number): LatLon => {
    const target = Math.min(Math.max(fraction, 0), 1) * cumulative[cumulative.length - 1];
    let i = 0;
    while (i < line.length - 2 && cumulative[i + 1] < target) i++;

    const segment = cumulative[i + 1] - cumulative[i];
    const t = segment > 0 ? (target - cumulative[i]) / segment : 0;
    const [lon1, lat1] = line[i];
    const [lon2, lat2] = line[Math.min(i + 1, line.length - 1)];
    return { lat: lat1 + (lat2 - lat1) * t, lon: lon1 + (lon2 - lon1) * t };
};
