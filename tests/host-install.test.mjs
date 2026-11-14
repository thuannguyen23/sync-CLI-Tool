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
test('AGY v1 installation is isolated, idempotent, and preserves failures', async t => {
 const {installAgyContextMode}=await import('../scripts/install-agy-context-mode.mjs');
 const root=mkdtempSync(join(tmpdir(),'agy-install-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 let calls=0;
 const install=(prefix)=>{calls++;const pkg=join(prefix,'node_modules/context-mode');mkdirSync(join(pkg,'configs/antigravity-cli'),{recursive:true});mkdirSync(join(prefix,'node_modules/.bin'),{recursive:true});writeFileSync(join(pkg,'package.json'),JSON.stringify({version:'1.0.169'}));writeFileSync(join(pkg,'configs/antigravity-cli/plugin.json'),'{}');writeFileSync(join(pkg,'configs/antigravity-cli/hooks.json'),'{}');writeFileSync(join(prefix,'node_modules/.bin/context-mode'),'binary');};
 installAgyContextMode(root,install); installAgyContextMode(root,()=>{throw Error('unexpected reinstall')});
 assert.equal(calls,1);assert.ok(readFileSync(join(root,'.local/share/sync-cli-tool/context-mode-agy/node_modules/.bin/context-mode')));
 const broken=mkdtempSync(join(tmpdir(),'agy-failure-'));t.after(()=>rmSync(broken,{recursive:true,force:true}));
 assert.throws(()=>installAgyContextMode(broken,()=>{throw Error('network failure')}),/network failure/);
 assert.equal(readdirSync(join(broken,'.local/share/sync-cli-tool')).length,0);
 const existing=join(broken,'.local/share/sync-cli-tool/context-mode-agy');mkdirSync(existing);writeFileSync(join(existing,'keep'),'personal');
 assert.throws(()=>installAgyContextMode(broken,install),/incomplete|invalid/i);assert.equal(readFileSync(join(existing,'keep'),'utf8'),'personal');
});
test('prerequisites installs AGY adapter only when selected and propagates failure', async t => {
 const {spawnSync}=await import('node:child_process');
 const root=mkdtempSync(join(tmpdir(),'agy-prereq-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const bin=join(root,'bin');mkdirSync(bin);
 for(const name of ['npx','uvx','rtk','codegraph','context-mode','agent-browser']) writeFileSync(join(bin,name),'#!/bin/sh\n[ "$1" = "--version" ] && echo "rtk 1.2.0"\nexit 0\n',{mode:0o755});
 writeFileSync(join(bin,'node'),`#!/bin/sh\ncase "$1" in\n *install-agy-context-mode.mjs) echo called >> "$HOME/agy-calls"; exit "${'${AGY_FAIL:-0}'}";;\n *) exit 0;;\nesac\n`,{mode:0o755});
 const script=new URL('../scripts/prerequisites.sh',import.meta.url).pathname;
 const env={...process.env,HOME:root,PATH:`${bin}:/usr/bin:/bin`};delete env.SKIP_AGY;
 let run=spawnSync('bash',[script],{env,encoding:'utf8'});assert.equal(run.status,0,run.stderr);assert.equal(readFileSync(join(root,'agy-calls'),'utf8').trim(),'called');
 run=spawnSync('bash',[script],{env:{...env,SKIP_AGY:'1'},encoding:'utf8'});assert.equal(run.status,0);assert.equal(readFileSync(join(root,'agy-calls'),'utf8').trim(),'called');
 run=spawnSync('bash',[script],{env:{...env,AGY_FAIL:'1'},encoding:'utf8'});assert.notEqual(run.status,0);assert.match(run.stdout,/AGY context-mode v1 installation failed/);
});
