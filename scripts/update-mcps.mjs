#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath,pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { versionTargets } from './mcp-versions.mjs';
import { assertNodeVersion } from './node-version.mjs';
export function updateCommands(catalog) {
  const commands=[['npm',['install','-g','context-mode@latest','agent-browser@latest']],['codegraph',['upgrade']]];
  for(const target of versionTargets(catalog)){
    if(target.kind==='npm'&&!target.global)commands.push(['npm',['exec','--yes',`--package=${target.package}@latest`,'--','node','-e','process.stdout.write("MCP package refreshed\\n")']]);
    if(target.kind==='pypi')commands.push(['uvx',['--upgrade','--from',target.package,'python','-c',`import importlib.metadata; print(importlib.metadata.version(${JSON.stringify(target.package)}))`]]);
  }
  commands.push([process.execPath,[fileURLToPath(new URL('./install-host-mcps.mjs',import.meta.url)),'--update']]);
  commands.push([process.execPath,[fileURLToPath(new URL('./sync-mcp.mjs',import.meta.url))]]);
  commands.push([process.execPath,[fileURLToPath(new URL('./sync-hooks.mjs',import.meta.url))]]);
  return commands;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  assertNodeVersion();
  const commands=updateCommands(JSON.parse(readFileSync(join(homedir(),'.agents/mcp/servers.json'),'utf8')));
  if(process.argv.includes('--dry-run'))console.log(JSON.stringify({commands}));
  else for(const [command,args] of commands){
    const code=await new Promise(resolve=>{const child=spawn(command,args,{stdio:'inherit'});child.on('error',()=>resolve(1));child.on('exit',code=>resolve(code??1));});
    if(code!==0){console.error('MCP update stopped on failure; earlier package updates remain installed. Configuration sync runs only after package updates succeed.');process.exitCode=1;break;}
  }
}
