import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync,mkdirSync,writeFileSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
const script=new URL('../scripts/health-check.mjs',import.meta.url).pathname;
function fixture(t, code, extra={}) {
 const home=mkdtempSync(join(tmpdir(),'health-fixture-'));t.after(()=>rmSync(home,{recursive:true,force:true}));
 mkdirSync(join(home,'.agents/mcp'),{recursive:true});
 const server=join(home,'server.cjs');writeFileSync(server,code);
 const catalog={servers:{fixture:{command:[process.execPath,server],...extra}}};
 writeFileSync(join(home,'.agents/mcp/servers.json'),JSON.stringify(catalog));
 return {home,catalog,run:args=>new Promise(resolve=>{const p=spawn(process.execPath,[script,'--json','--timeout-ms','500',...(args||[])],{env:{...process.env,HOME:home}});let out='',err='';p.stdout.on('data',d=>out+=d);p.stderr.on('data',d=>err+=d);p.on('exit',status=>resolve({status,out,err}));})};
}
const strictServer=`const rl=require('readline').createInterface({input:process.stdin});let ready=false;rl.on('line',l=>{const m=JSON.parse(l);const send=result=>console.log(JSON.stringify({jsonrpc:'2.0',id:m.id,result}));if(m.method==='initialize')send({protocolVersion:'2025-03-26',capabilities:{tools:{}},serverInfo:{name:'fixture',version:'1'}});else if(m.method==='notifications/initialized')ready=true;else if(m.method==='tools/list'){if(!ready)process.exit(3);send({tools:[{name:'fixture'},{name:'get_schema_info'}]});}else if(m.method==='tools/call')console.log(JSON.stringify({jsonrpc:'2.0',id:m.id,result:{isError:true,content:[{type:'text',text:'denied'}]}}));});`;
test('health uses initialized and tools/list rather than stopping at startup',async t=>{
 const f=fixture(t,strictServer),r=await f.run();assert.equal(r.status,0,r.err);assert.deepEqual(JSON.parse(r.out).results[0].tools,['fixture','get_schema_info']);
});
test('health fails if a process exits after initialize and does not support tools/list',async t=>{
 const f=fixture(t,"process.stdin.once('data',()=>{console.log(JSON.stringify({jsonrpc:'2.0',id:1,result:{serverInfo:{name:'bad',version:'1'},capabilities:{tools:{}},protocolVersion:'2025-03-26'}}));process.exit(0)})");
 const r=await f.run();assert.notEqual(r.status,0);assert.equal(JSON.parse(r.out).results[0].status,'ERROR');
});
test('health skips empty optional credentials without starting the server',async t=>{
 const f=fixture(t,"process.exit(4)",{requiredSecrets:['HEALTH_OPTIONAL_TEST']});writeFileSync(join(f.home,'.agents/secrets.env'),'HEALTH_OPTIONAL_TEST=""\n');const r=await f.run();assert.equal(r.status,0,r.err);assert.equal(JSON.parse(r.out).results[0].status,'SKIPPED');
});
test('health bounds silent servers and reports a failing exit code',async t=>{
 const f=fixture(t,'setInterval(()=>{},1000)'),r=await f.run();assert.notEqual(r.status,0);assert.match(r.out,/timeout/i);
});
test('health rejects malformed JSON-RPC envelopes instead of reporting PASS',async t=>{
 const f=fixture(t,strictServer.replaceAll("jsonrpc:'2.0'","jsonrpc:'1.0'")),r=await f.run();
 assert.notEqual(r.status,0);assert.equal(JSON.parse(r.out).results[0].status,'ERROR');
});
test('health follows tools/list pagination',async t=>{
 const code=strictServer.replace("send({tools:[{name:'fixture'},{name:'get_schema_info'}]})","send(m.params?.cursor==='page2'?{tools:[{name:'second'}]}:{tools:[{name:'first'}],nextCursor:'page2'})");
 const f=fixture(t,code),r=await f.run();assert.equal(r.status,0,r.err);assert.deepEqual(JSON.parse(r.out).results[0].tools,['first','second']);
});
test('health accepts bounded SSE responses from a Streamable HTTP endpoint',async t=>{
 const server=createServer(async(req,res)=>{let body='';for await(const chunk of req)body+=chunk;const m=JSON.parse(body);if(!m.id){res.writeHead(202);res.end();return;}const result=m.method==='initialize'?{protocolVersion:'2025-03-26',capabilities:{tools:{}},serverInfo:{name:'sse-fixture',version:'1'}}:{tools:[{name:'sse-tool'}]};res.setHeader('Content-Type','text/event-stream');res.end('data: '+JSON.stringify({jsonrpc:'2.0',id:m.id,result})+'\n\n');});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>server.close());const f=fixture(t,'');f.catalog.servers.fixture={url:`http://127.0.0.1:${server.address().port}/mcp`};writeFileSync(join(f.home,'.agents/mcp/servers.json'),JSON.stringify(f.catalog));const r=await f.run();assert.equal(r.status,0,r.err);assert.deepEqual(JSON.parse(r.out).results[0].tools,['sse-tool']);
});
test('health treats tool isError as failure and MySQL calls require explicit opt-in',async t=>{
 const f=fixture(t,strictServer);f.catalog.servers['mysql-fixture']=f.catalog.servers.fixture;delete f.catalog.servers.fixture;writeFileSync(join(f.home,'.agents/mcp/servers.json'),JSON.stringify(f.catalog));
 assert.equal((await f.run()).status,0);const r=await f.run(['--mysql']);assert.notEqual(r.status,0);assert.equal(JSON.parse(r.out).results[0].status,'ERROR');
});
test('health actually connects to HTTP MCP with session header, initialized notification and session cleanup',async t=>{
 let initialized=false,listed=false,deleted=false;const server=createServer(async(req,res)=>{if(req.method==='DELETE'){deleted=true;res.writeHead(200);res.end();return;}let body='';for await(const d of req)body+=d;const m=JSON.parse(body);res.setHeader('Content-Type','application/json');if(m.method==='initialize'){res.setHeader('Mcp-Session-Id','fixture-session');res.end(JSON.stringify({jsonrpc:'2.0',id:m.id,result:{protocolVersion:'2025-03-26',capabilities:{tools:{}},serverInfo:{name:'http-fixture',version:'1'}}}));}else{assert.equal(req.headers['mcp-session-id'],'fixture-session');if(m.method==='notifications/initialized'){initialized=true;res.writeHead(202);res.end();}else{listed=true;assert.ok(initialized);res.end(JSON.stringify({jsonrpc:'2.0',id:m.id,result:{tools:[]}}));}}});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>server.close());
 const f=fixture(t,'');f.catalog.servers.fixture={url:`http://127.0.0.1:${server.address().port}/mcp`};writeFileSync(join(f.home,'.agents/mcp/servers.json'),JSON.stringify(f.catalog));const r=await f.run();assert.equal(r.status,0,r.err);assert.ok(listed);assert.ok(deleted);
});
