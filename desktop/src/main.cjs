'use strict';
const {app,BrowserWindow,ipcMain,dialog,clipboard,ClipboardItem,nativeImage,screen,globalShortcut,powerSaveBlocker,powerMonitor,Tray,Menu,shell}=require('electron');
const fs=require('node:fs');const fsp=fs.promises;const path=require('node:path');const os=require('node:os');const crypto=require('node:crypto');const {spawn}=require('node:child_process');const readline=require('node:readline');const dgram=require('node:dgram');
const {Link}=require('./link.cjs');const {Discovery}=require('./discovery.cjs');const {route,snap,validRect,clamp}=require('./geometry.cjs');
const {parseShortcut,validateShortcuts}=require('./shortcuts.cjs');
const {TrustStore}=require('./trust-store.cjs');
const {showWindow,keepWindowInTray,powerPolicy,trayImage}=require('./background.cjs');
const primaryInstance=app.requestSingleInstanceLock();
if(!primaryInstance)app.quit();
if(process.platform==='win32')app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.on('second-instance',()=>showWindow(win));
app.on('window-all-closed',()=>{}); // The tray owns application lifetime, even on Windows.
const defaults={name:os.hostname().slice(0,64),port:45876,accent:'#dcff65',dwell:120,deadCorner:20,speed:1,scrollSpeed:1,reverseScroll:false,translate:true,clipboard:false,richClipboard:false,dim:false,dimOpacity:.35,awake:false,game:false,followKeyboard:false,powerSync:false,startup:false,releaseHotkey:'Control+Alt+Escape',hopHotkey:'Control+Alt+Space',layout:{},profiles:{}};
let win,tray,config,identity,link,helper,helperReady=false,helperBounds,helperStatus='Input is off',role='idle',remote=null,pointer={x:0,y:0},edgeSince=0,lastEdge='',lastLocal={x:0,y:0},lastClip='',clipTimer,powerId=null,invite='',udp,discoveryTimer,hostPort,paused=false,dimWindows=[],quitting=false;
let logs=[],transfers=[],discovered=new Map(),incoming=new Map(),outgoing=new Map(),pendingApprovals=0,clipboardBusy=false;
let remoteConfirmed=false,remoteEpoch=0,captureTimer,edgeRearmUntil=0;
let nativeShortcuts=false,recordingShortcut=false,recordingTimer;
defaults.cursorLockHotkey='Control+Alt+L';
defaults.autoReconnect=true;defaults.autoHost=false;
defaults.inputEnabled=false;
let trustStore=null,reconnectPaused=false,connectionBusy=false,lastReconnect=0,powerType=null;
const resources=()=>app.isPackaged?process.resourcesPath:app.getAppPath();
const configPath=()=>path.join(app.getPath('userData'),'preferences.json');
const save=()=>fs.writeFileSync(configPath(),JSON.stringify(config,null,2),{mode:0o600});
function log(text){logs.unshift({time:new Date().toLocaleTimeString(),text:String(text).slice(0,300)});logs=logs.slice(0,60);broadcast();}
function bounds(){if(helperBounds)return helperBounds;return screen.getAllDisplays().map(d=>d.bounds).reduce((r,d)=>{const x=Math.min(r.x,d.x),y=Math.min(r.y,d.y),right=Math.max(r.x+r.width,d.x+d.width),bottom=Math.max(r.y+r.height,d.y+d.height);return{x,y,width:right-x,height:bottom-y};});}
const info=()=>({name:config.name,platform:process.platform,bounds:bounds(),inputReady:helperReady,displays:screen.getAllDisplays().map(d=>({id:String(d.id),bounds:d.bounds,scale:d.scaleFactor}))});
function rects(){
  const all={local:{x:0,y:0,width:bounds().width,height:bounds().height}};let x=all.local.width;
  for(const c of link?.channels.values()||[]){const b=c.info.bounds,p=config.layout[c.id]||config.layout[c.info.name];all[c.id]={x:p?.x??x,y:p?.y??0,width:b.width,height:b.height};x+=b.width;}
  return all;
}
function snapshot(){return{version:app.getVersion(),platform:process.platform,config,role,helperReady,helperStatus,connectionBusy,trustedDevices:trustStore?.values().map(r=>({id:r.id,name:r.name,kind:r.kind,pin:r.kind==='host'?r.pin:undefined}))||[],paused,active:remote||'local',invite,pairingCode:role==='host'&&link?link.pairingCode.match(/.{4}/g).join('-'):'',addresses:addresses(),port:hostPort||config.port,devices:[{id:'local',...info()},...[...(link?.channels.values()||[])].map(c=>({id:c.id,...c.info,latency:c.latency??null}))],rects:rects(),logs,transfers,discovered:[...discovered.values()]};}
function broadcast(){if(win&&!win.isDestroyed())win.webContents.send('state',snapshot());}
function sendNative(command){if(helper&&!helper.killed&&helper.stdin.writable)helper.stdin.write(JSON.stringify(command)+'\n');}
function release(){const previous=remote;remote=null;remoteConfirmed=false;remoteEpoch++;edgeSince=0;lastEdge='';clearTimeout(captureTimer);sendNative({op:'remote',enabled:false,requestId:remoteEpoch});sendNative({op:'release'});for(const c of link?.channels.values()||[])c.send({type:'release'});if(previous){edgeRearmUntil=Date.now()+180;const b=bounds();sendNative({op:'warp',x:clamp(lastLocal.x,b.x+3,b.x+b.width-4),y:clamp(lastLocal.y,b.y+3,b.y+b.height-4)});}closeDimming();broadcast();}
function publishInputInfo(){if(link){link.metadata=info();for(const c of link.channels.values())c.send({type:'info',info:info()});}broadcast();}
function closeDimming(){for(const w of dimWindows)if(!w.isDestroyed())w.close();dimWindows=[];}
function showDimming(){closeDimming();if(!config.dim)return;for(const display of screen.getAllDisplays()){const w=new BrowserWindow({...display.bounds,frame:false,transparent:true,alwaysOnTop:true,skipTaskbar:true,focusable:false,resizable:false,webPreferences:{sandbox:true,nodeIntegration:false,contextIsolation:true}});w.setIgnoreMouseEvents(true);w.loadURL('data:text/html,'+encodeURIComponent('<!doctype html><html style="background:rgba(0,0,0,'+config.dimOpacity+')"></html>'));dimWindows.push(w);}}
function setRemote(id,p){
  const c=link?.channels.get(id);if(!c||!c.info.inputReady||!helperReady)return false;
  if(remote&&remote!==id)link.channels.get(remote)?.send({type:'release'});
  remote=id;pointer=p;remoteEpoch++;remoteConfirmed=false;clearTimeout(captureTimer);sendNative({op:'remote',enabled:true,requestId:remoteEpoch});captureTimer=setTimeout(()=>{if(remote&&!remoteConfirmed){release();log('Input handoff cancelled: the native helper did not confirm local capture.');}},1500);showDimming();broadcast();return true;
}
function handleNative(e){
  if(e.type==='shortcut'){if(!recordingShortcut&&['release','hop','cursor-lock'].includes(e.action))runShortcut(e.action);return;}
  if(e.type==='control'){
    if(e.requestId!==remoteEpoch||!remote)return;
    if(e.remote===true){remoteConfirmed=true;clearTimeout(captureTimer);const c=link?.channels.get(remote);if(c)c.send({type:'input',event:{type:'move',x:c.info.bounds.x+pointer.x,y:c.info.bounds.y+pointer.y}});}
    else release();return;
  }
  if(e.type==='ready'){
    helperReady=!!e.trusted;nativeShortcuts=helperReady&&e.shortcuts===true;helperStatus=helperReady?'Input ready':'Accessibility permission required';if(validRect(e.bounds))helperBounds=e.bounds;shortcuts();awake();
    publishInputInfo();return;
  }
  if(e.type==='permission'){helperStatus=String(e.message||'Waiting for input permission…');broadcast();return;}
  if(e.type==='error'){helperStatus=String(e.message||'Native input error');release();log(helperStatus);return;}
  if(e.type==='panic'){release();log('Control returned to this computer');return;}
  if(role!=='host'||!helperReady||paused)return;
  if(remote&&!remoteConfirmed)return;
  // Frames already in the pipe must not be reinterpreted after a handoff.
  if(remote&&(e.captured!==true||e.requestId!==remoteEpoch))return;
  if(!remote&&e.captured===true)return;
  if(e.type==='move'){
    if(!Number.isFinite(e.x)||!Number.isFinite(e.y))return;
    if(!remote){
      lastLocal={x:e.x,y:e.y};const b=bounds(),px=e.x-b.x,py=e.y-b.y;
      if(Date.now()<edgeRearmUntil)return;
      const edge=px<=1?'left':px>=b.width-2?'right':py<=1?'top':py>=b.height-2?'bottom':'';
      const corner=(px<config.deadCorner||px>b.width-config.deadCorner)&&(py<config.deadCorner||py>b.height-config.deadCorner);
      if(!edge||corner){edgeSince=0;lastEdge='';return;}
      if(edge!==lastEdge){edgeSince=Date.now();lastEdge=edge;}
      if(Date.now()-edgeSince<config.dwell||config.game)return;
      const d={dx:edge==='left'?-4:edge==='right'?4:0,dy:edge==='top'?-4:edge==='bottom'?4:0};const target=route(rects(),'local',{x:px,y:py},d);
      if(target&&target.id!=='local')setRemote(target.id,target);
    }else{
      const dx=clamp(Number(e.dx)||0,-2000,2000)*config.speed,dy=clamp(Number(e.dy)||0,-2000,2000)*config.speed;
      const target=route(rects(),remote,pointer,{dx,dy},config.game);if(!target)return;
      if(target.id==='local'){const b=bounds();lastLocal={x:target.x+b.x,y:target.y+b.y};release();return;}
      if(target.id!==remote){setRemote(target.id,target);return;}
      pointer=target;const c=link.channels.get(remote);if(c)c.send({type:'input',event:{type:'move',x:c.info.bounds.x+pointer.x,y:c.info.bounds.y+pointer.y}});
    }
  }else if(remote&&['key','button','scroll'].includes(e.type)){
    let event={...e};
    if(e.type==='scroll'){const factor=config.scrollSpeed*(config.reverseScroll?-1:1);event.dx=clamp((Number(e.dx)||0)*factor,-100,100);event.dy=clamp((Number(e.dy)||0)*factor,-100,100);}
    const recipients=e.type==='key'&&config.followKeyboard?[...link.channels.values()]:[link.channels.get(remote)];
    for(const c of recipients){if(!c?.info.inputReady)continue;const mapped={...event};if(config.translate&&e.type==='key'&&c.info.platform!==process.platform){if(process.platform==='darwin'&&mapped.key.startsWith('Meta'))mapped.key=mapped.key.replace('Meta','Control');else if(process.platform==='win32'&&mapped.key.startsWith('Control'))mapped.key=mapped.key.replace('Control','Meta');}c.send({type:'input',event:mapped});}
  }
}
async function startHelper(){
  if(helper){sendNative({op:'heartbeat'});return;}
  const base=path.join(resources(),'native');
  const command=process.platform==='darwin'?path.join(base,'Across Input.app','Contents','MacOS','across-input'):'powershell.exe';
  const args=process.platform==='darwin'?['--request-access']:['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(base,'WindowsInput.ps1')];
  helperStatus='Starting input helper…';broadcast();helper=spawn(command,args,{stdio:['pipe','pipe','pipe'],windowsHide:true});
  readline.createInterface({input:helper.stdout}).on('line',line=>{try{handleNative(JSON.parse(line));}catch{}});
  helper.stderr.on('data',d=>{helperStatus=String(d).slice(0,240);broadcast();});
  helper.on('error',e=>{helperStatus=e.message;log(e.message);});
  helper.on('exit',()=>{helper=null;helperReady=false;nativeShortcuts=false;release();shortcuts();awake();if(helperStatus==='Input ready')helperStatus='Input stopped';publishInputInfo();});
}
async function stopHelper(){release();sendNative({op:'quit'});if(helper){const p=helper;setTimeout(()=>{if(p.exitCode===null)p.kill();},1000);}helperReady=false;helperStatus='Input is off';awake();publishInputInfo();}
function addresses(){return Object.values(os.networkInterfaces()).flat().filter(v=>v&&v.family==='IPv4'&&!v.internal).map(v=>v.address);}
function awake(){const wanted=powerPolicy(helperReady,!!link?.channels.size,config.awake);if(wanted===powerType)return;const previous=powerId;powerId=wanted?powerSaveBlocker.start(wanted):null;powerType=wanted;if(previous!==null)powerSaveBlocker.stop(previous);}
function discovery(){
  if(udp)return;
  udp=new Discovery(instance,()=>os.networkInterfaces(),()=>({name:config.name,platform:process.platform,hosting:role==='host'&&!!link?.server,ready:role==='host'&&!!link?.server&&Date.now()<link.expires,port:hostPort,pin:role==='host'?new crypto.X509Certificate(identity.cert).fingerprint256:undefined}));
  discovered=udp.peers;udp.on('change',broadcast);udp.on('fault',e=>log('Discovery unavailable: '+e.message+'. Check Local Network permission or restart Across.'));udp.start();
}
const instance=crypto.randomUUID();
async function createLink(){if(link)await disconnect();link=new Link(identity,info(),async(peer,address)=>{if(pendingApprovals>0)return false;pendingApprovals++;try{win.show();win.focus();win.flashFrame(true);log('Pairing request from '+peer.name+' — approve the connection dialog.');const result=await dialog.showMessageBox(win,{type:'question',buttons:['Decline','Allow this connection'],defaultId:0,cancelId:0,title:'Pair computer',message:'Allow '+peer.name+' to connect?',detail:'Address: '+address+'\nOnly allow a computer you recognize. '+(trustStore?'This computer can be remembered for reconnection without another approval. Revoke access in Preferences → Remembered computers. ':'')+'Clipboard and files work only while connected. Input control requires Enable Input on each computer.'});return result.response===1;}finally{win.flashFrame(false);pendingApprovals--;}});
  link.trust=trustStore;
  link.on('connected',c=>{log('Connected to '+c.info.name+(c.trustId?' · remembered device':''));c.lastSeen=Date.now();awake();broadcast();});
  link.on('disconnected',c=>{if(remote===c.id)release();sendNative({op:'release'});cleanupIncoming(c.id);log(c.info.name+' disconnected');awake();broadcast();});
  link.on('message',(c,m)=>{c.lastSeen=Date.now();handleMessage(c,m).catch(e=>{log(e.message);c.destroy();});});link.on('fault',e=>log(e.message));
}
async function disconnect(){release();link?.close();link=null;role='idle';invite='';for(const id of [...incoming.keys()])await cleanupTransfer(id);for(const t of outgoing.values())t.cancelled=true;awake();broadcast();}
async function joinHost(connect){
  if(connectionBusy)throw new Error('A connection is already in progress.');connectionBusy=true;reconnectPaused=false;let attempt;
  try{await createLink();attempt=link;role='client';config.autoHost=false;save();broadcast();await connect(attempt);log('Connected over TLS 1.3');}
  catch(e){if(link===attempt)await disconnect();throw e;}finally{connectionBusy=false;broadcast();}
}
async function reconnectKnownHost(){
  if(!config.autoReconnect||reconnectPaused||connectionBusy||role==='host'||link?.channels.size||Date.now()-lastReconnect<10000)return;
  for(const record of trustStore?.values()||[]){if(record.kind!=='host')continue;const peer=[...discovered.values()].find(d=>(d.hosting||d.ready)&&d.pin===record.pin&&Date.now()-d.seen<12000);if(!peer)continue;lastReconnect=Date.now();try{await joinHost(l=>l.connectTrusted(peer,record));}catch(e){log('Reconnect failed for '+record.name+': '+e.message);}return;}
}
function validInput(e){if(!e||!['move','key','button','scroll'].includes(e.type))return false;if(e.type==='key')return typeof e.key==='string'&&/^[A-Za-z0-9]{1,28}$/.test(e.key)&&typeof e.down==='boolean';if(e.type==='button')return [0,1,2,3,4].includes(e.button)&&typeof e.down==='boolean';return(e.type==='move'?['x','y']:['dx','dy']).every(k=>Number.isFinite(e[k])&&Math.abs(e[k])<=100000);}
async function handleMessage(c,m){
  if(m.type==='ping'){c.send({type:'pong',at:m.at});return;}
  if(m.type==='pong'){c.latency=Math.max(0,Date.now()-Number(m.at));return;}
  if(m.type==='info'){const {validMetadata}=require('./link.cjs');if(validMetadata(m.info)){c.info=m.info;if(remote===c.id&&!c.info.inputReady){release();log(c.info.name+' input is unavailable; control returned locally.');}}broadcast();return;}
  if(m.type==='input'&&role==='client'&&helperReady&&!paused&&validInput(m.event)){sendNative({op:'inject',event:m.event});return;}
  if(m.type==='release'){if(role==='host'&&remote===c.id)release();else sendNative({op:'release'});return;}
  if(m.type==='clipboard'&&config.clipboard&&typeof m.text==='string'&&m.text.length<=500000){
    if(clipboardBusy)return;clipboardBusy=true;
    try{const payload={'text/plain':m.text};if(config.richClipboard){if(typeof m.html==='string'&&m.html.length<=500000)payload['text/html']=m.html;if(typeof m.png==='string'&&m.png.length<=500000){const image=nativeImage.createFromBuffer(Buffer.from(m.png,'base64'));if(!image.isEmpty())payload['image/png']=new Blob([image.toPNG()],{type:'image/png'});}}await clipboard.write([new ClipboardItem(payload)]);lastClip=digestClip(await readClip());}finally{clipboardBusy=false;}return;
  }
  if(m.type==='lock'&&config.powerSync){lockLocal();return;}
  if(m.type==='file-offer'){await offerFile(c,m);return;}
  if(m.type==='file-accept'){const transfer=outgoing.get(m.id);if(transfer&&transfer.peer===c.id)transfer.accept?.();return;}
  if(m.type==='file-cancel'){const t=outgoing.get(m.id);if(t&&t.peer===c.id){t.cancelled=true;t.decline?.();}await cleanupTransfer(m.id,c.id);return;}
  if(m.type==='file-chunk'){const t=incoming.get(m.id);if(!t||t.peer!==c.id||typeof m.data!=='string'||m.data.length>90000)return;const b=Buffer.from(m.data,'base64');t.received+=b.length;if(t.received>t.size)throw new Error('File size exceeded');fs.writeSync(t.fd,b);t.hash.update(b);return;}
  if(m.type==='file-end'){const t=incoming.get(m.id);if(!t||t.peer!==c.id)return;fs.closeSync(t.fd);t.fd=null;if(t.received!==t.size||t.hash.digest('hex')!==m.hash){await cleanupTransfer(m.id);throw new Error('Transfer integrity check failed');}await fsp.rename(t.temp,t.dest);incoming.delete(m.id);transfers.unshift({name:t.name,status:'Received and verified',size:t.size});c.send({type:'file-complete',id:m.id});log('Received '+t.name);return;}
  if(m.type==='file-complete'){const t=outgoing.get(m.id);if(t&&t.peer===c.id){t.complete?.();outgoing.delete(m.id);transfers.unshift({name:t.name,status:'Delivered and verified',size:t.size});log('Delivered '+t.name);}return;}
}
async function readClip(){const out={type:'clipboard',text:''};const items=await clipboard.read();for(const item of items){for(const [mime,key] of [['text/plain','text'],['text/html','html'],['image/png','png']]){if(!item.types.includes(mime)||(key!=='text'&&!config.richClipboard))continue;const blob=await item.getType(mime);if(blob.size>375000)continue;out[key]=key==='png'?Buffer.from(await blob.arrayBuffer()).toString('base64'):await blob.text();}}return out;}
const digestClip=payload=>crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
async function pollClipboard(){if(clipboardBusy||!config.clipboard||!link?.channels.size)return;clipboardBusy=true;try{const payload=await readClip(),digest=digestClip(payload);if(digest===lastClip)return;lastClip=digest;if(JSON.stringify(payload).length>900000)return;for(const c of link.channels.values())c.send(payload);}finally{clipboardBusy=false;}}
async function cleanupTransfer(id,peer){const t=incoming.get(id);if(!t||(peer&&t.peer!==peer))return;incoming.delete(id);try{if(t.fd!==null)fs.closeSync(t.fd);await fsp.unlink(t.temp);}catch{}}
async function cleanupIncoming(peer){for(const [id,t] of incoming)if(t.peer===peer)await cleanupTransfer(id);}
async function offerFile(c,m){
  if(typeof m.id!=='string'||m.id.length>64||typeof m.name!=='string'||m.name.length>255||!Number.isSafeInteger(m.size)||m.size<0||m.size>512*1024*1024||incoming.size||pendingApprovals){c.send({type:'file-cancel',id:m.id});return;}
  pendingApprovals++;let picked;try{picked=await dialog.showSaveDialog(win,{title:'Receive file from '+c.info.name,defaultPath:path.join(app.getPath('downloads'),path.basename(m.name.replace(/\\/g,'/'))),buttonLabel:'Accept and save'});}finally{pendingApprovals--;}
  if(picked.canceled||!picked.filePath||c.closed){c.send({type:'file-cancel',id:m.id});return;}
  const temp=picked.filePath+'.across-'+crypto.randomBytes(6).toString('hex')+'.part';const fd=fs.openSync(temp,'wx',0o600);
  incoming.set(m.id,{peer:c.id,name:m.name,size:m.size,received:0,fd,temp,dest:picked.filePath,hash:crypto.createHash('sha256')});c.send({type:'file-accept',id:m.id});log('Receiving '+m.name);
}
async function sendFile(peerId){
  const c=link?.channels.get(peerId);if(!c)throw new Error('Choose a connected computer');if(outgoing.size)throw new Error('Finish or cancel the current transfer first');
  const picked=await dialog.showOpenDialog(win,{properties:['openFile'],title:'Send a file (up to 512 MB)'});if(picked.canceled)return;const filename=picked.filePaths[0],stat=await fsp.stat(filename);if(!stat.isFile()||stat.size>512*1024*1024)throw new Error('Choose a file up to 512 MB');
  const id=crypto.randomUUID(),name=path.basename(filename),t={peer:c.id,name,size:stat.size,cancelled:false};outgoing.set(id,t);transfers.unshift({id,name,status:'Waiting for approval',size:stat.size});broadcast();
  try{
    await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('File offer timed out')),60000);t.accept=()=>{clearTimeout(timer);resolve();};t.decline=()=>{clearTimeout(timer);reject(new Error('File declined'));};c.send({type:'file-offer',id,name,size:stat.size});});
    const hash=crypto.createHash('sha256');const stream=fs.createReadStream(filename,{highWaterMark:48*1024});
    for await(const chunk of stream){if(t.cancelled||c.closed)throw new Error('Transfer cancelled');hash.update(chunk);await c.sendWait({type:'file-chunk',id,data:chunk.toString('base64')});}
    await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Transfer verification timed out')),30000);t.complete=()=>{clearTimeout(timer);resolve();};t.decline=()=>{clearTimeout(timer);reject(new Error('Transfer cancelled'));};c.send({type:'file-end',id,hash:hash.digest('hex')});});
  }catch(e){c.send({type:'file-cancel',id});log(e.message);}finally{outgoing.delete(id);transfers=transfers.filter(x=>x.id!==id);broadcast();}
}
function lockLocal(){release();const command=process.platform==='win32'?'rundll32.exe':'/System/Library/CoreServices/Menu Extras/User.menu/Contents/Resources/CGSession';const args=process.platform==='win32'?['user32.dll,LockWorkStation']:['-suspend'];spawn(command,args,{windowsHide:true}).on('error',e=>log('Lock unavailable: '+e.message));}
function runShortcut(action){
  if(action==='release'){release();log('Control returned to this computer');return;}
  if(action==='cursor-lock'){config.game=!config.game;for(const c of link?.channels.values()||[])c.send({type:'release'});save();broadcast();log('Cursor lock '+(config.game?'on':'off'));return;}
  if(action==='hop'){if(remote){release();return;}const c=[...(link?.channels.values()||[])].find(x=>x.info.inputReady);if(role==='host'&&c){const b=bounds();lastLocal={x:b.x+b.width/2,y:b.y+b.height/2};setRemote(c.id,{x:30,y:30});}}
}
function shortcuts(){
  globalShortcut.unregisterAll();const bindings=[['releaseHotkey','release'],['hopHotkey','hop'],['cursorLockHotkey','cursor-lock']];
  if(recordingShortcut){sendNative({op:'shortcuts',bindings:[]});return;}
  try{validateShortcuts(config,process.platform);if(nativeShortcuts){sendNative({op:'shortcuts',bindings:bindings.map(([field,action])=>({action,...parseShortcut(config[field],process.platform)}))});return;}
    for(const [field,action] of bindings)if(!globalShortcut.register(config[field],()=>runShortcut(action)))log('Shortcut unavailable: '+config[field]);
  }catch(e){log('Shortcut unavailable: '+e.message);}
}
function updateSettings(v){
  if(!v||typeof v!=='object')throw new Error('Invalid settings');
  const proposed={...config};for(const key of ['releaseHotkey','hopHotkey','cursorLockHotkey'])if(typeof v[key]==='string')proposed[key]=v[key];validateShortcuts(proposed,process.platform);
  for(const key of ['clipboard','richClipboard','dim','awake','game','followKeyboard','powerSync','translate','reverseScroll','startup','autoReconnect'])if(typeof v[key]==='boolean')config[key]=v[key];
  for(const [key,a,b] of [['dwell',0,1500],['speed',.1,5],['scrollSpeed',.1,5],['deadCorner',0,200],['dimOpacity',.05,.85]])if(Number.isFinite(v[key]))config[key]=clamp(v[key],a,b);
  if(typeof v.name==='string')config.name=v.name.trim().slice(0,64)||os.hostname();if(/^#[a-f0-9]{6}$/i.test(v.accent))config.accent=v.accent;
  if(Number.isInteger(v.port)&&v.port>=1024&&v.port<=65535)config.port=v.port;
  for(const key of ['releaseHotkey','hopHotkey','cursorLockHotkey'])config[key]=proposed[key];
  save();shortcuts();awake();lastClip='';app.setLoginItemSettings({openAtLogin:config.startup});broadcast();
}
async function action(name,args){
  switch(name){
    case 'state':return snapshot();
    case 'shortcut-record-start':release();recordingShortcut=true;win.webContents.setIgnoreMenuShortcuts(true);clearTimeout(recordingTimer);shortcuts();recordingTimer=setTimeout(()=>{recordingShortcut=false;win.webContents.setIgnoreMenuShortcuts(false);shortcuts();},20000);break;
    case 'shortcut-record-end':recordingShortcut=false;win.webContents.setIgnoreMenuShortcuts(false);clearTimeout(recordingTimer);shortcuts();break;
    case 'host':if(connectionBusy)throw new Error('Disconnect the pending connection before hosting.');await createLink();role='host';try{hostPort=await link.listen(config.port);config.autoHost=true;save();invite=link.createInvite(addresses()[0]||'127.0.0.1',hostPort);udp?.announce();log('Hosting encrypted workspace. Paired computers can reconnect without a code.');}catch(e){role='idle';throw e;}broadcast();break;
    case 'refresh-discovery':udp?.refresh();log('Looking for Across computers on your local network…');break;
    case 'renew-code':if(role!=='host'||!link?.server)throw new Error('Start hosting first.');link.refreshPairing();invite=link.createInvite(addresses()[0]||'127.0.0.1',hostPort);udp?.announce();broadcast();break;
    case 'connect-nearby':{const peer=discovered.get(args.id);if(!peer||(!peer.ready&&!peer.hosting)||Date.now()-peer.seen>12000)throw new Error('This host is no longer available. Refresh nearby computers.');const known=trustStore?.values().find(r=>r.kind==='host'&&r.pin===peer.pin);if(!known&&(typeof args.code!=='string'||!/^[A-Fa-f0-9]{16}$/.test(args.code.replace(/[\s-]/g,''))))throw new Error('Enter the 16-character code shown on the host.');log('Connecting to '+peer.name+(known?' (remembered)':' — approve the request there.'));await joinHost(l=>known?l.connectTrusted(peer,known):l.connectNearby(peer,args.code));break;}
    case 'connect':await joinHost(l=>l.connect(args.invite));break;
    case 'disconnect':reconnectPaused=true;config.autoHost=false;save();await disconnect();break;
    case 'forget-device':if(!trustStore?.get(args.id))throw new Error('Device not found');trustStore.delete(args.id);for(const c of link?.channels.values()||[])if(c.trustId===args.id){if(remote===c.id)release();c.destroy();}log('Forgot device. A new approved pairing will be required.');broadcast();break;
    case 'enable-input':config.inputEnabled=true;save();await startHelper();break;
    case 'disable-input':config.inputEnabled=false;save();await stopHelper();break;
    case 'release':release();break;
    case 'pause':paused=!paused;release();break;
    case 'settings':updateSettings(args);break;
    case 'copy-invite':if(invite)await clipboard.writeText(invite);break;
    case 'send-file':await sendFile(args.id);break;
    case 'cancel-files':for(const [id,t] of outgoing){t.cancelled=true;t.decline?.();link?.channels.get(t.peer)?.send({type:'file-cancel',id});}break;
    case 'layout':{if(typeof args.id!=='string'||!link?.channels.has(args.id)||!Number.isFinite(args.x)||!Number.isFinite(args.y))throw new Error('Invalid layout');const all=rects(),r=snap({...all[args.id],x:clamp(args.x,-50000,50000),y:clamp(args.y,-50000,50000)},Object.entries(all).filter(([id])=>id!==args.id).map(([,v])=>v));config.layout[link.channels.get(args.id).info.name]={x:r.x,y:r.y};save();broadcast();break;}
    case 'profile-save':{const name=String(args.name).slice(0,40);if(!name)break;config.profiles[name]={...config,profiles:{}};save();log('Saved profile '+name);break;}
    case 'profile-load':{const p=config.profiles[String(args.name)];if(!p)throw new Error('Profile not found');const profiles=config.profiles;config={...config,...p,profiles};save();shortcuts();awake();release();broadcast();break;}
    case 'privacy':if(process.platform==='darwin'){shell.showItemInFolder(path.join(resources(),'native','Across Input.app'));await shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility');}break;
    default:throw new Error('Unsupported action');
  }return snapshot();
}
app.whenReady().then(async()=>{
  if(!primaryInstance)return;
  config={...defaults};try{config={...defaults,...JSON.parse(await fsp.readFile(configPath(),'utf8'))};}catch{}
  try{const cipher=require('electron').safeStorage;if(cipher.isEncryptionAvailable())trustStore=new TrustStore(path.join(app.getPath('userData'),'trusted-devices.enc'),cipher);else log('Remembered pairing unavailable: OS credential protection is not ready.');}catch(e){log('Remembered pairing unavailable: '+e.message);}
  const certPath=path.join(app.getPath('userData'),'identity.json');try{identity=JSON.parse(await fsp.readFile(certPath,'utf8'));new crypto.X509Certificate(identity.cert);}catch{identity=await require('selfsigned').generate([{name:'commonName',value:'Across local peer'}],{keySize:2048,algorithm:'sha256',days:3650});await fsp.writeFile(certPath,JSON.stringify({private:identity.private,cert:identity.cert}),{mode:0o600});}
  win=new BrowserWindow({width:1190,height:850,minWidth:840,minHeight:650,title:'Across',backgroundColor:'#141714',webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
  keepWindowInTray(win,{isQuitting:()=>quitting,hasTray:()=>!!tray&&!tray.isDestroyed()});
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',e=>e.preventDefault());win.webContents.session.setPermissionRequestHandler((_w,_p,done)=>done(false));
  ipcMain.handle('action',async(event,name,args={})=>{if(event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame)throw new Error('Untrusted sender');try{return{ok:true,state:await action(name,args)}}catch(e){log(e.message);return{ok:false,error:e.message,state:snapshot()}}});
  await win.loadFile(path.join(__dirname,'index.html'));
  tray=new Tray(trayImage(nativeImage));tray.setToolTip('Across — running in background; Ctrl+Alt+Esc releases control');tray.setContextMenu(Menu.buildFromTemplate([{label:'Open Across',click:()=>showWindow(win)},{label:'Release input',click:release},{label:'Disconnect',click:disconnect},{type:'separator'},{label:'Quit Across',click:()=>{quitting=true;app.quit();}}]));tray.on('click',()=>showWindow(win));tray.on('double-click',()=>showWindow(win));
  shortcuts();discovery();clipTimer=setInterval(()=>{pollClipboard().catch(e=>log(e.message));},800);
  if(config.inputEnabled)await startHelper();
  if(config.autoHost&&config.autoReconnect)try{await action('host',{});}catch(e){log('Automatic hosting unavailable: '+e.message);}
  setInterval(()=>{sendNative({op:'heartbeat'});},400);
  discoveryTimer=setInterval(()=>{
    reconnectKnownHost().catch(e=>log(e.message));
    for(const c of link?.channels.values()||[]){if(Date.now()-c.lastSeen>7000){c.destroy();continue;}c.send({type:'ping',at:Date.now()});}broadcast();
  },2000);
  powerMonitor.on('suspend',()=>{release();});powerMonitor.on('lock-screen',()=>{release();if(config.powerSync)for(const c of link?.channels.values()||[])c.send({type:'lock'});});
  app.on('activate',()=>showWindow(win));log('Ready. Minimize or close this window to keep sharing in the tray. Use Quit Across to stop.');
}).catch(e=>{dialog.showErrorBox('Across could not start',e.message);app.quit();});
app.on('before-quit',()=>{quitting=true;release();link?.close();sendNative({op:'quit'});helper?.kill();udp?.close();if(powerId!==null){powerSaveBlocker.stop(powerId);powerId=null;powerType=null;}clearInterval(clipTimer);clearInterval(discoveryTimer);globalShortcut.unregisterAll();for(const t of incoming.values()){try{if(t.fd!==null)fs.closeSync(t.fd);fs.unlinkSync(t.temp);}catch{}}});
process.on('uncaughtException',e=>{release();log('Error: '+e.message);});
