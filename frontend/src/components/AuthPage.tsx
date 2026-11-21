import { useState } from 'react';
import type { FormEvent } from 'react';
import { motion } from 'motion/react';
import { login, register } from '../api/client';
import type { User } from '../types';

type Mode = 'login' | 'register';

interface Props {
    onAuthenticated: (user: User) => void;
    notice: string | null;
}

// Login / registration form
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
