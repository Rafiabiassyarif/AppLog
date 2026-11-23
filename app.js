const STORAGE_KEY = "kroombox-app-registry-v1";
const internalStyle=document.createElement('link');internalStyle.rel='stylesheet';internalStyle.href='/internal.css';document.head.append(internalStyle);
const accentColors = ["#7c5cff", "#4385f5", "#17a673", "#e47635", "#d14f7b", "#5363cf"];

const state = {
  user: null,
  ownOnly: false,
  apps: [],
  search: "",
  type: "all",
  status: "all",
  view: "apps",
};

const els = {
  grid: document.querySelector("#appsGrid"),
  empty: document.querySelector("#emptyState"),
  emptyTitle: document.querySelector("#emptyTitle"),
  emptyText: document.querySelector("#emptyText"),
  search: document.querySelector("#searchInput"),
  typeFilter: document.querySelector("#typeFilter"),
  statusFilter: document.querySelector("#statusFilter"),
  modal: document.querySelector("#appModal"),
  form: document.querySelector("#appForm"),
  modalTitle: document.querySelector("#modalTitle"),
  toast: document.querySelector("#toast"),
  totalStat: document.querySelector("#totalStat"),
  internalStat: document.querySelector("#internalStat"),
  personalStat: document.querySelector("#personalStat"),
  finishedStat: document.querySelector("#finishedStat"),
};

function loadApps() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveApps() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.apps));
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}

function initials(name) {
  return name.trim().split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase()).join("") || "?";
}

function appInitials(name) {
  return name.trim().split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase()).join("") || "AP";
}

function filteredApps() {
  const query = state.search.toLowerCase().trim();
  return state.apps
    .filter(app => !state.ownOnly || app.createdBy===state.user?.id)
    .filter(app => state.view === "apps" || app.type === state.view)
    .filter(app => state.type === "all" || app.type === state.type)
    .filter(app => state.status === "all" || app.status === state.status)
    .filter(app => !query || [app.name, app.owner, app.tech, app.description].join(" ").toLowerCase().includes(query))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function statusClass(status) {
  return `status-${status.toLowerCase().replace(/\s+/g, "-")}`;
}

function render() {
  const apps = filteredApps();
  els.grid.innerHTML = apps.map((app, index) => {
    const techs = app.tech.split(",").map(item => item.trim()).filter(Boolean).slice(0, 4);
    const typeLabel = app.type === "internal" ? "Internal" : "Personal";
    const link = app.link ? `<a class="open-link" href="${escapeHtml(app.link)}" target="_blank" rel="noopener">Buka link ↗</a>` : `<span>${escapeHtml(app.year || "—")}</span>`;
    return `
      <article class="app-card" style="--card-accent:${accentColors[index % accentColors.length]}">
        <div class="app-card-head">
          <div class="app-logo">${escapeHtml(appInitials(app.name))}</div>
          <div class="card-menu">
            ${state.user?.role==='admin' || app.createdBy===state.user?.id ? `<button class="icon-button menu-trigger" type="button" aria-label="Menu ${escapeHtml(app.name)}" data-id="${app.id}">•••</button>` : ''}
            <div class="card-menu-panel" data-menu="${app.id}" hidden>
              <button type="button" data-action="edit" data-id="${app.id}">Edit data</button>
              <button class="danger" type="button" data-action="delete" data-id="${app.id}">Hapus</button>
            </div>
          </div>
        </div>
        <div class="badges">
          <span class="badge badge-${app.type}">${typeLabel}</span>
          <span class="badge ${statusClass(app.status)}">${escapeHtml(app.status)}</span>
        </div>
        <h3>${escapeHtml(app.name)}</h3>
        <p class="app-description">${escapeHtml(app.description || "Belum ada deskripsi aplikasi.")}</p>
        <div class="tech-list">${techs.map(tech => `<span class="tech-pill">${escapeHtml(tech)}</span>`).join("")}</div>
        <footer class="app-card-footer">
          <div class="owner"><span class="avatar">${escapeHtml(initials(app.owner))}</span><span>${escapeHtml(app.owner)}</span></div>
          ${link}
        </footer>
      </article>`;
  }).join("");

  els.grid.hidden = apps.length === 0;
  els.empty.hidden = apps.length > 0;
  const hasData = state.apps.length > 0;
  els.emptyTitle.textContent = hasData ? "Data tidak ditemukan" : "Belum ada aplikasi";
  els.emptyText.textContent = hasData ? "Coba ubah kata pencarian atau filter yang dipilih." : "Mulai catat aplikasi yang sudah atau sedang dikerjakan tim Kroombox.";
  if(document.querySelector("#sampleButton")) document.querySelector("#sampleButton").hidden = hasData;
  document.querySelector("#emptyAddButton").textContent = hasData ? "Tambah aplikasi" : "Tambah aplikasi pertama";

  els.totalStat.textContent = state.apps.length;
  els.internalStat.textContent = state.apps.filter(app => app.type === "internal").length;
  els.personalStat.textContent = state.apps.filter(app => app.type === "personal").length;
  els.finishedStat.textContent = state.apps.filter(app => app.status === "Selesai").length;
}

function openModal(app = null) {
  els.form.reset();
  document.querySelector("#appId").value = app?.id || "";
  document.querySelector("#nameInput").value = app?.name || "";
  document.querySelector("#formType").value = app?.type || "internal";
  document.querySelector("#formStatus").value = app?.status || "Dikerjakan";
  document.querySelector("#ownerInput").value = state.user?.role==='admin' ? (app?.owner || '') : state.user?.name || '';
  document.querySelector("#ownerInput").readOnly=state.user?.role!=='admin';
  document.querySelector("#yearInput").value = app?.year || new Date().getFullYear();
  document.querySelector("#techInput").value = app?.tech || "";
  document.querySelector("#linkInput").value = app?.link || "";
  document.querySelector("#descriptionInput").value = app?.description || "";
  els.modalTitle.textContent = app ? "Edit Aplikasi" : "Tambah Aplikasi";
  els.modal.hidden = false;
  document.body.style.overflow = "hidden";
  setTimeout(() => document.querySelector("#nameInput").focus(), 20);
}

function closeModal() {
  els.modal.hidden = true;
  document.body.style.overflow = "";
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => els.toast.classList.remove("show"), 2400);
}

