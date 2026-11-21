import type { RiskLevel } from '../types';

// Lowest to highest
export const RISK_LEVELS: RiskLevel[] = ['LOW', 'MODERATE', 'HIGH', 'SEVERE', 'NO_TRAVEL'];

export const RISK_LABELS: Record<RiskLevel, string> = {
    LOW: 'Low',
    MODERATE: 'Moderate',
    HIGH: 'High',
    SEVERE: 'Severe',
    NO_TRAVEL: 'No Travel',
};

// Fills: map dots, pills, heatmap, legend
export const RISK_COLORS: Record<RiskLevel, string> = {
    LOW: '#2e9e44',
    MODERATE: '#e0b000',
    HIGH: '#f07800',
    SEVERE: '#d62828',
    NO_TRAVEL: '#6a0d83',
};

// Darker shades of the same colors for text on white, all around 5:1 contrast or better
export const RISK_TEXT_COLORS: Record<RiskLevel, string> = {
    LOW: '#1e7b34',
    MODERATE: '#8a6100',
    HIGH: '#b45309',
    SEVERE: '#b91c1c',
    NO_TRAVEL: '#6a0d83',
};
