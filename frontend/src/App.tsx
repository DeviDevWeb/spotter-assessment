import { useEffect, useState } from 'react';
import { getMe, getStoredSession, logout, setUnauthorizedHandler } from './api/client';
import AuthPage from './components/AuthPage';
import Planner from './components/Planner';
import type { User } from './types';

// Auth gate: shows the login screen or the planner
function App() {
    const [user, setUser] = useState<User | null>(() => getStoredSession()?.user ?? null);
    const [authNotice, setAuthNotice] = useState<string | null>(null);

    // Any 401 from the API (expired / deleted token) sends the user back to login
    useEffect(() => {
        setUnauthorizedHandler(() => {
            setUser(null);
            setAuthNotice('Your session expired. Please log in again.');
        });
        return () => setUnauthorizedHandler(null);
    }, []);

    // Confirms a stored session is still valid. A rejected token triggers the handler above,
    // network errors keep the session so the app still opens offline
    useEffect(() => {
        if (getStoredSession()) {
            getMe().catch(() => {});
        }
    }, []);

    const handleAuthenticated = (loggedUser: User) => {
        setAuthNotice(null);
        setUser(loggedUser);
    };

    const handleLogout = async () => {
        await logout();
        setUser(null);
    };

    if (!user) return <AuthPage onAuthenticated={handleAuthenticated} notice={authNotice} />;
    return <Planner user={user} onLogout={handleLogout} />;
}

export default App;
