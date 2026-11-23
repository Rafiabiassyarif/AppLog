'use strict';

// Membuat akun dari terminal. Jalankan saat server dihentikan.
// Pemakaian: node scripts/create-account.cjs username admin|member Nama Lengkap
const crypto = require('crypto');
const { openData, saveData, randomPassword } = require('./data-file.cjs');

const [username, role = 'member', ...names] = process.argv.slice(2);
if (!/^[a-zA-Z0-9_.-]{3,40}$/.test(username || '') || !['admin', 'member'].includes(role)) {
  console.error('Pemakaian: node scripts/create-account.cjs username admin|member Nama Anggota');
  process.exit(1);
}

const { file, db } = openData();
const lower = username.toLowerCase();
if (db.users.some(u => u.username === lower)) {
  console.error('Username sudah ada; akun lama tidak diubah. Untuk reset password: node scripts/reset-password.cjs ' + lower);
  process.exit(1);
}

const password = randomPassword();
const salt = crypto.randomBytes(16).toString('hex');
db.users.push({
  id: crypto.randomUUID(),
  username: lower,
  name: names.join(' ') || username,
  role,
  active: true,
  salt,
  hash: crypto.scryptSync(password, salt, 64).toString('hex'),
});
saveData(file, db);
console.log(JSON.stringify({ username: lower, password, role }));
