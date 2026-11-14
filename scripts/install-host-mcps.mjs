#!/usr/bin/env node
import { existsSync,readFileSync,writeFileSync,mkdirSync,mkdtempSync,rmSync,copyFileSync,renameSync,chmodSync } from 'node:fs';
import { homedir,platform,arch } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash,randomUUID } from 'node:crypto';
import { assertNodeVersion } from './node-version.mjs';

export const hostInstallPlan=(installed,update)=>['github','slack','telegram'].filter(name=>update||!installed(name));
export function verifyChecksum(bytes,expected) {
  if(!/^[a-f\d]{64}$/i.test(expected??'')||createHash('sha256').update(bytes).digest('hex')!==expected.toLowerCase())throw new Error('Release checksum mismatch');
}
function run(binary,args,options={}) { return execFileSync(binary,args,{stdio:'pipe',timeout:300000,...options}); }
const has=binary=>{try{run('which',[binary]);return true;}catch{return false;}};
async function download(url) {
  const response=await fetch(url,{signal:AbortSignal.timeout(30000),headers:{'User-Agent':'sync-cli-tool'}});
  if(!response.ok)throw new Error(`Download failed (${response.status})`);
  return Buffer.from(await response.arrayBuffer());
}
export async function installGithub(temp,root,fetchBytes=download) {
  const os={linux:'Linux',darwin:'Darwin'}[platform()],cpu={x64:'x86_64',arm64:'arm64'}[arch()];
  if(!os||!cpu)throw new Error('GitHub MCP installer supports Linux/macOS x64/arm64');
  const release=JSON.parse((await fetchBytes('https://api.github.com/repos/github/github-mcp-server/releases/latest')).toString());
  const name=`github-mcp-server_${os}_${cpu}.tar.gz`,asset=release.assets.find(a=>a.name===name),checksums=release.assets.find(a=>/checksums.*\.txt$/.test(a.name));
  if(!asset||!checksums)throw new Error('GitHub MCP release assets unavailable');
  const bytes=await fetchBytes(asset.browser_download_url),list=(await fetchBytes(checksums.browser_download_url)).toString();
  const entry=list.split('\n').find(l=>l.trim().endsWith(name));verifyChecksum(bytes,entry?.trim().split(/\s+/)[0]);
  const archive=join(temp,'github.tar.gz');writeFileSync(archive,bytes);run('tar',['-xzf',archive,'-C',temp,'github-mcp-server']);
  const bin=join(root,'.local/bin');mkdirSync(bin,{recursive:true});const staged=join(bin,`.github-mcp-server-${randomUUID()}`);copyFileSync(join(temp,'github-mcp-server'),staged);chmodSync(staged,0o755);renameSync(staged,join(bin,'github-mcp-server'));
  console.log(`Installed GitHub MCP ${release.tag_name} (SHA-256 verified)`);
}
export async function installRtk(temp,root,fetchBytes=download) {
  const target={linux:{x64:'x86_64-unknown-linux-musl',arm64:'aarch64-unknown-linux-musl'},darwin:{x64:'x86_64-apple-darwin',arm64:'aarch64-apple-darwin'}}[platform()]?.[arch()];
  if(!target)throw new Error('RTK installer supports Linux/macOS x64/arm64');
  const release=JSON.parse((await fetchBytes('https://api.github.com/repos/rtk-ai/rtk/releases/latest')).toString());
  const name=`rtk-${target}.tar.gz`,asset=release.assets.find(a=>a.name===name),checksums=release.assets.find(a=>a.name==='checksums.txt');
  if(!asset||!checksums)throw new Error('RTK release assets unavailable');
  const bytes=await fetchBytes(asset.browser_download_url),list=(await fetchBytes(checksums.browser_download_url)).toString();
  const entry=list.split('\n').find(l=>l.trim().endsWith(name));verifyChecksum(bytes,entry?.trim().split(/\s+/)[0]);
  const archive=join(temp,'rtk.tar.gz');writeFileSync(archive,bytes);run('tar',['-xzf',archive,'-C',temp,'rtk']);
  const version=run(join(temp,'rtk'),['--version']).toString().trim();
  if(version!==`rtk ${release.tag_name.replace(/^v/,'')}`)throw new Error('RTK downloaded binary version mismatch');
  const bin=join(root,'.local/bin');mkdirSync(bin,{recursive:true});const dest=join(bin,'rtk');
  const staged=join(bin,`.rtk-${randomUUID()}`);copyFileSync(join(temp,'rtk'),staged);chmodSync(staged,0o755);
  if(existsSync(dest))copyFileSync(dest,dest+'.backup-'+randomUUID());
  renameSync(staged,dest);console.log(`Installed RTK ${release.tag_name} (SHA-256 verified)`);
}

