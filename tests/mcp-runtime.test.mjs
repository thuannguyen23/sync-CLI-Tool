import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync,writeFileSync,statSync,rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
test('configuration backups containing credentials are private',async t=>{
 const root=mkdtempSync(join(tmpdir(),'private-backup-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const file=join(root,'config');writeFileSync(file,'credential',{mode:0o644});
 const {backupFile}=await import('../scripts/config-utils.mjs');backupFile(file);
 assert.equal(statSync(file+'.bak').mode&0o777,0o600);
});
test('runtime resolves quoted values and reports missing variable names without their values',async()=>{
 const {prepareServer}=await import('../scripts/mcp-runtime.mjs');
 const secrets={TOKEN:'hello',EMPTY:''};
 assert.equal(prepareServer({command:['true'],env:{TOKEN:'${TOKEN}'}},secrets,{}).config.env.TOKEN,'hello');
 assert.equal(prepareServer({command:['true'],env:{TOKEN:'${MISSING}'}},secrets,{}).status,'UNCONFIGURED');
 assert.equal(prepareServer({command:['true'],requiredSecrets:['EMPTY']},secrets,{}).status,'SKIPPED');
});
