'use strict';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];let state,drag=null,toastTimer;
function toast(text){$('#toast').textContent=text;$('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),4000);}
async function act(name,args={}){try{const result=await window.across.act(name,args);if(result.state)render(result.state);if(!result.ok)toast(result.error);return result;}catch(e){toast(e.message);}}
function tab(name){$$('.tab').forEach(t=>t.classList.toggle('selected',t.id===name));$$('[data-tab]').forEach(t=>t.classList.toggle('selected',t.dataset.tab===name));$('#pageTitle').textContent={desk:'Your workspace',sharing:'Sharing',settings:'Preferences',activity:'Activity',about:'Feature status'}[name];}
$$('[data-tab]').forEach(b=>b.onclick=()=>tab(b.dataset.tab));
for(const [selector,name] of [['#host','host'],['#quitSession','disconnect'],['#release','release'],['#enableInput','enable-input'],['#disableInput','disable-input'],['#pause','pause'],['#copyInvite','copy-invite'],['#cancelFiles','cancel-files'],['#openPrivacy','privacy']])$(selector).onclick=async()=>{const b=$(selector);b.disabled=true;await act(name);b.disabled=false;if(name==='copy-invite')toast('Invite copied');};
$('#join').onclick=()=>act('connect',{invite:$('#joinInvite').value.trim()});$('#sendFile').onclick=()=>act('send-file',{id:$('#filePeer').value});
$('#refreshDiscovery').onclick=()=>act('refresh-discovery');$('#renewCode').onclick=()=>act('renew-code');
let nearbyId=null,nearbyBusy=false;
$('#cancelNearby').onclick=()=>{if(!nearbyBusy)$('#nearbyDialog').close();};
$('#nearbyDialog').addEventListener('cancel',e=>{if(nearbyBusy)e.preventDefault();});
$('#nearbyForm').onsubmit=async e=>{e.preventDefault();if(nearbyBusy)return;nearbyBusy=true;$('#confirmNearby').disabled=true;$('#cancelNearby').disabled=true;$('#nearbyResult').textContent='Connecting… Watch the hosting computer and approve the request there.';try{const r=await act('connect-nearby',{id:nearbyId,code:$('#nearbyCode').value});if(r?.ok){$('#nearbyCode').value='';$('#nearbyDialog').close();toast('Computers connected');}else $('#nearbyResult').textContent=r?.error||'Connection failed. Try again.';}finally{nearbyBusy=false;$('#confirmNearby').disabled=false;$('#cancelNearby').disabled=false;}};
function settings(){const value={};$$('[data-setting]').forEach(e=>{value[e.dataset.setting]=e.type==='checkbox'?e.checked:e.type==='number'?Number(e.value):e.value;});return value;}
$('#saveSettings').onclick=async()=>{const r=await act('settings',settings());if(r?.ok)toast('Preferences saved');};
let recordingField=null,recordingCandidate=null,recordingTimeout;
async function finishRecording(cancel=false){
  const field=recordingField,candidate=recordingCandidate;recordingField=null;recordingCandidate=null;clearTimeout(recordingTimeout);
  $$('[data-record]').forEach(b=>{b.disabled=false;b.textContent='Record';});
  if(!field)return;
  if(!cancel&&candidate){$('[data-setting="'+field+'"]').value=candidate;$('#shortcutHint').textContent='Recorded '+candidate+'. Save preferences to apply.';}else $('#shortcutHint').textContent='Recording cancelled. Your shortcut is unchanged.';
  await act('shortcut-record-end');
}
$$('[data-record]').forEach(button=>button.onclick=async()=>{
  if(recordingField)return;const r=await act('shortcut-record-start');if(!r?.ok)return;
  recordingField=button.dataset.record;recordingCandidate=null;$$('[data-record]').forEach(b=>{b.disabled=true;});button.textContent='Press keys…';$('#shortcutHint').textContent='Press your shortcut, then release all keys. Escape cancels.';
  recordingTimeout=setTimeout(()=>finishRecording(true),18000);
});
window.addEventListener('keydown',e=>{if(!recordingField)return;e.preventDefault();e.stopImmediatePropagation();if(e.code==='Escape'&&!e.ctrlKey&&!e.altKey&&!e.metaKey&&!e.shiftKey){finishRecording(true);return;}const candidate=window.ShortcutRecorder.fromEvent(e);if(candidate){recordingCandidate=candidate;$('#shortcutHint').textContent=candidate+' — release all keys to finish.';}},true);
window.addEventListener('keyup',e=>{if(!recordingField)return;e.preventDefault();e.stopImmediatePropagation();if(recordingCandidate&&window.ShortcutRecorder.isComplete(e))finishRecording();},true);
window.addEventListener('blur',()=>{if(recordingField)finishRecording(true);});
$$('#sharing [data-setting]').forEach(e=>e.onchange=()=>act('settings',{[e.dataset.setting]:e.checked}));
$('#saveProfile').onclick=async()=>{await act('settings',settings());await act('profile-save',{name:$('#profileName').value});};$('#loadProfile').onclick=()=>act('profile-load',{name:$('#profiles').value});
function textElement(tag,text,className){const e=document.createElement(tag);e.textContent=text;if(className)e.className=className;return e;}
function render(s){
  const initial=!state,oldConfig=JSON.stringify(state?.config),oldRects=JSON.stringify(state?.rects),oldDevices=JSON.stringify(state?.devices.map(d=>({id:d.id,name:d.name,inputReady:d.inputReady,platform:d.platform})));
  state=s;document.documentElement.style.setProperty('--accent',s.config.accent);
  $('#sideStatus').textContent=s.role==='host'?'Hosting workspace':s.role==='client'?(s.devices.length>1?'Connected to host':'Waiting for host'):'Local workspace';$('#sideDot').classList.toggle('on',s.devices.length>1);$('#connectionStatus').textContent=s.devices.length>1?`${s.devices.length-1} paired · TLS 1.3`:s.role==='host'?'Awaiting computers':'Offline';
  $('#hostAddresses').textContent=s.addresses.length?s.addresses.join(' / ')+':'+s.port:'No local IPv4 address';$('#host').disabled=s.role==='host';$('#invitePanel').hidden=!s.invite;$('#inviteText').value=s.invite;
  $('#pairingCode').textContent=s.pairingCode||'';$('.version').textContent='v'+s.version+' · Personal edition';
  $('#inputStatus').textContent=s.helperStatus;$('#inputDot').classList.toggle('on',s.helperReady);$('#enableInput').disabled=s.helperReady;$('#disableInput').disabled=!s.helperReady;
  $('#permissionHint').textContent=s.helperReady?'Native input bridge active. Use Ctrl+Alt+Esc to return.':s.platform==='darwin'?'Allow the app named by macOS. Open Preferences → Accessibility settings to reveal Across Input.app.':'Enable input on every computer you want to control.';
  $('#activeDevice').textContent=(s.active==='local'?'This computer':s.devices.find(d=>d.id===s.active)?.name||'Remote')+(s.config.game?' · Cursor lock on':'');$('#pause').textContent=s.paused?'Resume input':'Pause input';
  if(initial||oldConfig!==JSON.stringify(s.config)){
    $$('[data-setting]').forEach(e=>{if(document.activeElement===e||e.dataset.setting===recordingField)return;if(e.type==='checkbox')e.checked=!!s.config[e.dataset.setting];else e.value=s.config[e.dataset.setting]??'';});
    const old=$('#profiles').value;$('#profiles').replaceChildren(...Object.keys(s.config.profiles||{}).map(k=>new Option(k,k)));if([...$('#profiles').options].some(o=>o.value===old))$('#profiles').value=old;
  }
  $('#openPrivacy').hidden=s.platform!=='darwin';
  if(!drag&&(initial||oldRects!==JSON.stringify(s.rects)||oldDevices!==JSON.stringify(s.devices.map(d=>({id:d.id,name:d.name,inputReady:d.inputReady,platform:d.platform})))))renderMap();
  $$('.device').forEach(d=>d.classList.toggle('active',d.dataset.id===s.active));
  const peer=$('#filePeer').value;$('#filePeer').replaceChildren(...s.devices.filter(d=>d.id!=='local').map(d=>new Option(d.name,d.id)));if([...$('#filePeer').options].some(o=>o.value===peer))$('#filePeer').value=peer;
  const nearby=$('#nearby');nearby.replaceChildren();if(!s.discovered.length)nearby.append(textElement('p','Looking for computers… Make sure both have the updated Across app open.'));for(const d of s.discovered){const known=s.trustedDevices?.some(r=>r.kind==='host'&&r.pin===d.pin),row=textElement('div','', 'nearby-item'),details=textElement('div','');details.append(textElement('b',d.name),textElement('small',(d.platform==='darwin'?'Mac':'Windows')+' · '+d.host+' · '+(known?'Remembered':d.ready||d.hosting?'Available':'Click Host workspace there to pair')));row.append(details);if(d.ready||d.hosting){const b=textElement('button',known?'Reconnect':'Connect','primary small');b.disabled=s.devices.length>1||nearbyBusy||s.connectionBusy;b.onclick=async()=>{if(known){await act('connect-nearby',{id:d.id});return;}nearbyId=d.id;$('#nearbyTitle').textContent='Connect to '+d.name;$('#nearbyCode').value='';$('#nearbyResult').textContent='';$('#nearbyDialog').showModal();$('#nearbyCode').focus();};row.append(b);}nearby.append(row);}
  const trusted=$('#trustedDevices');trusted.replaceChildren();for(const d of s.trustedDevices||[]){const row=textElement('div','','nearby-item');row.append(textElement('b',d.name),textElement('small',d.kind==='host'?'Remembered host':'Allowed computer'));const b=textElement('button','Forget','outline small');b.onclick=()=>act('forget-device',{id:d.id});row.append(b);trusted.append(row);}if(!s.trustedDevices?.length)trusted.append(textElement('p','No remembered computers yet. Your next approved pairing will be saved.'));
  $('#eventList').replaceChildren(...s.logs.map(l=>{const row=textElement('div','','event');row.append(textElement('time',l.time),textElement('span',l.text));return row;}));
  $('#transferList').replaceChildren(...s.transfers.slice(0,20).map(t=>{const row=textElement('div','','transfer');row.append(textElement('b',t.name),textElement('span',t.status),textElement('small',bytes(t.size)));return row;}));if(!s.transfers.length)$('#transferList').append(textElement('p','No transfers yet.'));
}
function bytes(n){return n>1048576?(n/1048576).toFixed(1)+' MB':n>1024?(n/1024).toFixed(0)+' KB':n+' B';}
function renderMap(){
  const canvas=$('#deskMap'),container=$('#devices');container.replaceChildren();const rects=Object.values(state.rects);const minX=Math.min(...rects.map(r=>r.x)),minY=Math.min(...rects.map(r=>r.y));const width=Math.max(...rects.map(r=>r.x+r.width))-minX,height=Math.max(...rects.map(r=>r.y+r.height))-minY;
  const scale=Math.min((canvas.clientWidth-60)/Math.max(width,1),(canvas.clientHeight-70)/Math.max(height,1),.18);const ox=(canvas.clientWidth-width*scale)/2-minX*scale,oy=(canvas.clientHeight-height*scale)/2-minY*scale;
  for(const device of state.devices){const r=state.rects[device.id];if(!r)continue;const card=textElement('article','','device'+(device.id==='local'?' local':''));card.dataset.id=device.id;card.style.left=(ox+r.x*scale)+'px';card.style.top=(oy+r.y*scale)+'px';card.style.width=Math.max(125,r.width*scale)+'px';card.style.height=Math.max(94,r.height*scale)+'px';
    const top=document.createElement('header');top.append(textElement('span',device.id==='local'?'THIS COMPUTER':state.role==='host'?'CLIENT':'HOST'),textElement('span',device.platform==='darwin'?'⌘ macOS':'⊞ Windows','os'));card.append(top,textElement('b',device.name),textElement('footer',`${r.width} × ${r.height} · ${device.inputReady?'Input ready':'Input off'}`));
    card.onpointerdown=e=>{if(device.id==='local'||state.role!=='host')return;drag={id:device.id,startX:e.clientX,startY:e.clientY,x:r.x,y:r.y,scale,left:parseFloat(card.style.left),top:parseFloat(card.style.top)};card.setPointerCapture(e.pointerId);};
    card.onpointermove=e=>{if(!drag||drag.id!==device.id)return;card.style.left=drag.left+e.clientX-drag.startX+'px';card.style.top=drag.top+e.clientY-drag.startY+'px';};
    card.onpointerup=async e=>{if(!drag)return;const d=drag;drag=null;await act('layout',{id:d.id,x:d.x+(e.clientX-d.startX)/d.scale,y:d.y+(e.clientY-d.startY)/d.scale});renderMap();};container.append(card);
  }
}
window.addEventListener('resize',()=>{if(state&&!drag)renderMap();});window.across.onState(render);act('state');
