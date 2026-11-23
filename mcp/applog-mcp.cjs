#!/usr/bin/env node
'use strict';

/**
 * Server MCP AppLog (stdio, tanpa dependensi).
 * AI agent memakai alat-alat di bawah untuk membaca dan mengisi data aplikasi atas nama satu akun.
 *
 * Variabel lingkungan:
 *   APPLOG_URL    alamat AppLog, default http://127.0.0.1:4173
 *   APPLOG_TOKEN  token API dari menu Profil saya > Token AI agent
 *
 * Hak akses sama dengan web: User tidak bisa membuat Proyek; anggota tim proyek hanya mengisi
 * bagian kerja (status, teknologi, link, deskripsi, tanggal, centang spesifikasi).
 */

const readline = require('readline');

const BASE = (process.env.APPLOG_URL || 'http://127.0.0.1:4173').replace(/\/+$/, '');
const TOKEN = process.env.APPLOG_TOKEN || '';
const PROTOCOL = '2025-06-18';
const STATUSES = ['Ide', 'Dikerjakan', 'Selesai', 'Maintenance'];
const TYPES = ['internal', 'personal', 'project'];
const WORK_FIELDS = ['status', 'tech', 'link', 'description', 'startDate', 'endDate'];

// ---------- Klien API ----------

