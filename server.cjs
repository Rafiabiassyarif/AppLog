const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const root = __dirname;
const dataFile = process.env.DATA_FILE || path.join(root, 'data', 'registry.json');
fs.mkdirSync(path.dirname(dataFile), { recursive: true });
let db = fs.existsSync(dataFile) ? JSON.parse(fs.readFileSync(dataFile)) : { users: [], apps: [] };
const persist = () => { fs.writeFileSync(dataFile + '.tmp', JSON.stringify(db, null, 2)); fs.renameSync(dataFile + '.tmp', dataFile); };
const sessions = new Map();
const attempts = new Map();
function publicUser(u) { return { id:u.id, name:u.name, username:u.username, role:u.role }; }
function passwordHash(password, salt) { return crypto.scryptSync(password, salt, 64).toString('hex'); }
function makeUser(body, role) {
  if (!/^[a-zA-Z0-9_.-]{3,40}$/.test(body.username || '') || typeof body.name !== 'string' || !body.name.trim() || typeof body.password !== 'string' || body.password.length < 8 || body.password.length > 128) throw Error('Nama wajib diisi, username 3–40 karakter, password 8–128 karakter.');
  if (db.users.some(u => u.username === body.username.toLowerCase())) throw Error('Username sudah digunakan.');
  const salt = crypto.randomBytes(16).toString('hex');
  return { id:crypto.randomUUID(), name:body.name.trim().slice(0,60), username:body.username.toLowerCase(), role, salt, hash:passwordHash(body.password,salt) };
}
async function bodyOf(req) { let text=''; for await (const part of req) { text += part; if(text.length>1000000) throw Error('Data terlalu besar.'); } return JSON.parse(text || '{}'); }
function filtered(url) { const q=(url.searchParams.get('q')||'').toLowerCase(); return db.apps.filter(a => (!url.searchParams.get('createdBy') || a.createdBy===url.searchParams.get('createdBy')) && (!url.searchParams.get('type') || a.type===url.searchParams.get('type')) && (!url.searchParams.get('status') || a.status===url.searchParams.get('status')) && (!q || [a.name,a.owner,a.tech,a.description].join(' ').toLowerCase().includes(q))); }
const columns = ['No.','Nama aplikasi','Jenis','Status','Pembuat','Tahun','Teknologi','Link','Deskripsi'];
const values = (a,i) => [i+1,a.name,a.type==='internal'?'Internal Kroombox':'Personal',a.status,a.owner,a.year,a.tech,a.link,a.description];
http.createServer(async (req,res) => {
  const url = new URL(req.url,'http://localhost');
  const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  try {
    if(url.pathname.startsWith('/api/')) {
      if(req.method!=='GET' && req.headers['sec-fetch-site']==='cross-site') return send(403,{error:'Permintaan ditolak.'});
      const token=(req.headers.cookie||'').match(/(?:^|; )session=([^;]+)/)?.[1];
      const session=sessions.get(token);
      const user=session && session.expires>Date.now() ? db.users.find(u=>u.id===session.userId):null;
      if(url.pathname==='/api/session') return send(200,{user:user?publicUser(user):null,setupRequired:db.users.length===0});
      if(url.pathname==='/api/login' && req.method==='POST') {
        const key=req.socket.remoteAddress; const limit=attempts.get(key)||{count:0,until:Date.now()+60000};
        if(limit.until<Date.now()){limit.count=0;limit.until=Date.now()+60000;}
        if(++limit.count>10) return send(429,{error:'Terlalu banyak percobaan. Tunggu satu menit.'});attempts.set(key,limit);
        const b=await bodyOf(req);const u=db.users.find(u=>u.username===String(b.username).toLowerCase());
        if(!u || typeof b.password!=='string' || b.password.length>128 || !crypto.timingSafeEqual(Buffer.from(u.hash,'hex'),Buffer.from(passwordHash(b.password,u.salt),'hex'))) return send(401,{error:'Username atau password salah.'});
        const t=crypto.randomBytes(32).toString('hex');sessions.set(t,{userId:u.id,expires:Date.now()+28800000});
        res.setHeader('Set-Cookie',`session=${t}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`);return send(200,{user:publicUser(u)});
      }
      if(!user) return send(401,{error:'Silakan login terlebih dahulu.'});
      if(url.pathname==='/api/password' && req.method==='POST'){
        const body=await bodyOf(req);
        if(typeof body.currentPassword!=='string'||body.currentPassword.length>128||!crypto.timingSafeEqual(Buffer.from(user.hash,'hex'),Buffer.from(passwordHash(body.currentPassword,user.salt),'hex')))return send(400,{error:'Password saat ini tidak sesuai.'});
        if(typeof body.password!=='string'||body.password.length<8||body.password.length>128)return send(400,{error:'Password baru harus 8–128 karakter.'});
        user.salt=crypto.randomBytes(16).toString('hex');user.hash=passwordHash(body.password,user.salt);persist();
        for(const [key,s] of sessions)if(s.userId===user.id&&key!==token)sessions.delete(key);
        return send(200,{ok:true});
      }
      if(url.pathname==='/api/logout') {sessions.delete(token);res.setHeader('Set-Cookie','session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');return send(200,{ok:true});}
      if(url.pathname==='/api/users') {
        if(user.role!=='admin')return send(403,{error:'Hanya admin yang dapat mengelola akun.'});
        if(req.method==='GET')return send(200,db.users.map(publicUser));
        if(req.method==='POST'){db.users.push(makeUser(await bodyOf(req),'member'));persist();return send(201,{ok:true});}
      }
      if(url.pathname==='/api/apps' && req.method==='GET')return send(200,db.apps);
      if(url.pathname==='/api/apps' && req.method==='POST') {
        const b=await bodyOf(req);
        if(!b.name?.trim()||!b.owner?.trim()||!['internal','personal'].includes(b.type)||!['Ide','Dikerjakan','Selesai','Maintenance'].includes(b.status))throw Error('Data aplikasi tidak valid.');
        if(b.link && !/^https?:\/\//i.test(b.link))throw Error('Link harus menggunakan http atau https.');
        const old=db.apps.find(a=>a.id===b.id);const now=new Date().toISOString();
        if(old && user.role!=='admin' && old.createdBy!==user.id)return send(403,{error:'Kamu hanya dapat mengubah aplikasi milikmu.'});
        const a={id:old?.id||crypto.randomUUID(),createdBy:old?.createdBy||user.id,createdAt:old?.createdAt||now,updatedAt:now};
        for(const field of ['name','owner','type','status','tech','link','description','year'])a[field]=String(b[field]||'').trim().slice(0,field==='description'?280:500);
        if(user.role!=='admin')a.owner=user.name;
        db.apps=old?db.apps.map(x=>x.id===a.id?a:x):[...db.apps,a];persist();return send(200,a);
      }
      if(url.pathname.startsWith('/api/apps/') && req.method==='DELETE'){
        const id=url.pathname.split('/').pop();const app=db.apps.find(a=>a.id===id);
        if(!app)return send(404,{error:'Aplikasi tidak ditemukan.'});
        if(user.role!=='admin' && app.createdBy!==user.id)return send(403,{error:'Kamu hanya dapat menghapus aplikasi milikmu.'});
        db.apps=db.apps.filter(a=>a.id!==id);persist();return send(200,{ok:true});
      }
      if(url.pathname==='/api/export.xlsx') {
        const rows=filtered(url);const book=new ExcelJS.Workbook();book.creator='AppLog';const sheet=book.addWorksheet('Daftar Aplikasi',{views:[{state:'frozen',ySplit:4}],pageSetup:{orientation:'landscape',paperSize:9,fitToPage:true,fitToWidth:1,fitToHeight:0}});
        sheet.columns=[6,30,22,19,24,10,32,42,60].map(width=>({width}));sheet.mergeCells('A1:I1');sheet.getCell('A1').value='APPLOG • DAFTAR APLIKASI';sheet.getCell('A1').font={size:20,bold:true,color:{argb:'FFFFFFFF'}};sheet.getCell('A1').fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF143D32'}};sheet.getRow(1).height=42;
        sheet.mergeCells('A2:I2');sheet.getCell('A2').value=`Diekspor ${new Date().toLocaleDateString('id-ID')} · ${rows.length} aplikasi`;sheet.getRow(2).height=26;sheet.getRow(4).values=columns;sheet.getRow(4).height=30;
        sheet.getRow(4).eachCell(c=>{c.font={bold:true,color:{argb:'FF143D32'}};c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFD6EF85'}};});
        rows.forEach((a,i)=>{const row=sheet.addRow(values(a,i));row.height=Math.max(60,Math.min(180,Math.ceil(a.description.length/55)*15+15));row.eachCell(c=>{c.alignment={vertical:'middle',wrapText:true};c.font={size:11,color:{argb:'FF263B2E'}};c.fill={type:'pattern',pattern:'solid',fgColor:{argb:i%2?'FFF1F5EC':'FFFFFFFF'}};c.border={bottom:{style:'thin',color:{argb:'FFE5E7EB'}}};});});
        sheet.autoFilter='A4:I4';sheet.pageSetup.printTitlesRow='1:4';res.writeHead(200,{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':'attachment; filename="applog-apps.xlsx"'});await book.xlsx.write(res);return res.end();
      }
      if(url.pathname==='/api/export.pdf') {
        const rows=filtered(url);res.writeHead(200,{'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="applog-apps.pdf"'});
        const doc=new PDFDocument({size:'A4',layout:'landscape',margin:36});doc.pipe(res);
        const header=()=>{doc.fillColor('#143d32').fontSize(21).text('APPLOG / Daftar Aplikasi');doc.fontSize(10).fillColor('#666666').text(`Diekspor ${new Date().toLocaleDateString('id-ID')} | ${rows.length} aplikasi`,36,65);};header();let y=100;
        rows.forEach((a,i)=>{
          const parts=[
            {text:`${i+1}. ${a.name}`,size:13,color:'#143d32',gap:7},
            {text:`${a.type==='internal'?'Internal':'Personal'}  |  ${a.status}  |  ${a.owner}  |  ${a.year}`,size:9,color:'#6a7866',gap:5},
            {text:`Teknologi: ${a.tech||'-'}`,size:9,color:'#6a7866',gap:5},
            {text:`Link: ${a.link||'-'}`,size:9,color:'#6a7866',gap:7},
            {text:a.description||'-',size:10,color:'#3d4c36',gap:0}
          ];
          let height=24;
          for(const p of parts){doc.fontSize(p.size);p.height=doc.heightOfString(p.text,{width:740});height+=p.height+p.gap;}
          if(y+height>550){doc.addPage();header();y=100;}
          doc.rect(36,y,770,height).fill(i%2?'#f0f5e9':'#f7f9f5');let lineY=y+12;
          for(const p of parts){doc.fontSize(p.size).fillColor(p.color).text(p.text,48,lineY,{width:740});lineY+=p.height+p.gap;}
          y+=height+10;
        });
        if(!rows.length)doc.fontSize(12).text('Belum ada aplikasi sesuai filter.',36,100);doc.end();return;
      }
      return send(404,{error:'Tidak ditemukan.'});
    }
    if(['/dashboard','/admin','/user'].includes(url.pathname)) {
      const token=(req.headers.cookie||'').match(/(?:^|; )session=([^;]+)/)?.[1];
      const session=sessions.get(token);const u=session && session.expires>Date.now()?db.users.find(x=>x.id===session.userId):null;
      const destination=u?(u.role==='admin'?'/admin':'/user'):'/login';
      if(url.pathname!==destination){res.writeHead(302,{Location:destination,'Cache-Control':'no-store'});res.end();return;}
    }
    const frontend=path.join(root,'dist');
    let file;
    if(['/','/login','/admin','/user'].includes(url.pathname))file=path.join(frontend,'index.html');
    else if(url.pathname==='/logo.svg')file=path.join(frontend,'logo.svg');
    else if(url.pathname.startsWith('/assets/')){
      file=path.resolve(frontend,'.'+decodeURIComponent(url.pathname));
      if(!file.startsWith(frontend+path.sep))file=null;
    }
    if(!file||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end('Not found');return;}
    const types={'.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.html':'text/html; charset=utf-8'};
    res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});fs.createReadStream(file).pipe(res);
  }catch(e){if(!res.headersSent)send(400,{error:e.message});else res.end();}
}).listen(Number(process.env.PORT)||4173,'127.0.0.1',()=>console.log('AppLog: http://127.0.0.1:'+ (process.env.PORT||4173)));
