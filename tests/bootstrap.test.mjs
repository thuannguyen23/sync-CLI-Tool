import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const repo=new URL('..',import.meta.url).pathname;
test('runtime guard rejects Node 22 with an actionable minimum version',async()=>{
 const {assertNodeVersion}=await import('../scripts/node-version.mjs');
 assert.throws(()=>assertNodeVersion('22.20.0'),/24\.15/);assert.throws(()=>assertNodeVersion('24.14.9'),/24\.15/);assert.doesNotThrow(()=>assertNodeVersion('24.15.0'));
});
test('setup rejects an existing old Node before touching user configuration',t=>{
 const home=mkdtempSync(join(tmpdir(),'bootstrap-old-node-'));t.after(()=>rmSync(home,{recursive:true,force:true}));const bin=join(home,'bin');mkdirSync(bin);
 const node=join(bin,'node');writeFileSync(node,'#!/bin/sh\nprintf "22.20.0\\n"\n');chmodSync(node,0o755);
 const r=spawnSync('bash',[join(repo,'setup.sh'),'--silent'],{env:{...process.env,HOME:home,PATH:bin+':/usr/bin:/bin'},encoding:'utf8',timeout:10000});
 assert.notEqual(r.status,0);assert.match(r.stdout+r.stderr,/24\.15/);
});
