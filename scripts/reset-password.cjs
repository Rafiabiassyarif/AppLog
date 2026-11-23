'use strict';

// Reset password dari terminal, misalnya saat satu-satunya Admin lupa password.
// Jalankan saat server dihentikan. Pemakaian: node scripts/reset-password.cjs username
const crypto = require('crypto');
const { openData, saveData, randomPassword } = require('./data-file.cjs');

const username = String(process.argv[2] || '').toLowerCase();
const { file, db } = openData();
const user = db.users.find(u => u.username === username);
if (!user) {
  console.error('Pemakaian: node scripts/reset-password.cjs username (akun harus sudah ada)');
  process.exit(1);
}

const password = randomPassword();
user.salt = crypto.randomBytes(16).toString('hex');
user.hash = crypto.scryptSync(password, user.salt, 64).toString('hex');
user.active = true;
db.sessions = (db.sessions || []).filter(s => s.userId !== user.id);
saveData(file, db);
console.log(JSON.stringify({ username, password }));