function createId() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

els.form.addEventListener("submit", async event => {
  event.preventDefault();
  const id = document.querySelector("#appId").value;
  const existing = state.apps.find(app => app.id === id);
  const app = {
    id: id || createId(),
    name: document.querySelector("#nameInput").value.trim(),
    type: document.querySelector("#formType").value,
    status: document.querySelector("#formStatus").value,
    owner: document.querySelector("#ownerInput").value.trim(),
    year: document.querySelector("#yearInput").value,
    tech: document.querySelector("#techInput").value.trim(),
    link: document.querySelector("#linkInput").value.trim(),
    description: document.querySelector("#descriptionInput").value.trim(),
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  try { await api('/api/apps', {method:'POST',body:JSON.stringify(app)}); state.apps=await api('/api/apps'); } catch(error){showToast(error.message);return;}
  render();
  closeModal();
  showToast(existing ? "Data aplikasi berhasil diperbarui." : "Aplikasi berhasil ditambahkan.");
});

document.addEventListener("click", async event => {
  const trigger = event.target.closest(".menu-trigger");
  document.querySelectorAll(".card-menu-panel").forEach(menu => {
    if (!trigger || menu.dataset.menu !== trigger.dataset.id) menu.hidden = true;
  });
  if (trigger) {
    const menu = document.querySelector(`[data-menu="${trigger.dataset.id}"]`);
    menu.hidden = !menu.hidden;
    return;
  }
  const action = event.target.closest("[data-action]");
  if (!action) return;
  const app = state.apps.find(item => item.id === action.dataset.id);
  if (action.dataset.action === "edit") openModal(app);
  if (action.dataset.action === "delete" && confirm(`Hapus “${app.name}” dari daftar?`)) {
    try { await api('/api/apps/'+app.id,{method:'DELETE'});state.apps=await api('/api/apps'); }catch(error){showToast(error.message);return;}
    render();
    showToast("Data aplikasi sudah dihapus.");
  }
});

document.querySelectorAll("#addButton, #emptyAddButton").forEach(button => button.addEventListener("click", () => openModal()));
document.querySelectorAll("#closeModalButton, #cancelButton").forEach(button => button.addEventListener("click", closeModal));
els.modal.addEventListener("click", event => { if (event.target === els.modal) closeModal(); });
document.addEventListener("keydown", event => { if (event.key === "Escape" && !els.modal.hidden) closeModal(); });

els.search.addEventListener("input", event => { state.search = event.target.value; render(); });
els.typeFilter.addEventListener("change", event => { state.type = event.target.value; render(); });
els.statusFilter.addEventListener("change", event => { state.status = event.target.value; render(); });

document.querySelectorAll(".nav-item").forEach(button => button.addEventListener("click", () => {
  document.querySelectorAll(".nav-item").forEach(item => item.classList.remove("active"));
  button.classList.add("active");
  state.view = button.dataset.view;
  state.type = "all";
  els.typeFilter.value = "all";
  render();
}));

document.querySelector("#sampleButton").addEventListener("click", () => {
  const now = new Date().toISOString();
  state.apps = [
    { id: createId(), name: "Kroombox Inventory", type: "internal", status: "Selesai", owner: "Tim Kroombox", year: "2026", tech: "Laravel, MySQL, Tailwind", link: "", description: "Pendataan stok dan pergerakan barang operasional.", createdAt: now, updatedAt: now },
    { id: createId(), name: "Finance Tracker", type: "personal", status: "Dikerjakan", owner: "Raka", year: "2026", tech: "React, Firebase", link: "", description: "Aplikasi personal untuk mencatat pemasukan dan pengeluaran.", createdAt: now, updatedAt: new Date(Date.now() - 1000).toISOString() },
    { id: createId(), name: "Landing Page Kroombox", type: "internal", status: "Maintenance", owner: "Dimas", year: "2025", tech: "Next.js, Vercel", link: "", description: "Website utama dan halaman informasi layanan Kroombox.", createdAt: now, updatedAt: new Date(Date.now() - 2000).toISOString() },
  ];
  saveApps();
  render();
  showToast("Data contoh berhasil ditambahkan.");
});

document.querySelector("#exportButton").addEventListener("click", () => {
  if (!state.apps.length) return showToast("Belum ada data untuk diekspor.");
  const blob = new Blob([JSON.stringify(state.apps, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `kroombox-apps-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
  showToast("Data berhasil diekspor.");
});

async function api(url,options={}) {
  const response=await fetch(url,{...options,headers:{'Content-Type':'application/json'}});
  const data=await response.json();if(!response.ok)throw Error(data.error||'Permintaan gagal.');return data;
}
function exportReport(extension){
  const params=new URLSearchParams();
  if(state.ownOnly)params.set('createdBy',state.user.id);
  const type=state.view==='apps'?state.type:state.view;
  if(type!=='all')params.set('type',type);if(state.status!=='all')params.set('status',state.status);params.set('q',state.search);
  window.location.href='/api/export.'+extension+'?'+params;
}
document.querySelector('#exportButton').replaceWith(Object.assign(document.createElement('button'),{className:'button button-secondary',textContent:'↓ Excel',onclick:()=>exportReport('xlsx')}));
const pdfButton=Object.assign(document.createElement('button'),{className:'button button-secondary',textContent:'↓ PDF',onclick:()=>exportReport('pdf')});
document.querySelector('.topbar-actions').prepend(pdfButton);
document.querySelector('#sampleButton').remove();
document.querySelector('.sidebar-note p').textContent='Data tim tersimpan bersama di server Kroombox.';
async function initialize(){
  try{
    const session=await api('/api/session');if(!session.user){location.href='/login';return;}
    state.user=session.user;
    const isAdmin=session.user.role==='admin';
    const destination=isAdmin?'/admin':'/user';
    if(location.pathname!==destination){location.replace(destination);return;}
    document.title=(isAdmin?'Admin':'User')+' — Kroombox';
    document.querySelector('h1').textContent=isAdmin?'Dashboard Admin':'Dashboard User';
    document.querySelector('.eyebrow').textContent=isAdmin?'ADMIN KROOMBOX':'ANGGOTA KROOMBOX';
    document.querySelector('.subtitle').textContent=isAdmin?'Kelola seluruh aplikasi dan akun anggota Kroombox.':'Catat aplikasi milikmu dan lihat karya anggota Kroombox.';
    const own=Object.assign(document.createElement('button'),{className:'nav-item',textContent:'Aplikasi saya',onclick:()=>{state.ownOnly=true;state.view='apps';state.type='all';els.typeFilter.value='all';document.querySelectorAll('.nav-item').forEach(b=>b.classList.remove('active'));own.classList.add('active');render();}});
    document.querySelector('.main-nav').append(own);
    document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>{state.ownOnly=false;render();}));
    const area=document.createElement('div');area.className='account-area';
    const name=document.createElement('p');name.textContent=session.user.name+' · '+(isAdmin?'Admin':'User');area.append(name);
    if(session.user.role==='admin'){
      const manage=Object.assign(document.createElement('button'),{className:'button button-secondary',textContent:'Kelola akun',onclick:showAccounts});area.append(manage);
    }
    area.append(Object.assign(document.createElement('button'),{className:'text-button',textContent:'Keluar',onclick:async()=>{await api('/api/logout',{method:'POST'});location.href='/';}}));
    document.querySelector('.sidebar').append(area);state.apps=await api('/api/apps');render();
  }catch(error){showToast(error.message);}
}
async function showAccounts(){
  const overlay=document.createElement('div');overlay.className='modal-backdrop';
  overlay.innerHTML='<section class="modal" role="dialog" aria-modal="true" aria-label="Kelola akun"><header class="modal-header"><h2>Kelola akun anggota</h2><button class="icon-button" type="button">×</button></header><form><p>Akun anggota hanya dibuat oleh admin.</p><div class="form-grid"><label class="field field-full">Nama<input name="name" required maxlength="60"></label><label class="field">Username<input name="username" required pattern="[a-zA-Z0-9_.-]{3,40}"></label><label class="field">Password<input name="password" type="password" required minlength="8" maxlength="128" autocomplete="new-password"></label></div><p class="account-error" role="status"></p><button class="button button-primary">Buat akun anggota</button><h3 style="margin-top:24px">Daftar akun</h3><div class="users-list"></div></form></section>';
  overlay.querySelector('.icon-button').onclick=()=>overlay.remove();document.body.append(overlay);
  const list=async()=>{const users=await api('/api/users');overlay.querySelector('.users-list').replaceChildren(...users.map(u=>{const row=document.createElement('p');row.textContent=u.name+' (@'+u.username+') · '+u.role;return row;}));};
  await list();overlay.querySelector('form').onsubmit=async event=>{event.preventDefault();const form=event.target;try{await api('/api/users',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(form)))});form.reset();overlay.querySelector('.account-error').textContent='Akun berhasil dibuat.';await list();}catch(error){overlay.querySelector('.account-error').textContent=error.message;}};
}
initialize();
