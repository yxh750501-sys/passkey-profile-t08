import { chromium } from '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import { randomBytes } from 'node:crypto';

const base=process.env.T08_TEST_URL||'http://localhost:4189/';
const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
const page=await browser.newPage(),cdp=await page.context().newCDPSession(page),errors=[];
page.on('pageerror',e=>errors.push(e.message));
await cdp.send('WebAuthn.enable');
async function device(){return (await cdp.send('WebAuthn.addVirtualAuthenticator',{options:{protocol:'ctap2',transport:'internal',hasResidentKey:true,hasUserVerification:true,isUserVerified:true}})).authenticatorId}
function check(ok,why){if(!ok)throw Error(why)}
try {
  let first=await device();
  await page.goto(base);
  check((await page.locator('h1').first().textContent()).length>0,'Original public profile missing');
  check(!await page.locator('#pk-private').isVisible(),'Private area visible before login');
  check(await page.evaluate(async()=> (await fetch('/api/private')).status)===401,'Anonymous private API did not reject');
  const a='qa_a_'+randomBytes(4).toString('hex');
  await page.fill('#pk-username',a);await page.fill('#pk-label','첫 기기');await page.click('#pk-register');
  await page.waitForFunction(()=>!document.querySelector('#pk-private').hidden);
  await page.waitForFunction(()=>document.querySelectorAll('#pk-items li').length===3);
  check(await page.locator('#pk-items li').count()===3,'Private item count');
  const keys1=await page.evaluate(async()=> (await (await fetch('/api/passkeys')).json()).items);
  check(keys1.length===1,'First credential missing');
  await cdp.send('WebAuthn.removeVirtualAuthenticator',{authenticatorId:first});
  const second=await device();
  await page.fill('#pk-label2','예비 기기');await page.click('#pk-add-key');
  await page.waitForFunction(()=>document.querySelectorAll('#pk-keys li').length===2);
  const keys2=await page.evaluate(async()=> (await (await fetch('/api/passkeys')).json()).items);
  check(keys2.length===2&&keys2[0].id!==keys2[1].id,'Second credential missing');
  const replay=await page.evaluate(async(username)=>{const o=await (await fetch('/api/login/options',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username})})).json();o.challenge=decode(o.challenge);for(const c of o.allowCredentials)c.id=decode(c.id);const c=await navigator.credentials.get({publicKey:o});const body=JSON.stringify({response:authJSON(c)});const send=()=>fetch('/api/login/verify',{method:'POST',headers:{'content-type':'application/json'},body});return [(await send()).status,(await send()).status]},a);
  check(replay[0]===200&&replay[1]===403,'Challenge reuse accepted');
  const removed=await page.evaluate(async(id)=> (await fetch('/api/passkeys/delete',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id})})).status,keys1[0].id);
  check(removed===200,'Delete first passkey failed');
  await page.click('#pk-logout');await page.waitForFunction(()=>document.querySelector('#pk-private').hidden);
  check(await page.evaluate(async()=> (await fetch('/api/private')).status)===401,'Logout session remained active');
  await page.fill('#pk-username',a);await page.click('#pk-login');await page.waitForFunction(()=>!document.querySelector('#pk-private').hidden);
  check(await page.locator('#pk-items li').count()===3,'Remaining passkey login failed');
  await page.click('#pk-logout');await page.waitForFunction(()=>document.querySelector('#pk-private').hidden);
  await cdp.send('WebAuthn.removeVirtualAuthenticator',{authenticatorId:second});await device();
  const b='qa_b_'+randomBytes(4).toString('hex');await page.fill('#pk-username',b);await page.fill('#pk-label','다른 계정 기기');await page.click('#pk-register');await page.waitForFunction(()=>!document.querySelector('#pk-private').hidden);
  const bKey=(await page.evaluate(async()=> (await (await fetch('/api/passkeys')).json()).items))[0].id;
  check(await page.locator('#pk-items li').count()===3,'Other account private items missing');
  const isolation=await page.evaluate(async({username,bKey})=>{const r=await fetch('/api/login/options',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username})});const o=await r.json();o.challenge=decode(o.challenge);o.allowCredentials=[{id:decode(bKey),type:'public-key'}];const c=await navigator.credentials.get({publicKey:o});return (await fetch('/api/login/verify',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({response:authJSON(c)})})).status},{username:a,bKey});
  check(isolation===403,'Other account passkey accepted');
  check(errors.length===0,'Browser errors: '+errors.join('; '));
  console.log('PASS public profile; anonymous 401; two passkeys; challenge replay 403; delete and remaining-key login; logout 401; second account passkey isolation 403');
} finally {await browser.close()}
