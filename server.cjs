'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

// Pengaturan dibaca dari file .env bila ada (DATABASE_URL, PORT, dll.).
const envFile = path.join(__dirname, '.env');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

const { createApp } = require('./server/app.cjs');
const { createDb } = require('./server/db.cjs');

// `npm run start:lan` (atau `node server.cjs --lan`) membuka akses dari perangkat lain di jaringan.
const lan = process.argv.includes('--lan');
const host = process.env.HOST || (lan ? '0.0.0.0' : '127.0.0.1');
const port = Number(process.env.PORT) || 4173;

function lanAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter(item => item && item.family === 'IPv4' && !item.internal)
    .map(item => item.address);
}

async function main() {
  const db = createDb();
  try {
    await db.init();
  } catch (error) {
    console.error(`Tidak bisa terhubung ke MySQL ${db.config.user}@${db.config.host}:${db.config.port}/${db.config.database}: ${error.message}`);
    process.exit(1);
  }
  const { server } = createApp({
    db,
    trustProxy: process.env.TRUST_PROXY === '1',
    secureCookie: process.env.COOKIE_SECURE === '1',
  });
  server.listen(port, host, () => {
    const local = host === '0.0.0.0' ? '127.0.0.1' : host;
    console.log(`AppLog berjalan di http://${local}:${port}`);
    console.log(`Database: MySQL ${db.config.host}:${db.config.port}/${db.config.database}`);
    if (host === '0.0.0.0') {
      for (const ip of lanAddresses()) console.log(`Dari perangkat lain di jaringan: http://${ip}:${port}`);
      console.log('Peringatan: tanpa HTTPS, password terkirim tanpa enkripsi. Pakai hanya di jaringan kantor yang tepercaya.');
    }
  });
  const shutdown = () => server.close(() => db.close().finally(() => process.exit(0)));
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main();
