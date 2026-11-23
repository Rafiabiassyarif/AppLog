import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/dm-sans';
import '@fontsource-variable/manrope';
import './app.css';
import Landing from './Landing.jsx';
import App from './App.jsx';

// Landing ke /login tanpa reload halaman, supaya animasi transisi tidak terputus layar kosong.
function Root() {
  const [path, setPath] = useState(location.pathname);

  useEffect(() => {
    const onPop = () => setPath(location.pathname);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  if (path === '/') {
    return <Landing onEnter={() => { history.pushState(null, '', '/login'); setPath('/login'); }} />;
  }
  return <App />;
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
