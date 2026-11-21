import { useState } from 'react';
import type { FormEvent } from 'react';
import { motion } from 'motion/react';
import Map, { AttributionControl } from 'react-map-gl/maplibre';
import { login, register } from '../api/client';
import type { User } from '../types';
import { MAP_STYLE } from '../utils/map';

type Mode = 'login' | 'register';

// Highways of the central US, shown as a still background behind the login card
const BACKGROUND_VIEW = { longitude: -92, latitude: 38.5, zoom: 5.3 };

interface Props {
    onAuthenticated: (user: User) => void;
    notice: string | null;
}

// Login / registration form over a road map background
const AuthPage = ({ onAuthenticated, notice }: Props) => {
    const [mode, setMode] = useState<Mode>('login');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const isLogin = mode === 'login';

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
            const user = await (isLogin ? login : register)(username.trim(), password);
            onAuthenticated(user);
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setLoading(false);
        }
    };

    const switchMode = () => {
        setMode(isLogin ? 'register' : 'login');
        setError(null);
    };

    return (
        <div className="relative flex min-h-full items-center justify-center overflow-hidden bg-ink p-4">
            <div className="auth-map absolute inset-0" aria-hidden="true">
                {/* Credits always expanded (instead of behind an "i" button), as plain text in the corner */}
                <Map
                    initialViewState={BACKGROUND_VIEW}
                    mapStyle={MAP_STYLE}
                    interactive={false}
                    attributionControl={false}
                    style={{ width: '100%', height: '100%' }}
                >
                    <AttributionControl compact={false} position="bottom-right" />
                </Map>
            </div>
            {/* Darkens the map so the card stands out */}
            <div className="pointer-events-none absolute inset-0 bg-linear-135 from-[rgba(17,24,39,0.65)] to-[rgba(31,111,235,0.35)]" />
            <motion.form
                className="relative flex w-full max-w-[360px] flex-col gap-3 rounded-[10px] bg-white p-6 shadow-[0_8px_32px_rgba(0,0,0,0.3)]"
                onSubmit={handleSubmit}
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: 'spring', stiffness: 300, damping: 24 }}
            >
                <h1 className="text-lg font-bold text-brand">Weather-Aware Truck Routing</h1>
                <h2 className="mb-1 text-2xl font-bold">{isLogin ? 'Log in' : 'Create an account'}</h2>

                {notice && <p className="rounded-md bg-[#fff6db] p-2.5 text-[#7a5b00]">{notice}</p>}

                <div className="field">
                    <label htmlFor="username">Username</label>
                    <input
                        id="username"
                        className="input"
                        type="text"
                        required
                        autoComplete="username"
                        autoFocus
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                    />
                </div>

                <div className="field">
                    <label htmlFor="password">Password</label>
                    <input
                        id="password"
                        className="input"
                        type="password"
                        required
                        autoComplete={isLogin ? 'current-password' : 'new-password'}
                        minLength={isLogin ? undefined : 8}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                    />
                </div>

                {error && (
                    <p className="alert-error" role="alert">
                        {error}
                    </p>
                )}

                <motion.button type="submit" className="btn-primary" disabled={loading} whileTap={{ scale: 0.97 }}>
                    {loading ? 'Please wait…' : isLogin ? 'Log in' : 'Create account'}
                </motion.button>

                <button type="button" className="cursor-pointer text-sm text-brand" onClick={switchMode}>
                    {isLogin ? "Don't have an account? Create one" : 'Already have an account? Log in'}
                </button>
            </motion.form>
        </div>
    );
};

export default AuthPage;
