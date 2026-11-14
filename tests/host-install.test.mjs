import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
test('failed downloads and failed Telegram builds preserve the installed host files',async t=>{
 const {installGithub,replaceTelegramBuild}=await import('../scripts/install-host-mcps.mjs');
 const root=mkdtempSync(join(tmpdir(),'host-rollback-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 mkdirSync(join(root,'.local/bin'),{recursive:true});const binary=join(root,'.local/bin/github-mcp-server');writeFileSync(binary,'original');
 await assert.rejects(()=>installGithub(root,root,async()=>{throw new Error('fixture offline');}));assert.equal(readFileSync(binary,'utf8'),'original');
 const source=join(root,'new'),target=join(root,'telegram');mkdirSync(source);mkdirSync(target);writeFileSync(join(target,'keep'),'old build');
 assert.throws(()=>replaceTelegramBuild(source,target,'a'.repeat(40),(_cmd,args)=>{if(args[0]==='run')throw new Error('fixture build failure');}),/build failure/);
 assert.equal(readFileSync(join(target,'keep'),'utf8'),'old build');assert.equal(readdirSync(root).some(n=>n.startsWith('telegram.backup-')),false);
});
test('host installation planning distinguishes installed binaries from missing builds',async()=>{
 const {hostInstallPlan,verifyChecksum}=await import('../scripts/install-host-mcps.mjs');
 assert.deepEqual(hostInstallPlan(()=>false,false),['github','slack','telegram']);
 assert.deepEqual(hostInstallPlan(()=>true,false),[]);
 assert.deepEqual(hostInstallPlan(()=>true,true),['github','slack','telegram']);
 assert.throws(()=>verifyChecksum(Buffer.from('bad'),'0'.repeat(64)),/checksum/i);
});

test('RTK checksum failure preserves the installed binary', async t => {
 const {installRtk}=await import('../scripts/install-host-mcps.mjs');
 const root=mkdtempSync(join(tmpdir(),'rtk-checksum-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 mkdirSync(join(root,'.local/bin'),{recursive:true});const binary=join(root,'.local/bin/rtk');writeFileSync(binary,'keep');
 await assert.rejects(()=>installRtk(root,root,async url=>{
  if(url.includes('releases/latest'))return Buffer.from(JSON.stringify({tag_name:'v1.2.0',assets:[{name:'rtk-x86_64-unknown-linux-musl.tar.gz',browser_download_url:'fixture:archive'},{name:'checksums.txt',browser_download_url:'fixture:checksums'}]}));
  return Buffer.from(url==='fixture:archive'?'invalid archive':'0'.repeat(64)+'  rtk-x86_64-unknown-linux-musl.tar.gz\n');
 }),/checksum/);
 assert.equal(readFileSync(binary,'utf8'),'keep');
});
