'use strict';

const os = require('os');
const path = require('path');
const { createApp } = require('./server/app.cjs');

// `npm run start:lan` (atau `node server.cjs --lan`) membuka akses dari perangkat lain di jaringan.
const lan = process.argv.includes('--lan');
const host = process.env.HOST || (lan ? '0.0.0.0' : '127.0.0.1');
const port = Number(process.env.PORT) || 4173;
const { server, store } = createApp({
  dataFile: process.env.DATA_FILE || path.join(__dirname, 'data', 'registry.json'),
  backupDir: process.env.BACKUP_DIR || undefined,
  trustProxy: process.env.TRUST_PROXY === '1',
  secureCookie: process.env.COOKIE_SECURE === '1',
});

function lanAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter(item => item && item.family === 'IPv4' && !item.internal)
    .map(item => item.address);
}

server.listen(port, host, () => {
  const local = host === '0.0.0.0' ? '127.0.0.1' : host;
  console.log(`AppLog berjalan di http://${local}:${port}`);
  if (host === '0.0.0.0') {
    for (const ip of lanAddresses()) console.log(`Dari perangkat lain di jaringan: http://${ip}:${port}`);
    console.log('Peringatan: tanpa HTTPS, password terkirim tanpa enkripsi. Pakai hanya di jaringan kantor yang tepercaya.');
  }
  console.log(`Backup disimpan di ${store.backupDir}`);
});
