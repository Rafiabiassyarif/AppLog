'use strict';

/**
 * Dokumentasi API untuk AI agent dan integrasi lain.
 * - buildSpec(baseUrl): spesifikasi OpenAPI 3.1 (/api/openapi.json)
 * - renderDocs(spec): halaman HTML yang bisa dibaca manusia (/docs)
 * - renderLlms(spec): ringkasan Markdown untuk LLM (/llms.txt)
 * Hanya endpoint yang boleh dipakai token API yang didokumentasikan.
 */

const { APP_TYPES, APP_STATUSES, LIMITS } = require('./validate.cjs');

const ref = name => ({ $ref: `#/components/schemas/${name}` });
const json = schema => ({ content: { 'application/json': { schema } } });
const error = description => ({ description, ...json(ref('Error')) });
const ERRORS = {
  400: error('Data tidak valid. Pesan ada di field "error".'),
  401: error('Token tidak ada, salah, atau sudah dicabut.'),
  403: error('Akun ini tidak punya hak untuk aksi ini.'),
  404: error('Aplikasi atau poin spesifikasi tidak ditemukan.'),
  409: error('Nama aplikasi sudah dipakai.'),
  415: error('Header "Content-Type: application/json" wajib untuk POST, PUT, dan PATCH.'),
};
const errors = (...codes) => Object.fromEntries(codes.map(code => [code, ERRORS[code]]));
const idParam = { name: 'id', in: 'path', required: true, description: 'Id aplikasi (UUID).', schema: { type: 'string' } };

