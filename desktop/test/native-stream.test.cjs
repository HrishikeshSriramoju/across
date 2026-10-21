'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{spawn}=require('node:child_process'),path=require('node:path'),fs=require('node:fs');
const helper=path.join(__dirname,'../native/Across Input.app/Contents/MacOS/across-input');
const enabled=process.platform==='darwin'&&fs.existsSync(helper);
test('Mac native mouse clicks are suppressed only for the active capture generation',{skip:!enabled,timeout:5000},async()=>{
 const p=spawn(helper,['--test-input-state'],{stdio:['pipe','pipe','pipe']});let output='';p.stdout.on('data',d=>output+=d);
 const frames=[];for(let i=1;i<=12;i++)frames.push({op:'remote',enabled:true,requestId:i},{op:'test-mouse',kind:'move',x:0,dx:-5},{op:'test-mouse',kind:'down'},{op:'test-mouse',kind:'up'},{op:'release'},{op:'test-mouse',kind:'down'},{op:'test-mouse',kind:'up'});
 const done=new Promise((resolve,reject)=>{p.on('error',reject);p.on('exit',code=>code===0?resolve():reject(new Error('mouse probe failed '+code)));});p.stdin.end(frames.map(JSON.stringify).join('\n')+'\n');await done;
 const events=output.trim().split('\n').map(JSON.parse),buttons=events.filter(e=>e.type==='button');assert.equal(buttons.length,24);assert(buttons.every(e=>e.captured===true));assert.deepEqual([...new Set(buttons.map(e=>e.requestId))],Array.from({length:12},(_,i)=>i+1));
 const dispositions=events.filter(e=>e.type==='test-mouse-disposition');for(let i=0;i<12;i++)assert.deepEqual(dispositions.slice(i*5,i*5+5).map(e=>e.suppressed),[true,true,true,false,false]);
});
test('Mac production command reader handles tiny and fragmented frames before stdin closes',{skip:!enabled,timeout:4000},async()=>{
  const p=spawn(helper,['--test-command-stream'],{stdio:['pipe','pipe','pipe']});let buffer='',received=[];
  try{await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Small commands stalled while stdin remained open')),1500);
    p.on('error',reject);p.on('exit',code=>{if(code!==0)reject(new Error('Native probe exited '+code));});
    p.stdout.on('data',data=>{buffer+=data;let end;while((end=buffer.indexOf('\n'))>=0){received.push(JSON.parse(buffer.slice(0,end)));buffer=buffer.slice(end+1);}if(received.length===3){clearTimeout(timer);resolve();}});
    p.stdin.write('{"op":"heartbeat"}\n{"op":"rem');p.stdin.write('ote","enabled":true}\n{"op":"release"}\n');
  });assert.deepEqual(received.map(m=>m.op),['heartbeat','remote','release']);assert.equal(p.stdin.writableEnded,false);
  }finally{p.stdin.end();p.kill();}
});
test('Mac production command reader rejects oversized unterminated frames',{skip:!enabled,timeout:4000},async()=>{
  const p=spawn(helper,['--test-command-stream'],{stdio:['pipe','pipe','pipe']});p.stdin.on('error',()=>{});
  const exit=new Promise((resolve,reject)=>{p.on('exit',resolve);p.on('error',reject);});p.stdin.end('x'.repeat(65537));assert.equal(await exit,4);
});
test('native shortcut and modifier cleanup survives repeated return and re-entry without real input',{skip:!enabled,timeout:5000},async()=>{
  const p=spawn(helper,['--test-input-state'],{stdio:['pipe','pipe','pipe']});let output='',error='';p.stdout.on('data',d=>output+=d);p.stderr.on('data',d=>error+=d);
  const frames=[{op:'shortcuts',bindings:[{action:'hop',key:'Space',modifiers:['Control','Alt']},{action:'cursor-lock',key:'KeyL',modifiers:['Control','Alt']}]}];
  for(let i=0;i<10;i++)frames.push({op:'remote',enabled:true,requestId:i*2+1},{op:'test-key',key:'ControlLeft',down:true,modifiers:['Control']},{op:'test-key',key:'AltLeft',down:true,modifiers:['Control','Alt']},{op:'test-key',key:'Space',down:true,modifiers:['Control','Alt']},{op:'release'},{op:'test-key',key:'Space',down:false,modifiers:['Control','Alt']},{op:'test-key',key:'AltLeft',down:false,modifiers:['Control']},{op:'test-key',key:'ControlLeft',down:false,modifiers:[]},{op:'test-key',key:'KeyA',down:true,modifiers:[]},{op:'remote',enabled:true,requestId:i*2+2},{op:'test-key',key:'KeyB',down:true,modifiers:[]},{op:'test-key',key:'KeyB',down:false,modifiers:[]},{op:'release'});
  const done=new Promise((resolve,reject)=>{p.on('exit',code=>code===0?resolve():reject(new Error(error||'Native state probe failed: '+code)));p.on('error',reject);});p.stdin.end(frames.map(f=>JSON.stringify(f)).join('\n')+'\n');await done;
  const events=output.trim().split('\n').map(line=>JSON.parse(line));assert.equal(events.filter(e=>e.type==='shortcut'&&e.action==='hop').length,10);
  const local=events.filter(e=>e.type==='test-disposition'&&e.key==='KeyA');assert.equal(local.length,10);assert(local.every(e=>e.suppressed===false));
  const remote=events.filter(e=>e.type==='test-disposition'&&e.key==='KeyB');assert.equal(remote.length,20);assert(remote.every(e=>e.suppressed===true));assert.equal(events.filter(e=>e.type==='key'&&e.key==='KeyB').length,20);
});
