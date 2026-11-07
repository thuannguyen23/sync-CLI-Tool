import assert from 'node:assert/strict';
import { test } from 'node:test';
test('updates refresh declared npm and Python packages without invoking their MCP tools',async()=>{
 const {updateCommands}=await import('../scripts/update-mcps.mjs');
 const commands=updateCommands({servers:{docs:{command:['npx','-y','@upstash/context7-mcp@4.5.1']},db:{command:['uvx','--from','mysql-mcp-server','mysql_mcp_server']}}});
 assert.ok(commands.some(([cmd,args])=>cmd==='npm'&&args.includes('--package=@upstash/context7-mcp@latest')));
 assert.ok(commands.some(([cmd,args])=>cmd==='uvx'&&args.includes('--upgrade')));
 assert.equal(commands.some(([,args])=>args.includes('tools/call')),false);
});
