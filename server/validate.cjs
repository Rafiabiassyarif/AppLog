'use strict';

const { badRequest } = require('./errors.cjs');

const APP_TYPES = ['internal', 'personal', 'project'];
const APP_STATUSES = ['Ide', 'Dikerjakan', 'Selesai', 'Maintenance'];
const ROLES = ['admin', 'member'];
const USERNAME = /^[a-zA-Z0-9_.-]{3,40}$/;

const LIMITS = { name: 80, owner: 60, tech: 120, link: 500, description: 280, userName: 60, logo: 80000, bio: 280, photo: 80000, client: 120, spec: 200, specs: 50, members: 30 };
const LOGO = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function text(value, label, max, required = false) {
  if (value == null) value = '';
  if (typeof value !== 'string' && typeof value !== 'number') throw badRequest(`${label} tidak valid.`);
  const result = String(value).trim();
  if (required && !result) throw badRequest(`${label} wajib diisi.`);
  if (result.length > max) throw badRequest(`${label} maksimal ${max} karakter.`);
  return result;
}

function oneOf(value, list, label) {
  if (!list.includes(value)) throw badRequest(`${label} tidak valid.`);
  return value;
}

function link(value) {
  const result = text(value, 'Link', LIMITS.link);
  if (!result) return '';
  let url;
  try {
    url = new URL(result);
  } catch {
    throw badRequest('Link harus berupa URL lengkap, contoh https://contoh.com.');
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw badRequest('Link harus menggunakan http atau https.');
  return result;
}

function year(value) {
  const result = text(value, 'Tahun', 4);
  if (!result) return '';
  const number = Number(result);
  if (!/^\d{4}$/.test(result) || number < 2000 || number > 2100) throw badRequest('Tahun harus antara 2000 dan 2100.');
  return result;
}

function date(value, label) {
  const result = text(value, label, 10);
  if (!result) return '';
  const match = DATE.exec(result);
  const parsed = match && new Date(Date.UTC(+match[1], +match[2] - 1, +match[3]));
  if (!parsed || parsed.toISOString().slice(0, 10) !== result) throw badRequest(`${label} tidak valid.`);
  if (+match[1] < 2000 || +match[1] > 2100) throw badRequest(`${label} harus antara tahun 2000 dan 2100.`);
  return result;
}

/** Logo: gambar kecil (PNG/JPEG/WebP) sebagai data URL. SVG ditolak karena bisa berisi skrip. */
function logo(value) {
  if (value == null || value === '') return '';
  if (typeof value !== 'string' || !LOGO.test(value)) throw badRequest('Logo harus gambar PNG, JPG, atau WebP.');
  if (value.length > LIMITS.logo) throw badRequest('Logo terlalu besar.');
  return value;
}

/** Tim proyek: daftar id akun (unik) dan satu ketua opsional. Keberadaan akun dicek di server/app.cjs. */
function members(list, leadId) {
  if (list == null) return [];
  if (!Array.isArray(list) || list.length > LIMITS.members) throw badRequest(`Tim proyek maksimal ${LIMITS.members} orang.`);
  const ids = [...new Set(list.map(id => (typeof id === 'string' ? id.trim() : '')))];
  if (ids.some(id => !id || id.length > 36)) throw badRequest('Anggota tim tidak valid.');
  if (leadId && !ids.includes(leadId)) throw badRequest('Ketua harus termasuk anggota tim.');
  return ids.map(userId => ({ userId, lead: userId === leadId }));
}

/** Spesifikasi proyek: [{ id?, text, done }]. */
function specs(list) {
  if (list == null) return [];
  if (!Array.isArray(list) || list.length > LIMITS.specs) throw badRequest(`Spesifikasi maksimal ${LIMITS.specs} poin.`);
  return list.map(item => {
    if (!item || typeof item !== 'object') throw badRequest('Spesifikasi tidak valid.');
    const id = typeof item.id === 'string' && /^[0-9a-f-]{36}$/i.test(item.id) ? item.id : undefined;
    return { id, text: text(item.text, 'Poin spesifikasi', LIMITS.spec, true), done: Boolean(item.done) };
  });
}

function appInput(body) {
  if (!body || typeof body !== 'object') throw badRequest('Data aplikasi tidak valid.');
  const fields = {
    name: text(body.name, 'Nama aplikasi', LIMITS.name, true),
    owner: text(body.owner, 'Pembuat', LIMITS.owner, true),
    type: oneOf(body.type, APP_TYPES, 'Jenis aplikasi'),
    status: oneOf(body.status, APP_STATUSES, 'Status'),
    tech: text(body.tech, 'Teknologi', LIMITS.tech),
    link: link(body.link),
    description: text(body.description, 'Deskripsi', LIMITS.description),
  };
  const startDate = date(body.startDate, 'Tanggal mulai');
  const endDate = date(body.endDate, 'Tanggal selesai');
  if (startDate && endDate && endDate < startDate) throw badRequest('Tanggal selesai tidak boleh sebelum tanggal mulai.');
  return {
    ...fields,
    logo: logo(body.logo),
    startDate,
    endDate,
    // Tahun mengikuti tanggal mulai; data lama yang hanya punya tahun tetap didukung.
    year: startDate ? startDate.slice(0, 4) : year(body.year),
    // Field khusus Proyek; jenis lain selalu dikosongkan.
    ...(fields.type === 'project'
      ? { client: text(body.client, 'Pemberi proyek', LIMITS.client), deadline: date(body.deadline, 'Tenggat'), members: members(body.members, body.leadId), specs: specs(body.specs) }
      : { client: '', deadline: '', members: [], specs: [] }),
  };
}

function tokenName(value) {
  return text(value, 'Nama token', 60, true);
}

function password(value, label = 'Password') {
  if (typeof value !== 'string' || value.length < 8 || value.length > 128) {
    throw badRequest(`${label} harus 8–128 karakter.`);
  }
  return value;
}

function userName(value) {
  return text(value, 'Nama', LIMITS.userName, true);
}

function bio(value) {
  return text(value, 'Bio', LIMITS.bio);
}

/** Foto profil: aturan sama dengan logo (PNG/JPEG/WebP data URL, SVG ditolak). */
function photo(value) {
  if (value == null || value === '') return '';
  if (typeof value !== 'string' || !LOGO.test(value)) throw badRequest('Foto harus gambar PNG, JPG, atau WebP.');
  if (value.length > LIMITS.photo) throw badRequest('Foto terlalu besar.');
  return value;
}

function username(value) {
  if (typeof value !== 'string' || !USERNAME.test(value)) {
    throw badRequest('Username 3–40 karakter: huruf, angka, titik, garis bawah atau tanda hubung.');
  }
  return value.toLowerCase();
}

function role(value) {
  return oneOf(value, ROLES, 'Peran');
}

module.exports = { appInput, tokenName, password, userName, bio, photo, username, role, APP_TYPES, APP_STATUSES, LIMITS };