async function telegram(temp,root) {
  const commits=JSON.parse((await download('https://api.github.com/repos/timoncool/telegram-api-mcp/commits?per_page=1')).toString()),sha=commits[0]?.sha;
  if(!/^[a-f\d]{40}$/.test(sha??''))throw new Error('Telegram source revision unavailable');
  const archive=join(temp,'telegram.tar.gz'),source=join(temp,'telegram');mkdirSync(source);
  writeFileSync(archive,await download(`https://api.github.com/repos/timoncool/telegram-api-mcp/tarball/${sha}`));
  run('tar',['-xzf',archive,'-C',source,'--strip-components=1']);
  const parent=join(root,'.local/share/sync-cli-tool'),target=join(parent,'telegram-api-mcp');mkdirSync(parent,{recursive:true});
  replaceTelegramBuild(source,target,sha);
  console.log(`Installed Telegram MCP at revision ${sha.slice(0,12)}`);
}
export function replaceTelegramBuild(source,target,sha,runCommand=run) {
  runCommand('npm',['ci','--no-audit','--no-fund'],{cwd:source});runCommand('npm',['run','build'],{cwd:source});
  if(!existsSync(join(source,'dist/index.js')))throw new Error('Telegram build did not produce dist/index.js');
  writeFileSync(join(source,'.sync-cli-source.json'),JSON.stringify({repository:'timoncool/telegram-api-mcp',commit:sha}));
  if(existsSync(target))renameSync(target,target+'.backup-'+randomUUID());
  renameSync(source,target);
}
export async function installHostMcps({update=false,dryRun=false,root=homedir(),rtkOnly=false}={}) {
  assertNodeVersion();
  const installed=name=>name==='github'?existsSync(join(root,'.local/bin/github-mcp-server'))||has('github-mcp-server'):name==='slack'?has('slack-mcp'):existsSync(join(root,'.local/share/sync-cli-tool/telegram-api-mcp/dist/index.js'));
  const plan=rtkOnly?['rtk']:hostInstallPlan(installed,update);
  if(dryRun){console.log(JSON.stringify({install:plan,update}));return;}
  if(plan.includes('github')&&!has('gh'))throw new Error('GitHub authentication needs gh. Ubuntu: sudo apt install gh; then gh auth login');
  if(plan.includes('slack')&&!has('uv'))throw new Error('Slack installation requires uv (provided by prerequisites.sh)');
  const parent=join(root,'.local/share/sync-cli-tool');mkdirSync(parent,{recursive:true});const temp=mkdtempSync(join(parent,'.install-'));
  try{for(const name of plan){
    if(name==='rtk')await installRtk(temp,root);
    else if(name==='github')await installGithub(temp,root);
    else if(name==='telegram')await telegram(temp,root);
    else{run('uv',['tool','install',...(update?['--upgrade']:[]),'git+https://github.com/redhat-community-ai-tools/slack-mcp']);console.log('Installed Slack MCP');}
  }}finally{rmSync(temp,{recursive:true,force:true});}
  if(!plan.length)console.log('Host MCP components already installed; use --update to upgrade them');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const args=process.argv.slice(2);
  if(args.some(a=>!['--update','--dry-run','--rtk-only'].includes(a)))throw new Error('Use --update, --dry-run or --rtk-only');
  installHostMcps({update:args.includes('--update'),dryRun:args.includes('--dry-run'),rtkOnly:args.includes('--rtk-only')}).catch(()=>{console.error('Host MCP installation failed; check Node, gh/uv, network and build prerequisites. Existing Telegram build is retained until replacement succeeds.');process.exitCode=1;});
}
