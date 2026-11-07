import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync,mkdirSync,writeFileSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
test('version evidence distinguishes installed, cached and unknown packages',async t=>{
 const {observed}=await import('../scripts/mcp-versions.mjs');const root=mkdtempSync(join(tmpdir(),'version-evidence-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const write=(file,data)=>{mkdirSync(join(file,'..'),{recursive:true});writeFileSync(file,JSON.stringify(data));};
 write(join(root,'global/example/package.json'),{version:'2.0.0'});
 assert.deepEqual(observed({kind:'npm',package:'example',global:true},root,join(root,'global')),{observed:'2.0.0',evidence:'global package'});
 write(join(root,'.npm/_npx/fixture/node_modules/example/package.json'),{version:'1.0.0'});
 const cached=observed({kind:'npm',package:'example'},root,'');assert.equal(cached.observed,'1.0.0');assert.match(cached.evidence,/cached/);
 assert.equal(observed({kind:'npm',package:'missing',global:true},root,join(root,'global')).observed,null);
});
test('version inspection checks all catalog npm and PyPI packages and all host sources',async()=>{
 const {versionTargets,readLatest}=await import('../scripts/mcp-versions.mjs');
 const targets=versionTargets({servers:{docs:{command:['npx','-y','@upstash/context7-mcp@4.5.1']},db:{command:['uvx','--from','mysql-mcp-server','mysql_mcp_server']},other:{command:['npx','-y','example@latest']}}});
 assert.ok(targets.some(t=>t.package==='@upstash/context7-mcp'));assert.ok(targets.some(t=>t.package==='mysql-mcp-server'));assert.ok(targets.some(t=>t.package==='context-mode'));assert.ok(targets.some(t=>t.package==='github/github-mcp-server'));
 assert.equal(await readLatest({kind:'npm',package:'example'},async()=>({ok:true,json:async()=>({'dist-tags':{latest:'9.1.0'}})})),'9.1.0');
 assert.equal(await readLatest({kind:'pypi',package:'example'},async()=>({ok:true,json:async()=>({info:{version:'1.2.3'}})})),'1.2.3');
 assert.equal(await readLatest({kind:'github',package:'owner/example'},async()=>({ok:true,json:async()=>({tag_name:'v1.2.3'})})),'1.2.3');
 assert.equal(await readLatest({kind:'commit',package:'owner/example'},async()=>({ok:true,json:async()=>[{sha:'a'.repeat(40)}]})),'a'.repeat(40));
 await assert.rejects(()=>readLatest({kind:'npm',package:'example'},async()=>({ok:false})),/registry/);
});