function buildSpec(baseUrl) {
  return {
    openapi: '3.1.0',
    info: {
      title: 'AppLog API',
      version: '1.0.0',
      description: [
        'API untuk membaca dan mengisi data aplikasi di AppLog lewat AI agent atau script.',
        '',
        '**Autentikasi**: buat token di AppLog (Profil saya, bagian Token AI agent), lalu kirim di setiap permintaan:',
        '`Authorization: Bearer applog_...`. Token bekerja atas nama akun pembuatnya, dengan hak akses yang sama seperti di web.',
        '',
        '**Format**: semua body JSON. POST, PUT, dan PATCH wajib memakai header `Content-Type: application/json`.',
        'Error selalu berbentuk `{ "error": "pesan" }`.',
        '',
        '**Hak akses**: Admin mengelola semua aplikasi. User mengelola aplikasi buatannya sendiri.',
        'Proyek buatan User hanya punya pemberi (`client`) dan tenggat (`deadline`); tim (`members`, `leadId`) dan spesifikasi (`specs`) hanya diatur Admin dan diabaikan bila dikirim User.',
        'Anggota tim proyek Admin hanya boleh mengubah bagian kerja: `status`, `tech`, `link`, `description`, `startDate`, `endDate`, `logo`, dan centang spesifikasi.',
        '',
        'Token tidak bisa menghapus aplikasi, membuka Sampah, mengelola akun, atau membuat token lain.',
      ].join('\n'),
    },
    servers: [{ url: baseUrl }],
    security: [{ bearerAuth: [] }],
    tags: [
      { name: 'Akun', description: 'Akun pemilik token dan daftar anggota.' },
      { name: 'Aplikasi', description: 'Baca, tambah, dan ubah aplikasi atau proyek.' },
    ],
    paths: {
      '/api/session': {
        get: {
          tags: ['Akun'], operationId: 'getSession', summary: 'Akun pemilik token',
          description: 'Pakai untuk mengecek token dan mengetahui id serta peran akun.',
          responses: { 200: { description: 'Akun aktif.', ...json({ type: 'object', properties: { user: ref('Profile'), setupRequired: { type: 'boolean' } } }) }, ...errors(401) },
        },
      },
      '/api/profiles': {
        get: {
          tags: ['Akun'], operationId: 'listProfiles', summary: 'Daftar anggota',
          description: 'Dipakai untuk mencari id akun, misalnya saat Admin mengisi tim proyek (`members`, `leadId`).',
          responses: { 200: { description: 'Semua akun.', ...json({ type: 'array', items: ref('Profile') }) }, ...errors(401) },
        },
      },
      '/api/apps': {
        get: {
          tags: ['Aplikasi'], operationId: 'listApps', summary: 'Daftar aplikasi',
          description: 'Semua aplikasi aktif (tidak termasuk Sampah). Filter di sisi klien: milik sendiri berarti `createdBy` = id akun, atau akun ada di `members`.',
          responses: { 200: { description: 'Daftar aplikasi.', ...json({ type: 'array', items: ref('App') }) }, ...errors(401) },
        },
        post: {
          tags: ['Aplikasi'], operationId: 'createApp', summary: 'Tambah aplikasi',
          description: 'Wajib: `name`, `type`, `status`. Untuk User, `owner` selalu diisi server dengan nama akun.',
          requestBody: { required: true, ...json(ref('AppInput')) },
          responses: { 201: { description: 'Aplikasi dibuat.', ...json(ref('App')) }, ...errors(400, 401, 403, 409, 415) },
        },
      },
      '/api/apps/{id}': {
        get: {
          tags: ['Aplikasi'], operationId: 'getApp', summary: 'Detail aplikasi',
          parameters: [idParam],
          responses: { 200: { description: 'Aplikasi.', ...json(ref('App')) }, ...errors(401, 404) },
        },
        put: {
          tags: ['Aplikasi'], operationId: 'updateApp', summary: 'Ubah aplikasi',
          description: 'Kirim hanya field yang mau diganti; field lain tetap. `specs` yang dikirim menggantikan daftar lama (sertakan `id` poin lama agar tidak dibuat ulang). Untuk centang satu poin, pakai `checkSpec`.',
          parameters: [idParam],
          requestBody: { required: true, ...json({ ...ref('AppInput'), description: 'Sebagian field AppInput.' }) },
          responses: { 200: { description: 'Aplikasi setelah diubah.', ...json(ref('App')) }, ...errors(400, 401, 403, 404, 409, 415) },
        },
      },
      '/api/apps/{id}/specs/{specId}': {
        patch: {
          tags: ['Aplikasi'], operationId: 'checkSpec', summary: 'Centang poin spesifikasi',
          description: 'Bisa dipakai Admin, pembuat, dan anggota tim proyek.',
          parameters: [idParam, { name: 'specId', in: 'path', required: true, description: 'Id poin spesifikasi (dari `specs[].id`).', schema: { type: 'string' } }],
          requestBody: { required: true, ...json({ type: 'object', required: ['done'], properties: { done: { type: 'boolean', description: 'true = selesai, false = batal.' } } }) },
          responses: { 200: { description: 'Aplikasi setelah diubah.', ...json(ref('App')) }, ...errors(400, 401, 403, 404, 415) },
        },
      },
    },
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', description: 'Token dari Profil saya, format `applog_` + 64 karakter hex.' },
      },
      schemas: {
        Error: { type: 'object', required: ['error'], properties: { error: { type: 'string', example: 'Nama aplikasi wajib diisi.' } } },
        Profile: {
          type: 'object',
          properties: {
            id: { type: 'string' }, name: { type: 'string' }, username: { type: 'string' },
            role: { type: 'string', enum: ['admin', 'member'] }, active: { type: 'boolean' }, bio: { type: 'string' },
            photo: { type: 'string', description: 'Data URL gambar, atau kosong.' },
          },
        },
        Member: { type: 'object', properties: { userId: { type: 'string' }, lead: { type: 'boolean', description: 'true untuk ketua tim.' } } },
        Spec: { type: 'object', properties: { id: { type: 'string' }, text: { type: 'string' }, done: { type: 'boolean' } } },
        AppInput: {
          type: 'object',
          properties: {
            name: { type: 'string', maxLength: LIMITS.name, description: 'Nama unik.', example: 'Sistem Absensi Kampus' },
            owner: { type: 'string', maxLength: LIMITS.owner, description: 'Nama pembuat. Hanya Admin yang bisa mengisi; untuk User diisi server.' },
            type: { type: 'string', enum: APP_TYPES, description: 'internal, personal, atau project (Proyek).' },
            status: { type: 'string', enum: APP_STATUSES },
            tech: { type: 'string', maxLength: LIMITS.tech, description: 'Teknologi, dipisah koma.', example: 'React, Node.js' },
            link: { type: 'string', maxLength: LIMITS.link, description: 'URL http(s), atau kosong.' },
            description: { type: 'string', maxLength: LIMITS.description },
            startDate: { type: 'string', description: 'YYYY-MM-DD, atau kosong.', example: '2026-11-01' },
            endDate: { type: 'string', description: 'YYYY-MM-DD, atau kosong. Tidak boleh sebelum startDate.' },
            logo: { type: 'string', description: 'Data URL PNG, JPEG, atau WebP (maksimal sekitar 80 KB), atau kosong.' },
            client: { type: 'string', maxLength: LIMITS.client, description: 'Khusus project: pemberi proyek.', example: 'Pak Dosen Web' },
            deadline: { type: 'string', description: 'Khusus project: tenggat YYYY-MM-DD.' },
            members: { type: 'array', maxItems: LIMITS.members, items: { type: 'string' }, description: 'Khusus project, hanya Admin: id akun anggota tim.' },
            leadId: { type: 'string', description: 'Khusus project, hanya Admin: id ketua (harus ada di members).' },
            specs: {
              type: 'array', maxItems: LIMITS.specs, description: 'Khusus project, hanya Admin: poin spesifikasi.',
              items: { type: 'object', required: ['text'], properties: { id: { type: 'string', description: 'Id poin lama (saat mengubah).' }, text: { type: 'string', maxLength: LIMITS.spec }, done: { type: 'boolean' } } },
            },
          },
        },
        App: {
          type: 'object',
          properties: {
            id: { type: 'string' }, name: { type: 'string' }, owner: { type: 'string' },
            type: { type: 'string', enum: APP_TYPES }, status: { type: 'string', enum: APP_STATUSES },
            tech: { type: 'string' }, link: { type: 'string' }, description: { type: 'string' }, year: { type: 'string' },
            logo: { type: 'string' }, startDate: { type: 'string' }, endDate: { type: 'string' },
            client: { type: 'string' }, deadline: { type: 'string' },
            members: { type: 'array', items: ref('Member') }, specs: { type: 'array', items: ref('Spec') },
            createdBy: { type: 'string', description: 'Id akun pembuat.' },
            createdAt: { type: 'string', format: 'date-time' }, updatedAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
  };
}

/* ---------- Tampilan ---------- */

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
// Markdown minimal di deskripsi: **tebal** dan `kode`.
const inline = value => esc(value).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/`([^`]+)`/g, '<code>$1</code>');
const paragraphs = value => String(value || '').split(/\n\s*\n/).map(p => `<p>${inline(p.replace(/\n/g, ' '))}</p>`).join('');

const schemaName = schema => (schema && schema.$ref ? schema.$ref.split('/').pop() : null);
function typeLabel(schema) {
  if (!schema) return '';
  if (schema.$ref) return schemaName(schema);
  if (schema.type === 'array') return `${typeLabel(schema.items) || 'object'}[]`;
  if (schema.enum) return schema.enum.map(v => `"${v}"`).join(' | ');
  return schema.type || 'object';
}

function operations(spec) {
  const list = [];
  for (const [route, methods] of Object.entries(spec.paths)) {
    for (const [method, op] of Object.entries(methods)) list.push({ route, method: method.toUpperCase(), op });
  }
  return list;
}

function exampleBody(op) {
  if (op.operationId === 'createApp') return { name: 'Sistem Absensi Kampus', type: 'project', status: 'Dikerjakan', client: 'Pak Dosen Web', deadline: '2026-12-20', tech: 'React, Node.js' };
  if (op.operationId === 'updateApp') return { status: 'Selesai', endDate: '2026-12-18' };
  if (op.operationId === 'checkSpec') return { done: true };
  return null;
}

function curl(baseUrl, { route, method, op }) {
  const body = exampleBody(op);
  const lines = [`curl ${method === 'GET' ? '' : `-X ${method} `}"${baseUrl}${route.replace('{id}', 'ID_APLIKASI').replace('{specId}', 'ID_POIN')}"`, '  -H "Authorization: Bearer $APPLOG_TOKEN"'];
  if (body) lines.push('  -H "Content-Type: application/json"', `  -d '${JSON.stringify(body)}'`);
  return lines.join(' \\\n');
}

function propertiesTable(schema) {
  const rows = Object.entries(schema.properties || {}).map(([key, prop]) => {
    const required = (schema.required || []).includes(key);
    return `<tr><td><code>${esc(key)}</code>${required ? ' <span class="req">wajib</span>' : ''}</td><td><code>${esc(typeLabel(prop))}</code></td><td>${inline(prop.description || '')}${prop.maxLength ? ` <span class="muted">Maks ${prop.maxLength} karakter.</span>` : ''}</td></tr>`;
  });
  return `<table><thead><tr><th>Field</th><th>Tipe</th><th>Keterangan</th></tr></thead><tbody>${rows.join('')}</tbody></table>`;
}

function renderDocs(spec) {
  const baseUrl = spec.servers[0].url;
  const ops = operations(spec);
  const nav = ops.map(({ method, op }) => `<a href="#${op.operationId}"><span class="m ${method.toLowerCase()}">${method}</span>${esc(op.summary)}</a>`).join('');
  const sections = ops.map(item => {
    const { route, method, op } = item;
    const reqSchema = op.requestBody && op.requestBody.content['application/json'].schema;
    const reqName = schemaName(reqSchema);
    const ok = Object.entries(op.responses).find(([code]) => code.startsWith('2'));
    const okSchema = ok[1].content && ok[1].content['application/json'].schema;
    const params = (op.parameters || []).map(p => `<li><code>${esc(p.name)}</code>: ${inline(p.description)}</li>`).join('');
    const codes = Object.entries(op.responses).map(([code, r]) => `<li><code>${code}</code> ${inline(r.description)}</li>`).join('');
    return `<section class="op" id="${op.operationId}">
      <h3><span class="m ${method.toLowerCase()}">${method}</span><code>${esc(route)}</code></h3>
      <p class="summary">${esc(op.summary)} <span class="muted">· operationId <code>${esc(op.operationId)}</code></span></p>
      ${op.description ? paragraphs(op.description) : ''}
      ${params ? `<h4>Parameter</h4><ul>${params}</ul>` : ''}
      ${reqSchema ? `<h4>Body</h4><p><a href="#schema-${reqName}"><code>${esc(reqName)}</code></a>${reqSchema.description ? ` ${inline(reqSchema.description)}` : ''}${reqSchema.properties ? '' : ''}</p>${reqSchema.properties ? propertiesTable(reqSchema) : ''}` : ''}
      <h4>Respons</h4><p><code>${esc(typeLabel(okSchema))}</code></p><ul class="codes">${codes}</ul>
      <h4>Contoh</h4><pre><code>${esc(curl(baseUrl, item))}</code></pre>
    </section>`;
  }).join('');
  const schemas = Object.entries(spec.components.schemas).map(([name, schema]) => `<section class="op" id="schema-${name}"><h3><code>${name}</code></h3>${propertiesTable(schema)}</section>`).join('');

  return `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AppLog API</title>
