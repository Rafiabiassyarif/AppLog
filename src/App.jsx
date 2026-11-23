import React, { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { api, UNAUTHORIZED_EVENT } from './lib/api.js';
import { Brand, Button } from './components.jsx';
import Login from './Login.jsx';
import Workspace from './Workspace.jsx';

const homeOf = user => (user.role === 'admin' ? '/admin' : '/user');

export default function App() {
  const [session, setSession] = useState(null);
  const [error, setError] = useState('');
  const [expired, setExpired] = useState(false);

  const loadSession = useCallback(() => {
    setError('');
    api('/api/session')
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
      onLogout={() => {
        setSession({ user: null, setupRequired: false });
        history.replaceState(null, '', '/login');
      }}
    />
  );
}
