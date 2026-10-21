'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module');
function fixture(platform){
 const file=path.join(__dirname,'../src/main.cjs'),req=createRequire(file),messages=[],commands=[],timers=[];
 const e={app:{requestSingleInstanceLock:()=>true,commandLine:{appendSwitch(){}},whenReady:()=>new Promise(()=>{}),on(){},getPath:()=>'/unused'},globalShortcut:{unregisterAll(){},register:()=>true},screen:{getAllDisplays:()=>[{id:1,bounds:{x:0,y:0,width:1920,height:1080},scaleFactor:1}]}};
 const c={require:n=>n==='electron'?e:req(n),__dirname:path.dirname(file),process:{platform,on(){}},Buffer,console,setTimeout:f=>{timers.push(f);return timers.length;},clearTimeout(){},setInterval(){},clearInterval(){},messages,commands};
 vm.createContext(c);vm.runInContext(fs.readFileSync(file,'utf8')+`\nconfig={...defaults,dwell:0};role='host';helperReady=true;helperBounds={x:0,y:0,width:1920,height:1080};helper={killed:false,stdin:{writable:true,write:s=>commands.push(JSON.parse(s))}};link={channels:new Map([['peer',{id:'peer',info:{name:'Mac',platform:'darwin',inputReady:true,bounds:{x:0,y:0,width:1920,height:1080}},send:m=>messages.push(m)}]])};globalThis.h={setRemote,handleNative,handleMessage,release,publishInputInfo,epoch:()=>remoteEpoch,active:()=>remote,confirmed:()=>remoteConfirmed,peer:()=>link.channels.get('peer'),layout:r=>config.layout.Mac=r};`,c);
 return{h:c.h,messages,commands,timers};
}
for(const platform of ['darwin','win32']){
 test(platform+': click forwarding waits for capture and rejects queued frames from older handoffs',()=>{
  const {h,messages}=fixture(platform);h.setRemote('peer',{x:100,y:100});const first=h.epoch();assert(!h.confirmed());assert.equal(messages.length,0);
  h.handleNative({type:'button',button:0,down:true,captured:false,requestId:first});assert.equal(messages.length,0);
  h.handleNative({type:'control',remote:true,requestId:first});assert(h.confirmed());const before=messages.length;
  h.handleNative({type:'move',x:0,y:100,dx:-1000,dy:0,captured:false,requestId:first});assert.equal(messages.length,before);assert.equal(h.active(),'peer');
  h.handleNative({type:'button',button:0,down:true,captured:true,requestId:first});assert.equal(messages.at(-1).event.type,'button');
  h.release();h.setRemote('peer',{x:100,y:100});const second=h.epoch();h.handleNative({type:'control',remote:true,requestId:first});assert(!h.confirmed());
  h.handleNative({type:'control',remote:true,requestId:second});const count=messages.length;
  h.handleNative({type:'key',key:'KeyA',down:true,captured:true,requestId:first});assert.equal(messages.length,count);
  h.handleNative({type:'key',key:'KeyB',down:true,captured:true,requestId:second});assert.equal(messages.at(-1).event.key,'KeyB');
 });
 test(platform+': stale remote movement cannot re-enter immediately after return',()=>{
  const {h,commands}=fixture(platform);h.layout({x:-1920,y:0});h.setRemote('peer',{x:1918,y:300});const epoch=h.epoch();h.handleNative({type:'control',remote:true,requestId:epoch});
  h.handleNative({type:'move',x:0,y:300,dx:4,dy:0,captured:true,requestId:epoch});assert.equal(h.active(),null);
  const warps=commands.filter(c=>c.op==='warp');assert.equal(warps.length,1);assert(warps[0].x<20);
  h.handleNative({type:'move',x:0,y:300,dx:-1000,dy:0,captured:true,requestId:epoch});assert.equal(h.active(),null);
  h.handleNative({type:'move',x:0,y:300,dx:-1,dy:0,captured:false,requestId:h.epoch()});assert.equal(h.active(),null);
 });
 test(platform+': unavailable receiver releases capture instead of routing into a dead helper',async()=>{
  const {h,messages}=fixture(platform);h.setRemote('peer',{x:100,y:100});h.handleNative({type:'control',remote:true,requestId:h.epoch()});
  await h.handleMessage(h.peer(),{type:'info',info:{...h.peer().info,inputReady:false}});assert.equal(h.active(),null);assert(messages.some(m=>m.type==='release'));
  h.publishInputInfo();assert.equal(messages.at(-1).type,'info');assert.equal(messages.at(-1).info.inputReady,true);
 });
}
test('Windows helper uses unclamped raw motion, confirms capture, and never parks at screen center',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../native/WindowsInput.ps1'),'utf8');assert(source.includes('RegisterRawInputDevices'));assert(source.includes('GetRawInputData'));assert(source.includes('type="control",remote=remote,requestId=captureEpoch'));assert(!/GetSystemMetrics\(78\)\/2|GetSystemMetrics\(79\)\/2/.test(source));
 const hook=source.slice(source.indexOf('static IntPtr MouseHook'),source.indexOf('static bool ExtendedKey'));assert(!hook.includes('Console.Out'));assert(hook.includes('if(!remote)Emit'));
});