<link rel="icon" href="/logo.svg">
<link rel="stylesheet" href="/docs.css">
</head>
<body>
<header class="top"><div class="wrap"><a class="brand" href="/"><img src="/logo.svg" alt="" width="26" height="26">AppLog <span>API</span></a><nav><a href="/api/openapi.json">openapi.json</a><a href="/llms.txt">llms.txt</a></nav></div></header>
<div class="wrap layout">
<aside><p class="side-title">Endpoint</p>${nav}<p class="side-title">Skema</p>${Object.keys(spec.components.schemas).map(n => `<a href="#schema-${n}">${n}</a>`).join('')}</aside>
<main>
<h1>AppLog API <span class="ver">v${esc(spec.info.version)}</span></h1>
${paragraphs(spec.info.description)}
<div class="card"><h4>Base URL</h4><pre><code>${esc(baseUrl)}</code></pre>
<h4>Untuk AI agent</h4><p>Berikan URL spesifikasi ini ke agent: <a href="/api/openapi.json"><code>${esc(baseUrl)}/api/openapi.json</code></a>. Agent yang mendukung MCP juga bisa memakai server MCP <code>mcp/applog-mcp.cjs</code> dengan <code>APPLOG_URL=${esc(baseUrl)}</code>.</p>
<h4>Cek token</h4><pre><code>curl "${esc(baseUrl)}/api/session" -H "Authorization: Bearer $APPLOG_TOKEN"</code></pre></div>
<h2>Endpoint</h2>${sections}
<h2>Skema</h2>${schemas}
</main>
</div>
</body>
</html>`;
}

function renderLlms(spec) {
  const baseUrl = spec.servers[0].url;
  const out = [`# AppLog API`, '', `Base URL: ${baseUrl}`, `OpenAPI: ${baseUrl}/api/openapi.json`, `Docs: ${baseUrl}/docs`, '', spec.info.description, '', '## Endpoint', ''];
  for (const item of operations(spec)) {
    const { route, method, op } = item;
    out.push(`### ${method} ${route} (${op.operationId})`, '', op.summary + '.' + (op.description ? ' ' + op.description : ''), '');
    const body = op.requestBody && op.requestBody.content['application/json'].schema;
    if (body) out.push(`Body: ${schemaName(body) || 'object'}${body.properties ? ' ' + JSON.stringify(Object.keys(body.properties)) : ''}`, '');
    out.push('```bash', curl(baseUrl, item), '```', '');
  }
  out.push('## Skema', '');
  for (const [name, schema] of Object.entries(spec.components.schemas)) {
    out.push(`### ${name}`, '');
    for (const [key, prop] of Object.entries(schema.properties || {})) out.push(`- \`${key}\` (${typeLabel(prop)})${prop.description ? ': ' + prop.description : ''}`);
    out.push('');
  }
  return out.join('\n');
}

