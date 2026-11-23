'use strict';

const { badRequest } = require('./errors.cjs');

const APP_TYPES = ['internal', 'personal'];
const APP_STATUSES = ['Ide', 'Dikerjakan', 'Selesai', 'Maintenance'];
const ROLES = ['admin', 'member'];
const USERNAME = /^[a-zA-Z0-9_.-]{3,40}$/;

const LIMITS = { name: 80, owner: 60, tech: 120, link: 500, description: 280, userName: 60 };

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

function appInput(body) {
  if (!body || typeof body !== 'object') throw badRequest('Data aplikasi tidak valid.');
  return {
    name: text(body.name, 'Nama aplikasi', LIMITS.name, true),
    owner: text(body.owner, 'Pembuat', LIMITS.owner, true),
    type: oneOf(body.type, APP_TYPES, 'Jenis aplikasi'),
    status: oneOf(body.status, APP_STATUSES, 'Status'),
    tech: text(body.tech, 'Teknologi', LIMITS.tech),
    link: link(body.link),
    description: text(body.description, 'Deskripsi', LIMITS.description),
    year: year(body.year),
  };
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

function username(value) {
  if (typeof value !== 'string' || !USERNAME.test(value)) {
    throw badRequest('Username 3–40 karakter: huruf, angka, titik, garis bawah atau tanda hubung.');
  }
  return value.toLowerCase();
}

function role(value) {
  return oneOf(value, ROLES, 'Peran');
}

module.exports = { appInput, password, userName, username, role, APP_TYPES, APP_STATUSES, LIMITS };