async function api(path, { method = 'GET', body } = {}) {
  if (!TOKEN) throw new Error('APPLOG_TOKEN belum diisi. Buat token di AppLog: Profil saya > Token AI agent.');
  let res;
  try {
    res = await fetch(BASE + path, {
      method,
      headers: { Authorization: `Bearer ${TOKEN}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    throw new Error(`Tidak bisa menghubungi AppLog di ${BASE} (${error.message}).`);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `AppLog membalas status ${res.status}.`);
  return data;
}

async function context() {
  const [{ user }, profiles, apps] = await Promise.all([api('/api/session'), api('/api/profiles'), api('/api/apps')]);
  if (!user) throw new Error('Token tidak valid.');
  return { user, profiles, apps };
}

const isMember = (app, user) => (app.members || []).some(m => m.userId === user.id);
const canManage = (app, user) => user.role === 'admin' || app.createdBy === user.id;
// Tim dan spesifikasi proyek hanya diatur Admin. Proyek buatan User dikerjakan sendiri.
const teamOnly = (args, user) => {
  if (user.role === 'admin') return;
  const blocked = ['members', 'lead', 'specs'].filter(k => args[k] !== undefined);
  if (blocked.length) throw new Error(`Tim dan spesifikasi proyek hanya diatur Admin (${blocked.join(', ')}). Proyek buatan User hanya punya pemberi dan tenggat.`);
};

function findApp(apps, ref) {
  if (!ref) throw new Error('Isi "app" dengan id atau nama aplikasi.');
  const exact = apps.find(a => a.id === ref) || apps.find(a => a.name.toLowerCase() === String(ref).toLowerCase());
  if (exact) return exact;
  const partial = apps.filter(a => a.name.toLowerCase().includes(String(ref).toLowerCase()));
  if (partial.length === 1) return partial[0];
  if (partial.length > 1) throw new Error(`Nama "${ref}" cocok dengan beberapa aplikasi: ${partial.map(a => a.name).join(', ')}. Pakai nama lengkap atau id.`);
  throw new Error(`Aplikasi "${ref}" tidak ditemukan.`);
}

function userIdOf(profiles, ref) {
  const p = profiles.find(x => x.id === ref || x.username === String(ref).replace(/^@/, '') || x.name.toLowerCase() === String(ref).toLowerCase());
  if (!p) throw new Error(`Akun "${ref}" tidak ditemukan.`);
  return p.id;
}

/** Ringkasan aplikasi yang mudah dibaca agent. */
function describe(app, profiles, user) {
  const nameOf = id => (profiles.find(p => p.id === id) || {}).name || id;
  const out = {
    id: app.id,
    name: app.name,
    type: app.type,
    status: app.status,
    owner: app.owner,
    tech: app.tech,
    link: app.link,
    description: app.description,
    startDate: app.startDate,
    endDate: app.endDate,
    access: canManage(app, user) ? 'kelola' : isMember(app, user) ? 'anggota tim (isi bagian kerja)' : 'lihat saja',
  };
  if (app.type === 'project') {
    const done = app.specs.filter(s => s.done).length;
    Object.assign(out, {
      client: app.client,
      deadline: app.deadline,
      team: app.members.map(m => ({ name: nameOf(m.userId), lead: m.lead })),
      specs: app.specs.map(s => ({ id: s.id, text: s.text, done: s.done })),
      progress: `${done}/${app.specs.length}`,
    });
  }
  return out;
}

const pick = (obj, keys) => Object.fromEntries(keys.filter(k => obj[k] !== undefined).map(k => [k, obj[k]]));

/** Spesifikasi dari agent: string atau {text, done}. Teks yang sama dengan poin lama mempertahankan id-nya. */
function mergeSpecs(current, incoming) {
  return incoming.map(item => {
    const spec = typeof item === 'string' ? { text: item } : item;
    const old = current.find(s => s.text.toLowerCase() === String(spec.text || '').toLowerCase());
    return { id: old && old.id, text: spec.text, done: spec.done !== undefined ? Boolean(spec.done) : Boolean(old && old.done) };
  });
}

// ---------- Alat ----------

const appFields = {
  status: { type: 'string', enum: STATUSES },
  tech: { type: 'string', description: 'Teknologi, pisahkan dengan koma. Contoh: "React, Node.js, MySQL"' },
  link: { type: 'string', description: 'URL aplikasi atau repository (http/https)' },
  description: { type: 'string', description: 'Deskripsi singkat, maksimal 280 karakter' },
  startDate: { type: 'string', description: 'Tanggal mulai, format YYYY-MM-DD' },
  endDate: { type: 'string', description: 'Tanggal selesai, format YYYY-MM-DD' },
};
const projectFields = {
  client: { type: 'string', description: 'Khusus proyek: pemberi proyek, misalnya nama dosen' },
  deadline: { type: 'string', description: 'Khusus proyek: tenggat YYYY-MM-DD' },
  members: { type: 'array', items: { type: 'string' }, description: 'Khusus Admin: username anggota tim' },
  lead: { type: 'string', description: 'Khusus Admin: username ketua (harus anggota)' },
  specs: {
    type: 'array',
    description: 'Khusus Admin: daftar poin spesifikasi (menggantikan daftar lama). String atau {text, done}.',
    items: { anyOf: [{ type: 'string' }, { type: 'object', properties: { text: { type: 'string' }, done: { type: 'boolean' } }, required: ['text'] }] },
  },
};

const TOOLS = [
  {
    name: 'whoami',
    description: 'Lihat akun AppLog yang dipakai token ini (nama, username, peran).',
    inputSchema: { type: 'object', properties: {} },
    async run() {
      const { user } = await api('/api/session');
      return { name: user.name, username: user.username, role: user.role === 'admin' ? 'Admin' : 'User' };
    },
  },
  {
    name: 'list_apps',
    description: 'Daftar aplikasi. mine=true hanya aplikasi milik akun ini atau proyek tempat akun ini jadi anggota tim.',
    inputSchema: {
      type: 'object',
      properties: {
        mine: { type: 'boolean' },
        type: { type: 'string', enum: TYPES },
        status: { type: 'string', enum: STATUSES },
        search: { type: 'string', description: 'Cari di nama, pembuat, atau teknologi' },
      },
    },
    async run(args) {
      const { user, profiles, apps } = await context();
      const q = (args.search || '').toLowerCase();
      return apps
        .filter(a => !args.mine || a.createdBy === user.id || isMember(a, user))
        .filter(a => !args.type || a.type === args.type)
        .filter(a => !args.status || a.status === args.status)
        .filter(a => !q || [a.name, a.owner, a.tech].join(' ').toLowerCase().includes(q))
        .map(a => {
          const d = describe(a, profiles, user);
          return { id: d.id, name: d.name, type: d.type, status: d.status, owner: d.owner, access: d.access, ...(a.type === 'project' ? { deadline: d.deadline, progress: d.progress } : {}) };
        });
    },
  },
  {
    name: 'get_app',
    description: 'Detail satu aplikasi, termasuk tim dan spesifikasi proyek.',
    inputSchema: { type: 'object', properties: { app: { type: 'string', description: 'Id atau nama aplikasi' } }, required: ['app'] },
    async run(args) {
      const { user, profiles, apps } = await context();
      return describe(findApp(apps, args.app), profiles, user);
    },
  },
  {
    name: 'create_app',
    description: 'Tambah aplikasi baru. Jenis project punya pemberi (client) dan tenggat (deadline). Tim (members, lead) dan spesifikasi (specs) hanya bisa diisi Admin.',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string' }, type: { type: 'string', enum: TYPES }, ...appFields, ...projectFields },
      required: ['name', 'type'],
    },
    async run(args) {
      const { user, profiles } = await context();
      teamOnly(args, user);
      const body = { name: args.name, type: args.type, owner: user.name, status: args.status || 'Dikerjakan', ...pick(args, ['tech', 'link', 'description', 'startDate', 'endDate']) };
      if (args.type === 'project') {
        const members = (args.members || []).map(ref => userIdOf(profiles, ref));
        const leadId = args.lead ? userIdOf(profiles, args.lead) : members[0] || '';
        if (leadId && !members.includes(leadId)) members.unshift(leadId);
        Object.assign(body, { client: args.client || '', deadline: args.deadline || '', members, leadId, specs: mergeSpecs([], args.specs || []) });
      }
      const created = await api('/api/apps', { method: 'POST', body });
      return { message: `Aplikasi "${created.name}" ditambahkan.`, app: describe(created, profiles, user) };
    },
  },
  {
    name: 'update_app',
    description: 'Ubah aplikasi. Isi hanya field yang mau diganti. Pembuat boleh mengubah semua field kecuali tim (members, lead) dan spesifikasi (specs) yang hanya diatur Admin. Anggota tim proyek Admin hanya bisa mengubah status, tech, link, description, startDate, endDate.',
    inputSchema: {
      type: 'object',
      properties: { app: { type: 'string', description: 'Id atau nama aplikasi' }, name: { type: 'string' }, type: { type: 'string', enum: TYPES }, ...appFields, ...projectFields },
      required: ['app'],
    },
    async run(args) {
      const { user, profiles, apps } = await context();
      const app = findApp(apps, args.app);
      let body;
      if (canManage(app, user)) {
        teamOnly(args, user);
        let members = app.members.map(m => m.userId);
        let leadId = (app.members.find(m => m.lead) || {}).userId || '';
        if (args.members) members = args.members.map(ref => userIdOf(profiles, ref));
        if (args.lead) leadId = userIdOf(profiles, args.lead);
        if (leadId && !members.includes(leadId)) leadId = members[0] || '';
        body = {
          ...app,
          ...pick(args, ['name', 'type', 'client', 'deadline', ...WORK_FIELDS]),
          members,
          leadId,
          specs: args.specs ? mergeSpecs(app.specs, args.specs) : app.specs,
        };
      } else if (isMember(app, user)) {
        const blocked = ['name', 'type', 'client', 'deadline', 'members', 'lead', 'specs'].filter(k => args[k] !== undefined);
        if (blocked.length) throw new Error(`Sebagai anggota tim kamu tidak bisa mengubah: ${blocked.join(', ')}. Untuk centang spesifikasi pakai check_spec.`);
        body = pick(args, WORK_FIELDS);
      } else {
        throw new Error('Kamu hanya bisa melihat aplikasi ini.');
      }
      const updated = await api(`/api/apps/${app.id}`, { method: 'PUT', body });
      return { message: `Aplikasi "${updated.name}" diperbarui.`, app: describe(updated, profiles, user) };
    },
  },
  {
    name: 'check_spec',
    description: 'Centang (done=true) atau batalkan centang (done=false) poin spesifikasi proyek. Bisa dipakai Admin dan anggota tim.',
    inputSchema: {
      type: 'object',
      properties: {
        app: { type: 'string', description: 'Id atau nama proyek' },
        spec: { type: 'string', description: 'Id poin atau potongan teksnya' },
        done: { type: 'boolean' },
      },
      required: ['app', 'spec', 'done'],
    },
    async run(args) {
      const { user, profiles, apps } = await context();
      const app = findApp(apps, args.app);
      const q = String(args.spec).toLowerCase();
      const matches = app.specs.filter(s => s.id === args.spec || s.text.toLowerCase().includes(q));
      if (!matches.length) throw new Error(`Poin "${args.spec}" tidak ada. Poin yang ada: ${app.specs.map(s => s.text).join('; ') || '(kosong)'}.`);
      if (matches.length > 1 && !matches.some(s => s.text.toLowerCase() === q)) throw new Error(`"${args.spec}" cocok dengan beberapa poin: ${matches.map(s => s.text).join('; ')}.`);
      const spec = matches.find(s => s.text.toLowerCase() === q) || matches[0];
      const updated = await api(`/api/apps/${app.id}/specs/${spec.id}`, { method: 'PATCH', body: { done: Boolean(args.done) } });
      const d = describe(updated, profiles, user);
      return { message: `"${spec.text}" ${args.done ? 'ditandai selesai' : 'dibatalkan'}. Progres ${d.progress}.`, specs: d.specs };
    },
  },
];

// ---------- Protokol MCP (JSON-RPC lewat stdio) ----------

const send = message => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...message }) + '\n');

async function handle(msg) {
  const { id, method, params = {} } = msg;
  if (id === undefined) return; // notifikasi (mis. notifications/initialized)
  switch (method) {
    case 'initialize':
      return send({ id, result: {
        protocolVersion: params.protocolVersion || PROTOCOL,
        capabilities: { tools: {} },
        serverInfo: { name: 'applog', version: '1.0.0' },
        instructions: 'AppLog mendata aplikasi tim Kroombox. Mulai dengan whoami dan list_apps (mine=true). Tanggal memakai format YYYY-MM-DD. Status: Ide, Dikerjakan, Selesai, Maintenance.',
      } });
    case 'ping':
      return send({ id, result: {} });
    case 'tools/list':
      return send({ id, result: { tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) } });
    case 'tools/call': {
      const tool = TOOLS.find(t => t.name === params.name);
      if (!tool) return send({ id, error: { code: -32602, message: `Alat tidak dikenal: ${params.name}` } });
      try {
        const result = await tool.run(params.arguments || {});
        return send({ id, result: { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] } });
      } catch (error) {
        return send({ id, result: { content: [{ type: 'text', text: error.message }], isError: true } });
      }
    }
    default:
      return send({ id, error: { code: -32601, message: `Metode tidak didukung: ${method}` } });
  }
}

if (require.main === module) {
  const rl = readline.createInterface({ input: process.stdin });
  rl.on('line', line => {
    if (!line.trim()) return;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      return send({ id: null, error: { code: -32700, message: 'JSON tidak valid.' } });
    }
    handle(msg).catch(error => send({ id: msg.id ?? null, error: { code: -32603, message: error.message } }));
  });
  console.error(`AppLog MCP siap (${BASE}).`);
}

module.exports = { handle, TOOLS };
