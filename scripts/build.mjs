import { readFile, readdir, mkdir, rm, cp, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from 'esbuild';
const root=resolve(import.meta.dirname,'..'),dist=resolve(root,'dist');
const [worker,html,css,passkeyCss,publicJs,authJs]=await Promise.all(['worker/index.js','index.html','style.css','passkey.css','script.js','passkey.js'].map(p=>readFile(resolve(root,p),'utf8')));
const images={};for(const name of await readdir(resolve(root,'assets'))){const bytes=await readFile(resolve(root,'assets',name));images['/assets/'+name]={type:name.endsWith('.png')?'image/png':'image/jpeg',data:bytes.toString('base64')}}
let source=worker;for(const [key,value] of Object.entries({__HTML__:html,__CSS__:css+'\n'+passkeyCss,__PUBLIC_JS__:publicJs,__AUTH_JS__:authJs,__IMAGES__:images})){if(!source.includes(key))throw Error('Missing '+key);source=source.replace(key,JSON.stringify(value))}
await rm(dist,{recursive:true,force:true});await mkdir(resolve(dist,'server'),{recursive:true});await mkdir(resolve(dist,'.openai'),{recursive:true});
await build({stdin:{contents:source,resolveDir:resolve(root,'worker'),sourcefile:'index.js',loader:'js'},outfile:resolve(dist,'server/index.js'),bundle:true,platform:'browser',format:'esm',target:'es2022',minify:true});
await cp(resolve(root,'.openai/hosting.json'),resolve(dist,'.openai/hosting.json'));
await cp(resolve(root,'drizzle'),resolve(dist,'.openai/drizzle'),{recursive:true});
console.log('Built T08 worker', (await readFile(resolve(dist,'server/index.js'))).length);