const DOCS_CSS = `*{box-sizing:border-box}
:root{--ink:#0f1b33;--muted:#5d6b85;--line:#e3e8f0;--soft:#f5f7fb;--accent:#1d3a8a;--code:#0f1b33}
body{margin:0;font:15px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--ink);background:#fff}
a{color:var(--accent)}
.wrap{max-width:1180px;margin:0 auto;padding:0 20px}
.top{position:sticky;top:0;z-index:2;background:rgba(255,255,255,.92);backdrop-filter:blur(8px);border-bottom:1px solid var(--line)}
.top .wrap{display:flex;align-items:center;justify-content:space-between;height:58px}
.brand{display:flex;align-items:center;gap:10px;font-weight:700;font-size:18px;color:var(--ink);text-decoration:none}
.brand span{color:var(--accent);font-weight:600}
.top nav{display:flex;gap:16px;font-size:14px}
.layout{display:grid;grid-template-columns:220px minmax(0,1fr);gap:40px;padding-top:28px;padding-bottom:80px}
aside{position:sticky;top:80px;align-self:start;display:grid;gap:2px;max-height:calc(100vh - 100px);overflow:auto}
aside a{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:8px;color:var(--ink);text-decoration:none;font-size:14px}
aside a:hover{background:var(--soft)}
.side-title{margin:14px 8px 4px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);font-weight:700}
h1{font-size:32px;margin:0 0 12px;line-height:1.2}
.ver{font-size:14px;color:var(--muted);font-weight:500}
h2{margin:48px 0 8px;font-size:22px}
h3{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:0 0 4px;font-size:17px}
h4{margin:18px 0 6px;font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}
code{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:.88em;background:var(--soft);padding:1px 5px;border-radius:5px}
pre{margin:0;background:#0f1b33;color:#e7ecf7;padding:14px 16px;border-radius:10px;overflow-x:auto;font-size:13px;line-height:1.55}
pre code{background:none;padding:0;color:inherit;font-size:inherit}
.card,.op{border:1px solid var(--line);border-radius:14px;padding:20px 22px;margin:16px 0;scroll-margin-top:76px}
.card{background:var(--soft)}
.card pre{margin-bottom:4px}
.summary{margin:0;font-weight:600}
.muted{color:var(--muted);font-weight:400}
.m{display:inline-block;min-width:54px;text-align:center;font:700 11px/1 ui-monospace,Consolas,monospace;padding:5px 6px;border-radius:6px;color:#fff}
.m.get{background:#0f7a5a}.m.post{background:#1d3a8a}.m.put{background:#b26a00}.m.patch{background:#7a3db8}.m.delete{background:#b42318}
table{width:100%;border-collapse:collapse;font-size:14px;display:block;overflow-x:auto}
th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:top}
th{font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em}
td:first-child{white-space:nowrap}
.req{font-size:11px;color:#b42318;font-weight:700}
ul{padding-left:20px;margin:6px 0}
.codes li{margin:2px 0}
@media (max-width:860px){.layout{grid-template-columns:1fr}aside{display:none}h1{font-size:26px}.op,.card{padding:16px}}
`;

module.exports = { buildSpec, renderDocs, renderLlms, DOCS_CSS };
