import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
export const loadSecrets=file=>existsSync(file)?parseEnv(readFileSync(file,'utf8')):{};
export function prepareServer(server,secrets={},environment=process.env) {
  const get=key=>secrets[key]??environment[key];
  const absent=(server.requiredSecrets??[]).filter(key=>!String(get(key)??'').trim());
  if(absent.length)return {status:'SKIPPED',detail:`Missing optional credentials: ${absent.join(', ')}`};
  const missing=new Set();
  const walk=value=>{
    if(typeof value==='string')return value.replace(/\$\{([^}]+)\}/g,(_,key)=>{const found=get(key);if(found===undefined||String(found).trim()==='')missing.add(key);return found===undefined?'':String(found);});
    if(Array.isArray(value))return value.map(walk);
    if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,walk(v)]));
    return value;
  };
  const config=walk(server);
  return missing.size?{status:'UNCONFIGURED',detail:`Missing inputs: ${[...missing].join(', ')}`}:{status:'READY',config};
}
// Provider errors and stderr can contain credentials; never print them.
export const publicError=error=>/timeout|abort/i.test(error?.message??'')?'MCP timeout':'MCP request failed; check server configuration and authentication';
