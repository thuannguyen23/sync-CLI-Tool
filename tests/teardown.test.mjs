import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, symlinkSync, rmSync, readdirSync, lstatSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const repo = new URL('..', import.meta.url).pathname;
function fixture(t) {
  const home = mkdtempSync(join(tmpdir(), 'safe-teardown-'));
  t.after(() => rmSync(home, {recursive:true, force:true}));
  const write = (name, text) => { const file=join(home,name); mkdirSync(join(file,'..'),{recursive:true}); writeFileSync(file,text); return file; };
  const run = (...args) => spawnSync('bash',[join(repo,'teardown.sh'),'--force',...args],{env:{...process.env,HOME:home,CODEX_HOME:join(home,'active codex'),PATH:'/usr/bin:/bin'},encoding:'utf8'});
  return {home,write,run};
}
test('teardown preserves personal regular files and unrelated symlinks without backups', t => {
  const f=fixture(t);
  for(const file of ['.cursor/mcp.json','.gemini/config/AGENTS.md','.codex/AGENTS.md','active codex/AGENTS.md']) f.write(file,'personal');
  const target=f.write('personal-rules','private');
  mkdirSync(join(f.home,'.claude'),{recursive:true}); symlinkSync(target,join(f.home,'.claude/CLAUDE.md'));
  const r=f.run(); assert.equal(r.status,0,r.stderr);
  for(const file of ['.cursor/mcp.json','.gemini/config/AGENTS.md','.codex/AGENTS.md','active codex/AGENTS.md','.claude/CLAUDE.md']) assert.equal(readFileSync(join(f.home,file),'utf8'),file.endsWith('CLAUDE.md')?'private':'personal');
});
test('backup restoration is explicit and keeps the current configuration recoverable', t => {
  const f=fixture(t), file=f.write('.cursor/mcp.json','current'); f.write('.cursor/mcp.json.bak','original');
  assert.equal(f.run().status,0); assert.equal(readFileSync(file,'utf8'),'current');
  const r=f.run('--restore-backups'); assert.equal(r.status,0,r.stderr);
  assert.equal(readFileSync(file,'utf8'),'original');
  const saved=readdirSync(join(f.home,'.cursor')).filter(n=>n.startsWith('mcp.json.before-teardown.'));
  assert.equal(saved.length,1); assert.equal(readFileSync(join(f.home,'.cursor',saved[0]),'utf8'),'current');
  assert.ok(existsSync(file+'.bak'));
});
test('teardown removes only repository-owned skill links in both Codex homes', t => {
  const f=fixture(t); for(const base of ['.codex','active codex']) {
    mkdirSync(join(f.home,base,'skills'),{recursive:true}); symlinkSync(join(repo,'skills/brainstorming'),join(f.home,base,'skills/brainstorming'));
  }
  const r=f.run(); assert.equal(r.status,0,r.stderr);
  for(const base of ['.codex','active codex']) assert.equal(existsSync(join(f.home,base,'skills/brainstorming')),false);
});
test('a personal .agents directory does not establish repository ownership',t=>{
 const f=fixture(t),source=join(f.home,'.agents/skills/brainstorming');mkdirSync(source,{recursive:true});f.write('.agents/skills/brainstorming/SKILL.md','personal');
 mkdirSync(join(f.home,'.codex/skills'),{recursive:true});symlinkSync(source,join(f.home,'.codex/skills/brainstorming'));
 const r=f.run();assert.equal(r.status,0,r.stderr);assert.equal(readFileSync(join(f.home,'.codex/skills/brainstorming/SKILL.md'),'utf8'),'personal');
});
test('teardown resolves managed sources through .agents before removing the root link',t=>{
 const f=fixture(t);symlinkSync(repo,join(f.home,'.agents'));
 mkdirSync(join(f.home,'.codex/skills'),{recursive:true});const link=join(f.home,'.codex/skills/brainstorming');symlinkSync(join(f.home,'.agents/skills/brainstorming'),link);
 const r=f.run();assert.equal(r.status,0,r.stderr);assert.throws(()=>lstatSync(link),{code:'ENOENT'});assert.throws(()=>lstatSync(join(f.home,'.agents')),{code:'ENOENT'});
});
