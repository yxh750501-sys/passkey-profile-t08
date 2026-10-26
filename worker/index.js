import { generateRegistrationOptions, verifyRegistrationResponse, generateAuthenticationOptions, verifyAuthenticationResponse } from '@simplewebauthn/server';

const HTML = __HTML__, CSS = __CSS__, PUBLIC_JS = __PUBLIC_JS__, AUTH_JS = __AUTH_JS__, IMAGES = __IMAGES__;
const headers = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
const json = (value, status = 200, extra = {}) => new Response(JSON.stringify(value), { status, headers: { ...headers, ...extra } });
const fail = (message, status = 400) => json({ error: message }, status);
const now = () => new Date().toISOString();
const productionHost = 'passkey-profile-t08.leehjn.chatgpt.site';
function randomToken() { const b = crypto.getRandomValues(new Uint8Array(32)); return btoa(String.fromCharCode(...b)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }
function b64(bytes) { return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }
function unb64(value) { const s = atob(value.replace(/-/g,'+').replace(/_/g,'/') + '='.repeat((4-value.length%4)%4)); return Uint8Array.from(s, c => c.charCodeAt(0)); }
async function hash(value) { const b = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)); return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join(''); }
function cookie(name, value, age) { return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${age}`; }
function getCookie(req,name) { return (req.headers.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='))?.slice(name.length+1)||''; }
async function session(req,db) { const token=getCookie(req,'t08_session'); if(!/^[\w-]{43}$/.test(token)) return null; return db.prepare('SELECT s.account_id,a.username FROM sessions s JOIN accounts a ON a.id=s.account_id WHERE s.token_hash=? AND s.expires_at>?').bind(await hash(token),now()).first(); }
async function issueSession(db,accountId) { const token=randomToken(); await db.prepare('INSERT INTO sessions VALUES (?,?,?)').bind(await hash(token),accountId,new Date(Date.now()+7*86400000).toISOString()).run(); return cookie('t08_session',token,7*86400); }
async function rows(db,sql,...args) { return (await db.prepare(sql).bind(...args).all()).results; }
async function one(db,sql,...args) { return db.prepare(sql).bind(...args).first(); }
async function readBody(req) { const raw=await req.text(); if(raw.length>25000) throw Error('요청이 너무 큽니다.'); return JSON.parse(raw); }
async function challenge(db,req,kind,accountId,username,value) { const id=crypto.randomUUID(); await db.prepare('INSERT INTO challenges VALUES (?,?,?,?,?,?)').bind(id,kind,accountId,username,value,new Date(Date.now()+5*60000).toISOString()).run(); return cookie('t08_flow',id,300); }
async function consume(db,req,kind) { const id=getCookie(req,'t08_flow'); const row=await one(db,'SELECT * FROM challenges WHERE id=? AND kind=? AND expires_at>?',id,kind,now()); if(!row) return null; await db.prepare('DELETE FROM challenges WHERE id=?').bind(id).run(); return row; }
function name(value) { const s=typeof value==='string'?value.trim().toLowerCase():''; if(!/^[a-z0-9_]{3,32}$/.test(s)) throw Error('아이디는 영문 소문자·숫자·_로 3~32자입니다.'); return s; }
function label(value) { const s=typeof value==='string'?value.trim():''; if(!s||s.length>60) throw Error('패스키 이름은 1~60자입니다.'); return s; }

async function api(req,db,path,body) {
  const requestUrl=new URL(req.url), host=requestUrl.hostname, origin=requestUrl.origin;
  const user=await session(req,db);
  if(path==='/api/me' && req.method==='GET') return user?json({username:user.username}):fail('로그인이 필요합니다.',401);
  if(path==='/api/register/options' && req.method==='POST') {
    const username=user?.username||name(body.username);
    if(!user && await one(db,'SELECT id FROM accounts WHERE username=?',username)) return fail('이미 사용 중인 아이디입니다.',409);
    const existing=user?await rows(db,'SELECT id FROM credentials WHERE account_id=?',user.account_id):[];
    const options=await generateRegistrationOptions({rpName:'내 소개와 패스키 공간',rpID:host,userName:username,userID:new TextEncoder().encode(user?.account_id||crypto.randomUUID()),attestationType:'none',authenticatorSelection:{residentKey:'preferred',userVerification:'required'},excludeCredentials:existing.map(x=>({id:x.id}))});
    return json(options,200,{'set-cookie':await challenge(db,req,'register',user?.account_id||null,username,options.challenge)});
  }
  if(path==='/api/register/verify' && req.method==='POST') {
    const pending=await consume(db,req,'register'); if(!pending) return fail('등록 질문이 만료되었거나 이미 사용됐습니다.',403);
    if(pending.account_id!== (user?.account_id||null)) return fail('등록 계정을 확인할 수 없습니다.',403);
    const result=await verifyRegistrationResponse({response:body.response,expectedChallenge:pending.challenge,expectedOrigin:origin,expectedRPID:host,requireUserVerification:true});
    if(!result.verified||!result.registrationInfo) return fail('패스키 등록을 확인하지 못했습니다.',403);
    const {credential}=result.registrationInfo;
    const accountId=user?.account_id||crypto.randomUUID(),time=now();
    const writes=[];
    if(!user) writes.push(db.prepare('INSERT INTO accounts VALUES (?,?,?)').bind(accountId,pending.username,time));
    writes.push(db.prepare('INSERT INTO credentials VALUES (?,?,?,?,?,?,?)').bind(credential.id,accountId,b64(credential.publicKey),credential.counter,JSON.stringify(credential.transports||[]),label(body.label),time));
    if(!user) for(const [title,text] of [['준비 중인 프로젝트','가상의 프로젝트 아이디어 메모'],['지원 목록','가상의 지원 대상 A·B'],['돌아보기','가상의 한 주 회고']]) writes.push(db.prepare('INSERT INTO private_items VALUES (?,?,?,?)').bind(crypto.randomUUID(),accountId,title,text));
    await db.batch(writes);
    return json({ok:true,credentialId:credential.id},201,{'set-cookie':user?'':await issueSession(db,accountId)});
  }
  if(path==='/api/login/options' && req.method==='POST') {
    const username=name(body.username),account=await one(db,'SELECT id FROM accounts WHERE username=?',username);
    if(!account) return fail('패스키 로그인을 확인할 수 없습니다.',401);
    const keys=await rows(db,'SELECT id,transports FROM credentials WHERE account_id=?',account.id);
    const options=await generateAuthenticationOptions({rpID:host,userVerification:'required',allowCredentials:keys.map(x=>({id:x.id,transports:JSON.parse(x.transports)}))});
    return json(options,200,{'set-cookie':await challenge(db,req,'login',account.id,username,options.challenge)});
  }
  if(path==='/api/login/verify' && req.method==='POST') {
    const pending=await consume(db,req,'login'); if(!pending) return fail('로그인 질문이 만료되었거나 이미 사용됐습니다.',403);
    const key=await one(db,'SELECT * FROM credentials WHERE id=? AND account_id=?',body.response?.id,pending.account_id);
    if(!key) return fail('이 계정의 패스키가 아닙니다.',403);
    const result=await verifyAuthenticationResponse({response:body.response,expectedChallenge:pending.challenge,expectedOrigin:origin,expectedRPID:host,credential:{id:key.id,publicKey:unb64(key.public_key),counter:key.counter,transports:JSON.parse(key.transports)},requireUserVerification:true});
    if(!result.verified) return fail('서명을 확인하지 못했습니다.',403);
    await db.prepare('UPDATE credentials SET counter=? WHERE id=?').bind(result.authenticationInfo.newCounter,key.id).run();
    return json({ok:true},200,{'set-cookie':await issueSession(db,pending.account_id)});
  }
  if(!user) return fail('로그인이 필요합니다.',401);
  if(path==='/api/private' && req.method==='GET') return json({items:await rows(db,'SELECT id,title,body FROM private_items WHERE account_id=? ORDER BY title',user.account_id)});
  if(path==='/api/passkeys' && req.method==='GET') return json({items:await rows(db,'SELECT id,label,created_at FROM credentials WHERE account_id=? ORDER BY created_at',user.account_id)});
  if(path==='/api/passkeys/delete' && req.method==='POST') {
    const key=await one(db,'SELECT id FROM credentials WHERE id=? AND account_id=?',body.id,user.account_id); if(!key) return fail('패스키를 찾을 수 없습니다.',404);
    const total=await one(db,'SELECT COUNT(*) AS n FROM credentials WHERE account_id=?',user.account_id);
    if(total.n<=1) return fail('마지막 패스키는 삭제할 수 없습니다. 먼저 다른 패스키를 등록하세요.',409);
    await db.prepare('DELETE FROM credentials WHERE id=? AND account_id=?').bind(key.id,user.account_id).run(); return json({ok:true});
  }
  if(path==='/api/logout' && req.method==='POST') { const token=getCookie(req,'t08_session'); await db.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await hash(token)).run(); return json({ok:true},200,{'set-cookie':cookie('t08_session','',0)}); }
  return fail('요청 경로를 찾을 수 없습니다.',404);
}

export default { async fetch(req,env) {
  const url=new URL(req.url),path=url.pathname;
  if(url.hostname!==productionHost && url.hostname!=='localhost' && url.hostname!=='127.0.0.1') return fail('지원하지 않는 호스트입니다.',403);
  if(req.method==='GET' && path==='/') return new Response(HTML,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','content-security-policy':"default-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'"}});
  if(req.method==='GET' && path==='/style.css') return new Response(CSS,{headers:{'content-type':'text/css; charset=utf-8'}});
  if(req.method==='GET' && path==='/passkey.css') return new Response(CSS,{headers:{'content-type':'text/css; charset=utf-8'}});
  if(req.method==='GET' && path==='/script.js') return new Response(PUBLIC_JS,{headers:{'content-type':'text/javascript; charset=utf-8'}});
  if(req.method==='GET' && path==='/passkey.js') return new Response(AUTH_JS,{headers:{'content-type':'text/javascript; charset=utf-8','cache-control':'no-store'}});
  const imagePath=decodeURI(path);
  if(req.method==='GET' && IMAGES[imagePath]) return new Response(Uint8Array.from(atob(IMAGES[imagePath].data),c=>c.charCodeAt(0)),{headers:{'content-type':IMAGES[imagePath].type,'cache-control':'public, max-age=86400'}});
  if(!path.startsWith('/api/')) return new Response('Not found',{status:404});
  if(!env.DB) return fail('서버 DB를 확인해 주세요.',503);
  if(!['GET','HEAD'].includes(req.method) && req.headers.get('origin')!==url.origin) return fail('다른 사이트의 변경 요청은 거절됩니다.',403);
  try { return await api(req,env.DB,path,req.method==='POST'?await readBody(req):{}); }
  catch(e) { return fail(e instanceof Error?e.message:'요청을 처리하지 못했습니다.',400); }
}};
