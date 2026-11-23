import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/dm-sans';
import '@fontsource-variable/manrope';
import './app.css';
import Landing from './Landing.jsx';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {location.pathname === '/' ? <Landing /> : <App />}
  </React.StrictMode>,
);
