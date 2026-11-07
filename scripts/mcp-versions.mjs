#!/usr/bin/env node
import { existsSync,readFileSync,readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
export function versionTargets(catalog){
  const targets=[{kind:'npm',package:'context-mode',global:true},{kind:'npm',package:'agent-browser',global:true},
    {kind:'github',package:'github/github-mcp-server',binary:'github-mcp-server'},
    {kind:'github',package:'colbymchenry/codegraph',binary:'codegraph'},
    {kind:'commit',package:'redhat-community-ai-tools/slack-mcp',local:'slack'},
    {kind:'commit',package:'timoncool/telegram-api-mcp',local:'telegram'}];
  for(const s of Object.values(catalog.servers)){
    if(s.command?.[0]==='npx'){const spec=s.command.find(v=>v!=='npx'&&!v.startsWith('-'));targets.push({kind:'npm',package:spec.replace(/@[^@/]+$/,''),requested:spec});}
    if(s.command?.[0]==='uvx'){const spec=s.command[s.command.indexOf('--from')+1];targets.push({kind:'pypi',package:spec});}
  }
  return targets.filter((t,i,a)=>a.findIndex(x=>x.kind===t.kind&&x.package===t.package)===i);
}
export async function readLatest(target,fetcher=fetch){
  const url=target.kind==='npm'?`https://registry.npmjs.org/${encodeURIComponent(target.package)}`:target.kind==='pypi'?`https://pypi.org/pypi/${target.package}/json`:target.kind==='commit'?`https://api.github.com/repos/${target.package}/commits?per_page=1`:`https://api.github.com/repos/${target.package}/releases/latest`;
  const response=await fetcher(url,{signal:AbortSignal.timeout(15000),headers:{'User-Agent':'sync-cli-tool'}});if(!response.ok)throw new Error('Version registry unavailable');const data=await response.json();
  const result=target.kind==='npm'?data['dist-tags']?.latest:target.kind==='pypi'?data.info?.version:target.kind==='commit'?data[0]?.sha:data.tag_name?.replace(/^v/,'');
  if(typeof result!=='string'||!result)throw new Error('Invalid registry metadata');return result;
}
export function observed(target,root,globalRoot){
  try{
    if(target.kind==='npm'&&target.global)return {observed:JSON.parse(readFileSync(join(globalRoot,target.package,'package.json'),'utf8')).version,evidence:'global package'};
    if(target.kind==='npm'){
      const cache=join(root,'.npm/_npx'),found=new Set();
      if(existsSync(cache))for(const dir of readdirSync(cache)){const file=join(cache,dir,'node_modules',target.package,'package.json');if(existsSync(file))found.add(JSON.parse(readFileSync(file,'utf8')).version);}
      return {observed:[...found].join(', ')||null,evidence:'cached package versions; active session not inferred'};
    }
    if(target.binary){const output=execFileSync(target.binary,['--version'],{encoding:'utf8',timeout:5000,stdio:['ignore','pipe','ignore']});return {observed:output.match(/\d+\.\d+\.\d+/)?.[0]??null,evidence:'host binary'};}
    if(target.local==='telegram'){const meta=join(root,'.local/share/sync-cli-tool/telegram-api-mcp/.sync-cli-source.json');return {observed:existsSync(meta)?JSON.parse(readFileSync(meta,'utf8')).commit:null,evidence:'installed source revision'};}
    if(target.local==='slack'){
      const base=execFileSync('uv',['tool','dir'],{encoding:'utf8',timeout:5000}).trim(),lib=join(base,'slack-mcp/lib');
      for(const python of readdirSync(lib)){
        const site=join(lib,python,'site-packages');
        for(const dir of readdirSync(site).filter(d=>d.startsWith('slack_mcp-')&&d.endsWith('.dist-info'))){
          const file=join(site,dir,'direct_url.json');
          if(existsSync(file))return {observed:JSON.parse(readFileSync(file,'utf8')).vcs_info?.commit_id??null,evidence:'installed source revision'};
        }
      }
    }
    if(target.kind==='pypi'){
      const cache=join(root,'.cache/uv/archive-v0'),versions=new Set(),prefix=target.package.replaceAll('-','_')+'-';
      if(existsSync(cache))for(const item of readdirSync(cache)){
        const folder=join(cache,item);try{for(const dir of readdirSync(folder))if(dir.startsWith(prefix)&&dir.endsWith('.dist-info'))versions.add(dir.slice(prefix.length,-10));}catch{}
      }
      return {observed:[...versions].join(', ')||null,evidence:'cached Python environments; active session not inferred'};
    }
    return {observed:null,evidence:'installed environment version not inspected'};
  }catch{return {observed:null,evidence:'installed version unknown'};}
}
export async function inspectVersions(root=homedir()){
  const catalog=JSON.parse(readFileSync(join(root,'.agents/mcp/servers.json'),'utf8'));
  let globalRoot='';try{globalRoot=execFileSync('npm',['root','-g'],{encoding:'utf8',timeout:10000}).trim();}catch{}
  const results=[];
  for(const target of versionTargets(catalog)){
    const local=observed(target,root,globalRoot);
    try{const latest=await readLatest(target);results.push({...target,...local,latest,status:local.evidence?.startsWith('cached')?'CACHED':local.observed===latest?'CURRENT':local.observed?'UPDATE_AVAILABLE':'UNVERIFIED'});}catch{results.push({...target,...local,status:'UNVERIFIED',detail:'Registry request failed'});}
  }
  return results;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const results=await inspectVersions();
  if(process.argv.includes('--json'))console.log(JSON.stringify({results}));else for(const r of results)console.log(`[${r.status}] ${r.package}: observed=${r.observed??'unknown'}, latest=${r.latest??'unknown'} (${r.evidence})`);
  if(results.some(r=>r.status==='UNVERIFIED'))process.exitCode=1;
}
