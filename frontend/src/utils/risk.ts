import type { RiskLevel } from '../types';

export const RISK_LABELS: Record<RiskLevel, string> = {
    LOW: 'Low',
    MODERATE: 'Moderate',
    HIGH: 'High',
    SEVERE: 'Severe',
    NO_TRAVEL: 'No Travel',
};

// Fills: map dots, pills
export const RISK_COLORS: Record<RiskLevel, string> = {
    LOW: '#2e9e44',
    MODERATE: '#e0b000',
    HIGH: '#f07800',
    SEVERE: '#d62828',
    NO_TRAVEL: '#6a0d83',
};
