'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{EventEmitter}=require('node:events'),{createRequire}=require('node:module');
const {showWindow,keepWindowInTray,powerPolicy,trayImage}=require('../src/background.cjs');
class Window extends EventEmitter{
  constructor(options){super();this.options=options;this.visible=true;this.minimized=false;this.destroyed=false;this.webContents={send(){},setWindowOpenHandler(){},on(){},session:{setPermissionRequestHandler(){}}};}
  isDestroyed(){return this.destroyed;}isMinimized(){return this.minimized;}isVisible(){return this.visible;}
  minimize(){this.minimized=true;this.emit('minimize');}restore(){this.minimized=false;}show(){this.visible=true;}focus(){this.focused=true;}hide(){this.visible=false;this.emit('hide');}
  async loadFile(){}close(){let prevented=false;this.emit('close',{preventDefault(){prevented=true;}});if(!prevented){this.destroyed=true;this.emit('closed');}return prevented;}
}
async function harness(){
  const file=path.join(__dirname,'../src/main.cjs'),localRequire=createRequire(file),app=new EventEmitter(),intervals=[],native=[],sent=[],blockers=new Map();let next=0,quitCount=0;
  Object.assign(app,{requestSingleInstanceLock:()=>true,quit(){quitCount++;app.emit('before-quit');},commandLine:{appendSwitch(s){app.switches.push(s);}},switches:[],whenReady:()=>Promise.resolve(),getPath:()=>'/unused-test-path',getVersion:()=>'0.1.5',getAppPath:()=>path.dirname(file),setLoginItemSettings(){}});
  class Tray extends EventEmitter{constructor(icon){super();this.icon=icon;}setToolTip(){}setContextMenu(menu){this.menu=menu;}isDestroyed(){return false;}}
  class Discovery extends EventEmitter{constructor(){super();this.peers=new Map();}start(){}close(){}}
  const electron={app,BrowserWindow:Window,Tray,nativeImage:{createFromBitmap:()=>({isEmpty:()=>false})},Menu:{buildFromTemplate:x=>x},ipcMain:{handle(){}},dialog:{showErrorBox(_title,message){throw new Error(message);}},safeStorage:{isEncryptionAvailable:()=>false},screen:{getAllDisplays:()=>[{id:1,bounds:{x:0,y:0,width:1920,height:1080},scaleFactor:1}]},globalShortcut:{register:()=>true,unregisterAll(){}},powerMonitor:new EventEmitter(),powerSaveBlocker:{start(type){blockers.set(++next,type);return next;},stop(id){blockers.delete(id);}}};
  const context={require:n=>n==='electron'?electron:n==='node:fs'?{...fs,promises:{readFile:async()=>{throw new Error('no saved config');},writeFile:async()=>{}}}:n==='selfsigned'?{generate:async()=>({private:'fixture',cert:'fixture'})}:n==='./discovery.cjs'?{Discovery}:localRequire(n),process:{platform:'win32',on(){}},__dirname:path.dirname(file),Buffer,console,setInterval:fn=>{intervals.push(fn);return intervals.length;},clearInterval(){},setTimeout:()=>0,clearTimeout(){}};
  vm.createContext(context);vm.runInContext(fs.readFileSync(file,'utf8').replace('app.whenReady().then','globalThis.startup=app.whenReady().then')+`\nglobalThis.bridge={getWindow:()=>win,getTray:()=>tray,handleMessage,awake,init(){helperReady=true;role='client';helper={killed:false,stdin:{writable:true,write:line=>native.push(JSON.parse(line))},kill(){native.push({op:'killed'});}};link={channels:new Map([['host',{id:'host',lastSeen:Date.now(),send:m=>sent.push(m)}]]),close(){sent.push({type:'closed'});}};awake();},status:()=>({helperReady,role,channels:link.channels.size})};`,Object.assign(context,{native,sent}));
  await context.startup;context.bridge.init();vm.runInContext("link.channels.get('host').info={name:'Mac',bounds:{x:0,y:0,width:1920,height:1080}}",context);return{app,h:context.bridge,intervals,native,sent,blockers,quitCount:()=>quitCount};
}
test('Windows sharing and helper heartbeats continue after minimizing and closing to tray',async()=>{
  const {app,h,intervals,native,sent,blockers,quitCount}=await harness(),win=h.getWindow();
  assert.equal(win.options.webPreferences.backgroundThrottling,false);
  assert(app.switches.includes('disable-renderer-backgrounding'));
  for(const hide of [()=>win.minimize(),()=>win.close()]){
    hide();await h.handleMessage({id:'host'},{type:'input',event:{type:'key',key:'KeyA',down:true}});
    await h.handleMessage({id:'host'},{type:'input',event:{type:'key',key:'KeyA',down:false}});
    await h.handleMessage({id:'host'},{type:'input',event:{type:'button',button:0,down:true}});
    await h.handleMessage({id:'host'},{type:'input',event:{type:'move',x:20,y:30}});
    for(const tick of intervals)tick();
    assert(native.some(m=>m.op==='heartbeat'));assert.equal(h.status().helperReady,true);assert.equal(h.status().channels,1);
  }
  assert.equal(native.filter(m=>m.op==='inject').length,8);assert.equal(win.isDestroyed(),false);assert.equal(win.isVisible(),false);
  app.emit('window-all-closed');assert.equal(quitCount(),0);assert(!sent.some(m=>m.type==='closed'));
  assert.deepEqual([...blockers.values()],['prevent-app-suspension']);
});
test('tray open and second launch restore the existing window; explicit Quit cleans up',async()=>{
  const {app,h,native,sent,blockers,quitCount}=await harness(),win=h.getWindow(),tray=h.getTray();
  win.minimize();win.close();tray.menu.find(m=>m.label==='Open Across').click();assert(win.isVisible());assert(!win.isMinimized());assert(win.focused);
  win.minimize();win.hide();app.emit('second-instance');assert(win.isVisible());assert(!win.isMinimized());
  tray.menu.find(m=>m.label==='Quit Across').click();assert.equal(quitCount(),1);assert(sent.some(m=>m.type==='closed'));assert(native.some(m=>m.op==='quit'));assert(native.some(m=>m.op==='killed'));assert.equal(blockers.size,0);assert.equal(win.close(),false);
});
test('a failed tray never leaves an inaccessible hidden window',()=>{
  const win=new Window();keepWindowInTray(win,{isQuitting:()=>false,hasTray:()=>false});assert.equal(win.close(),true);assert(win.isVisible());assert(!win.isDestroyed());
  showWindow(null);
});
test('sharing sleep protection does not force the display on unless explicitly requested',()=>{
  assert.equal(powerPolicy(false,false,false),null);assert.equal(powerPolicy(true,false,false),'prevent-app-suspension');assert.equal(powerPolicy(false,true,false),'prevent-app-suspension');assert.equal(powerPolicy(true,true,true),'prevent-display-sleep');assert.equal(powerPolicy(false,false,true),null);
});
test('tray icon is a nonempty cross-platform bitmap, not an unsupported SVG',()=>{
  let bitmap;trayImage({createFromBitmap(pixels,options){bitmap={pixels,options};return{isEmpty:()=>false};}});assert.equal(bitmap.pixels.length,4096);assert.equal(bitmap.options.width,32);assert(bitmap.pixels.some(v=>v===255));assert.throws(()=>trayImage({createFromBitmap:()=>({isEmpty:()=>true})}),/tray icon/);
});
