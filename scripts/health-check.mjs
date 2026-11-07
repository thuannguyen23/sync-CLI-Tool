#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { loadSecrets,prepareServer,publicError } from './mcp-runtime.mjs';
const args=process.argv.slice(2),json=args.includes('--json'),mysql=args.includes('--mysql');
let timeout=8000,selected;
for(let i=0;i<args.length;i++) {
  if(args[i]==='--timeout-ms')timeout=Number(args[++i]);
  else if(args[i]==='--server')selected=args[++i];
  else if(!['--json','--mysql'].includes(args[i]))throw new Error(`Unknown health option: ${args[i]}`);
}
if(!Number.isInteger(timeout)||timeout<50||timeout>60000)throw new Error('timeout-ms must be between 50 and 60000');

function rpcResult(message) {
  if(message?.jsonrpc!=='2.0'||Object.hasOwn(message,'method')||!Object.hasOwn(message,'result')||Object.hasOwn(message,'error'))throw new Error('Invalid MCP JSON-RPC response');
  return message.result;
}

function stdioTransport(config) {
  const [cmd,...args]=config.command;
  const child=spawn(cmd,args,{env:{...process.env,...config.env},stdio:['pipe','pipe','pipe'],detached:process.platform!=='win32'});
  let buffer='',failure;const pending=new Map();
  function fail(error){failure=error;for(const p of pending.values()){clearTimeout(p.timer);p.reject(error);}pending.clear();}
  child.on('error',fail);child.on('exit',()=>fail(new Error('MCP exited')));child.stdin.on('error',fail);child.stderr.on('data',()=>{});
  child.stdout.on('data',chunk=>{
    buffer+=chunk;if(buffer.length>2*1024*1024){fail(new Error('MCP exceeds limit'));return;}
    const lines=buffer.split('\n');buffer=lines.pop();
    for(const line of lines){if(!line.trim())continue;try{const m=JSON.parse(line),p=pending.get(m.id);if(!p)continue;const result=rpcResult(m);pending.delete(m.id);clearTimeout(p.timer);p.resolve(result);}catch{fail(new Error('Invalid MCP JSON'));}}
  });
  return {
    async send(m){if(failure)throw failure;if(m.id===undefined){child.stdin.write(JSON.stringify(m)+'\n');return;}return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(m.id);reject(new Error('MCP timeout'));},timeout);pending.set(m.id,{resolve,reject,timer});child.stdin.write(JSON.stringify(m)+'\n');});},
    async close(){child.stdin.end();const signal=s=>{try{if(process.platform!=='win32')process.kill(-child.pid,s);else child.kill(s);}catch{}};signal('SIGTERM');await new Promise(r=>setTimeout(r,60));signal('SIGKILL');fail(new Error('MCP closed'));}
  };
}
function httpTransport(config) {
  let session,version;
  return {
    async send(m){
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
      try{
        const response=await fetch(config.url,{method:'POST',redirect:'error',signal:controller.signal,headers:{...config.headers,'Content-Type':'application/json',Accept:'application/json, text/event-stream',...(session?{'Mcp-Session-Id':session}:{}),...(version?{'MCP-Protocol-Version':version}:{})},body:JSON.stringify(m)});
        if(!response.ok)throw new Error(`HTTP ${response.status}`);session=response.headers.get('mcp-session-id')??session;
        if(m.id===undefined){await response.body?.cancel();return;}
        let result;
        if(response.headers.get('content-type')?.includes('text/event-stream')){
          const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';
          try{outer:while(true){const {done,value}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});buffer=buffer.replace(/\r\n/g,'\n');if(buffer.length>2*1024*1024)throw new Error('MCP exceeds limit');const events=buffer.split('\n\n');buffer=events.pop();for(const event of events){const data=event.split('\n').filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trimStart()).join('\n');if(!data)continue;const msg=JSON.parse(data);if(msg.id===m.id){result=msg;break outer;}}}}finally{await reader.cancel();}
        }else{const body=await response.text();if(body.length>2*1024*1024)throw new Error('MCP exceeds limit');result=JSON.parse(body);}
        if(!result||result.id!==m.id)throw new Error('Invalid HTTP MCP response');const data=rpcResult(result);if(m.method==='initialize')version=data?.protocolVersion;return data;
      }finally{clearTimeout(timer);}
    },
    async close(){
      if(!session)return;
      try{
        const response=await fetch(config.url,{method:'DELETE',redirect:'error',signal:AbortSignal.timeout(Math.min(timeout,1000)),headers:{...config.headers,'Mcp-Session-Id':session,...(version?{'MCP-Protocol-Version':version}:{})}});
        await response.body?.cancel();
      }catch{/* Session termination is best-effort; some servers do not implement DELETE. */}
    }
  };
}
async function check(name,server,secrets){
  const ready=prepareServer(server,secrets);if(ready.status!=='READY')return {name,status:ready.status,detail:ready.detail};
  const config=ready.config;if(config.transport==='sse')return {name,status:'UNVERIFIED',detail:'Legacy SSE transport requires a compatible client; not tested'};
  let transport;
  try{
    transport=config.url?httpTransport(config):stdioTransport(config);let id=0;
    const call=(method,params)=>transport.send({jsonrpc:'2.0',id:++id,method,...(params?{params}:{})});
    const init=await call('initialize',{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'sync-cli-health',version:'1'}});
    if(!init?.serverInfo||!init?.capabilities?.tools||!['2024-11-05','2025-03-26','2025-06-18','2025-11-25'].includes(init.protocolVersion))throw new Error('Invalid MCP initialize');
    await transport.send({jsonrpc:'2.0',method:'notifications/initialized'});
    const tools=[],cursors=new Set();let cursor;
    do{const listed=await call('tools/list',cursor?{cursor}:undefined);if(!Array.isArray(listed?.tools)||listed.tools.some(t=>typeof t.name!=='string'))throw new Error('Invalid tools/list');tools.push(...listed.tools.map(t=>t.name));cursor=listed.nextCursor;if(cursor&&(cursors.has(cursor)||cursors.size>=100))throw new Error('Invalid tool pagination');if(cursor)cursors.add(cursor);}while(cursor);
    if(mysql&&name.startsWith('mysql')){if(!tools.includes('get_schema_info'))throw new Error('Missing schema tool');const result=await call('tools/call',{name:'get_schema_info',arguments:{}});if(!result||result.isError)throw new Error('MySQL tool failed');}
    return {name,status:'PASS',version:init.serverInfo.version,tools,mysqlCall:mysql&&name.startsWith('mysql')};
  }catch(error){return {name,status:'ERROR',detail:publicError(error)};}finally{await transport?.close();}
}
try{
  const root=join(homedir(),'.agents'),{servers}=JSON.parse(readFileSync(join(root,'mcp/servers.json'),'utf8'));
  if(selected&&!Object.hasOwn(servers,selected))throw new Error('Unknown server');
  const secrets=loadSecrets(join(root,'secrets.env')),results=[],entries=Object.entries(servers).filter(([name])=>!selected||name===selected);
  // Keep startup concurrency bounded: servers may be large Node/Python processes.
  for(let i=0;i<entries.length;i+=2)results.push(...await Promise.all(entries.slice(i,i+2).map(([name,s])=>check(name,s,secrets))));
  if(json)console.log(JSON.stringify({results}));else for(const r of results)console.log(`[${r.status}] ${r.name}: ${r.status==='PASS'?`${r.tools.length} tools; MCP initialize and tools/list passed${r.mysqlCall?'; schema call passed':''}`:r.detail}`);
  if(results.some(r=>!['PASS','SKIPPED'].includes(r.status)))process.exitCode=1;
}catch{console.error('Health check could not read configuration or select the requested server');process.exitCode=1;}
