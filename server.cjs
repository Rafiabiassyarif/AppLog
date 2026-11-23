'use strict';

const path = require('path');
const { createApp } = require('./server/app.cjs');

const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT) || 4173;
const { server } = createApp({
  dataFile: process.env.DATA_FILE || path.join(__dirname, 'data', 'registry.json'),
  trustProxy: process.env.TRUST_PROXY === '1',
  secureCookie: process.env.COOKIE_SECURE === '1',
});

server.listen(port, host, () => {
  const shown = host === '0.0.0.0' ? 'semua alamat jaringan' : host;
  console.log(`AppLog berjalan di http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${port} (${shown})`);
});
