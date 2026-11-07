import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('GitHub MCP launcher obtains the gh credential without exposing it in arguments',()=>{
 const dir=mkdtempSync(join(tmpdir(),'github-mcp-host-')),bin=join(dir,'bin');mkdirSync(bin);
 writeFileSync(join(bin,'gh'),'#!/bin/sh\nprintf "test-token"\n',{mode:0o755});
 writeFileSync(join(bin,'github-mcp-server'),'#!/bin/sh\n[ "$1" = stdio ] && [ "$GITHUB_PERSONAL_ACCESS_TOKEN" = test-token ] && [ "$#" -eq 1 ]\n',{mode:0o755});
 const script=fileURLToPath(new URL('../scripts/github-mcp-host.sh',import.meta.url));
 const r=spawnSync('/bin/sh',[script],{env:{HOME:dir,PATH:bin+':/usr/bin:/bin'},encoding:'utf8'});
 assert.equal(r.status,0,r.stderr);assert.equal(r.stdout,'');
});
