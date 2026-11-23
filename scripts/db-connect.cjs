'use strict';

// Koneksi MySQL untuk skrip terminal. Membaca .env di folder proyek bila ada.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const envFile = path.join(__dirname, '..', '.env');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

const { createDb } = require('../server/db.cjs');

async function openDb() {
  const db = createDb();
  await db.init();
  return db;
}

const randomPassword = () => `${crypto.randomBytes(9).toString('base64url')}-${crypto.randomInt(10, 99)}`;

/** Menjalankan fungsi skrip, mencetak error singkat, dan selalu menutup koneksi. */
async function run(task) {
  let db;
  try {
    db = await openDb();
    await task(db);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    if (db) await db.close();
  }
}

module.exports = { openDb, run, randomPassword };
