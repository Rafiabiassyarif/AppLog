let setup=false;
const style=document.createElement('link');style.rel='stylesheet';style.href='/internal.css';document.head.append(style);
const form=document.querySelector('#authForm');
document.querySelector('#authTitle').textContent='Masuk Kroombox';
document.querySelector('#authDescription').textContent='Pendataan aplikasi internal. Masuk menggunakan akun dari admin.';
document.querySelector('.login-story').hidden=true;
document.querySelector('.login-panel > a').hidden=true;
document.querySelector('.login-help').textContent='Akun dibuat oleh admin. Halaman Admin atau User terbuka otomatis setelah login.';
async function request(url,data){const r=await fetch(url,data?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}:{});const b=await r.json();if(!r.ok)throw Error(b.error);return b;}
request('/api/session').then(s=>{if(s.user){location.href=s.user.role==='admin'?'/admin':'/user';return;}setup=s.setupRequired;if(setup){document.querySelector('#authTitle').textContent='Siapkan workspace kamu.';document.querySelector('#authDescription').textContent='Buat akun admin pertama. Setelah itu, akun anggota bisa kamu buat sendiri.';document.querySelector('#nameField').hidden=false;form.elements.name.required=true;document.querySelector('#authSubmit').textContent='Buat admin & masuk ↗';}}).catch(e=>document.querySelector('#authError').textContent=e.message);
form.onsubmit=async e=>{e.preventDefault();const button=document.querySelector('#authSubmit');button.disabled=true;document.querySelector('#authError').textContent='';const data=Object.fromEntries(new FormData(form));try{if(setup){await request('/api/setup',data);setup=false;}await request('/api/login',data);location.href='/dashboard';}catch(error){document.querySelector('#authError').textContent=error.message;}finally{button.disabled=false;}};
