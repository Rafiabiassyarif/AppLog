import React, { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { api, UNAUTHORIZED_EVENT } from './lib/api.js';
import { Brand, Button } from './components.jsx';
import Login from './Login.jsx';
import Workspace from './Workspace.jsx';

const homeOf = user => (user.role === 'admin' ? '/admin' : '/user');

// Landing mengambil sesi lebih dulu, agar login bisa langsung tampil (tanpa layar loading) saat Masuk diklik.
let pendingSession = null;
let readySession = null;
export function preloadSession() {
  pendingSession ??= api('/api/session').then(data => (readySession = data));
  return pendingSession;
}

export default function App() {
  const [session, setSession] = useState(readySession);
  const [error, setError] = useState('');
  const [expired, setExpired] = useState(false);

  const loadSession = useCallback(() => {
    setError('');
    const request = preloadSession();
    pendingSession = null;
    readySession = null;
    request
      .then(setSession)
      .catch(e => setError(e.message));
  }, []);

  useEffect(loadSession, [loadSession]);

  useEffect(() => {
    const onUnauthorized = () => {
      setSession(current => (current?.user ? { ...current, user: null } : current));
      setExpired(true);
      history.replaceState(null, '', '/login');
    };
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  if (error) {
    return (
      <div className="loading-screen">
        <Brand />
        <p>{error}</p>
        <Button onClick={loadSession}>Coba lagi</Button>
      </div>
    );
  }
  if (!session) return <div className="loading-screen"><Brand /><Loader2 className="spin" /></div>;

  if (!session.user) {
    return (
      <Login
        setupRequired={session.setupRequired}
        expired={expired}
        onLogin={user => {
          setExpired(false);
          setSession({ user, setupRequired: false });
          history.replaceState(null, '', homeOf(user));
        }}
      />
    );
  }

  return (
    <Workspace
      user={session.user}
      onUserChange={user => setSession(current => ({ ...current, user }))}
      onLogout={() => {
        setSession({ user: null, setupRequired: false });
        history.replaceState(null, '', '/login');
      }}
    />
  );
}
