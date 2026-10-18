'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module');
function harness(){
  const file=path.join(__dirname,'../src/main.cjs'),localRequire=createRequire(file),timers=new Map();let next=0;
  const electron={app:{requestSingleInstanceLock:()=>true,whenReady:()=>new Promise(()=>{}),on:()=>{},getPath:()=>'/unused-test-path'},globalShortcut:{unregisterAll:()=>{},register:()=>true},screen:{getAllDisplays:()=>[{id:1,bounds:{x:0,y:0,width:1920,height:1080},scaleFactor:1}]}};
  const context={require:name=>name==='electron'?electron:name==='node:fs'?{...fs,writeFileSync:()=>{}}:localRequire(name),process:{platform:'darwin',on:()=>{}},__dirname:path.dirname(file),Buffer,console,setTimeout:fn=>{timers.set(++next,fn);return next;},clearTimeout:id=>timers.delete(id),setInterval:()=>0,clearInterval:()=>{}};
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(file,'utf8')+`\n globalThis.testBridge={
    init(){config={...defaults};role='host';helperReady=true;helperBounds={x:0,y:0,width:1920,height:1080};
      globalThis.nativeMessages=[];globalThis.networkMessages=[];
      helper={killed:false,stdin:{writable:true,write:line=>nativeMessages.push(JSON.parse(line))}};
      link={channels:new Map([['peer',{id:'peer',info:{name:'Windows',platform:'win32',inputReady:true,bounds:{x:0,y:0,width:1920,height:1080}},send:m=>networkMessages.push(m)}]])};
    },setRemote,handleNative,runShortcut,release,status:()=>({remote,remoteConfirmed,remoteEpoch,game:config.game})};`,context);
  const h=context.testBridge;h.init();return{h,context,timers};
}
test('Mac handoff does not relay movement or clicks before native capture acknowledgement',()=>{
  const {h,context}=harness();
  try{assert.equal(h.setRemote('peer',{x:10,y:20}),true);assert.equal(context.networkMessages.length,0);
    h.handleNative({type:'button',button:0,down:true});h.handleNative({type:'move',x:100,y:100,dx:2,dy:2});assert.equal(context.networkMessages.length,0);
    const requestId=h.status().remoteEpoch;
    h.handleNative({type:'control',remote:true,requestId:requestId-1});assert.equal(h.status().remoteConfirmed,false);
    h.handleNative({type:'control',remote:true,requestId});assert.equal(h.status().remoteConfirmed,true);assert.equal(context.networkMessages[0].event.type,'move');
    h.handleNative({type:'button',button:0,down:true});assert.equal(context.networkMessages.at(-1).event.type,'button');assert.equal(context.networkMessages.at(-1).event.down,true);
  }finally{h.release();}
});
test('failed Mac capture cancels handoff and late acknowledgements cannot reactivate it',()=>{
  const {h,context,timers}=harness();h.setRemote('peer',{x:10,y:20});const requestId=h.status().remoteEpoch;
  [...timers.values()][0]();assert.equal(h.status().remote,null);assert.equal(h.status().remoteConfirmed,false);
  assert(context.nativeMessages.some(m=>m.op==='release'));
  h.handleNative({type:'control',remote:true,requestId});assert.equal(h.status().remote,null);
  assert.equal(context.networkMessages.filter(m=>m.type==='input').length,0);
});
test('repeated shortcut return and edge re-entry keeps keyboard delivery active',()=>{
  const {h,context}=harness();
  for(let n=0;n<10;n++){
    h.setRemote('peer',{x:20,y:20});h.handleNative({type:'control',remote:true,requestId:h.status().remoteEpoch});
    const before=context.networkMessages.filter(m=>m.type==='input'&&m.event.type==='key').length;
    h.handleNative({type:'key',key:'KeyA',down:true});h.handleNative({type:'key',key:'KeyA',down:false});
    assert.equal(context.networkMessages.filter(m=>m.type==='input'&&m.event.type==='key').length,before+2);
    h.handleNative({type:'shortcut',action:'hop'});assert.equal(h.status().remote,null);assert.equal(h.status().remoteConfirmed,false);
  }
});
test('cursor-lock native shortcut toggles lock without abandoning the active computer',()=>{
  const {h}=harness();try{h.setRemote('peer',{x:20,y:20});h.handleNative({type:'control',remote:true,requestId:h.status().remoteEpoch});h.handleNative({type:'shortcut',action:'cursor-lock'});assert.equal(h.status().game,true);assert.equal(h.status().remote,'peer');h.handleNative({type:'shortcut',action:'cursor-lock'});assert.equal(h.status().game,false);}finally{h.release();}
});
