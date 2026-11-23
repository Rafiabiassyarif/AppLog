const fs=require('fs'),path=require('path'),crypto=require('crypto');
const [username,role='member',...names]=process.argv.slice(2);
if(!/^[a-zA-Z0-9_.-]{3,40}$/.test(username||'')||!['admin','member'].includes(role)){console.error('Pemakaian: node scripts/create-account.cjs username admin|member Nama Anggota');process.exit(1);}
const file=process.env.DATA_FILE||path.join(__dirname,'..','data','registry.json');
fs.mkdirSync(path.dirname(file),{recursive:true});
const db=fs.existsSync(file)?JSON.parse(fs.readFileSync(file)): {users:[],apps:[]};
if(db.users.some(u=>u.username===username.toLowerCase())){console.error('Username sudah ada; akun lama tidak diubah.');process.exit(1);}
const password=crypto.randomBytes(12).toString('base64url')+'!9';
const salt=crypto.randomBytes(16).toString('hex');
db.users.push({id:crypto.randomUUID(),username:username.toLowerCase(),name:names.join(' ')||username,role,salt,hash:crypto.scryptSync(password,salt,64).toString('hex')});
fs.writeFileSync(file+'.tmp',JSON.stringify(db,null,2));fs.renameSync(file+'.tmp',file);
console.log(JSON.stringify({username,password,role}));
