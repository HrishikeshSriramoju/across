const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const state=JSON.parse(localStorage.getItem('acrossState')||'{}');
const toast=(msg)=>{const t=$('#toast');t.textContent=msg;t.classList.add('show');clearTimeout(window.toastTimer);window.toastTimer=setTimeout(()=>t.classList.remove('show'),2200)};
const persist=()=>localStorage.setItem('acrossState',JSON.stringify(state));

// Navigation
const viewMap={desk:'#deskView',clipboard:'#clipboardView',transfers:'#transfersView',automations:'#automationsView'};
$$('.nav-item').forEach(btn=>btn.addEventListener('click',()=>{$$('.nav-item').forEach(x=>x.classList.remove('active'));btn.classList.add('active');$$('.view').forEach(x=>x.classList.remove('active'));$(viewMap[btn.dataset.view]).classList.add('active');$('#viewTitle').textContent={desk:'Desk map',clipboard:'Clipboard',transfers:'File transfers',automations:'Routines'}[btn.dataset.view]}));

// Draggable devices
let drag=null;
$$('.device-card').forEach(card=>{const saved=state.positions?.[card.dataset.device];if(saved){card.style.left=saved.left;card.style.top=saved.top}card.addEventListener('pointerdown',e=>{if($('.tool.active')?.dataset.mode==='test')return;drag={card,x:e.clientX,y:e.clientY,left:card.offsetLeft,top:card.offsetTop};card.setPointerCapture(e.pointerId);$$('.device-card').forEach(x=>x.classList.remove('selected'));card.classList.add('selected')});card.addEventListener('pointermove',e=>{if(!drag||drag.card!==card)return;const canvas=$('#deskCanvas'),x=Math.max(0,Math.min(canvas.clientWidth-card.offsetWidth,drag.left+e.clientX-drag.x)),y=Math.max(0,Math.min(canvas.clientHeight-card.offsetHeight,drag.top+e.clientY-drag.y));card.style.left=x+'px';card.style.top=y+'px'});card.addEventListener('pointerup',()=>{if(!drag)return;state.positions=state.positions||{};state.positions[card.dataset.device]={left:card.style.left,top:card.style.top};persist();drag=null})});
$$('.tool[data-mode]').forEach(btn=>btn.addEventListener('click',()=>{$$('.tool[data-mode]').forEach(x=>x.classList.remove('active'));btn.classList.add('active');if(btn.dataset.mode==='test'){const dot=$('#handoffDot');dot.classList.remove('run');void dot.offsetWidth;dot.classList.add('run');toast('Handoff path tested · 4 ms average')}}));
$('#fitDesk').addEventListener('click',()=>{$$('.device-card').forEach((c,i)=>{const pos=[['8%','22%'],['46%','13%'],['57%','58%']][i];c.style.left=pos[0];c.style.top=pos[1]});state.positions={};persist();toast('Desk map centered')});

// Quick controls
['#focusToggle','#dimToggle'].forEach(sel=>$(sel).addEventListener('click',e=>{const sw=$('.switch',e.currentTarget);sw.classList.toggle('on');const name=$('b',e.currentTarget).textContent;toast(`${name} ${sw.classList.contains('on')?'enabled':'disabled'}`)}));
$('#lockAll').addEventListener('click',()=>toast('All connected devices locked'));
$('#addDevice').addEventListener('click',()=>toast('Pairing code: 782 441 · expires in 5 minutes'));

// Clipboard
let clips=state.clips||[{type:'text',value:'design-system-notes.md',meta:'Studio Mac · just now'},{type:'link',value:'https://developer.mozilla.org/',meta:'Design PC · 4 min ago'},{type:'text',value:'npm run build',meta:'ThinkPad · 11 min ago'}];
function renderClips(){const list=$('#clipboardList');list.innerHTML=clips.length?clips.map((c,i)=>`<article class="clip-item"><span class="clip-type">${c.type==='link'?'↗':'T'}</span><div><b>${escapeHtml(c.value)}</b><small>${c.meta}</small></div><button data-copy="${i}" aria-label="Copy item">□</button></article>`).join(''):'<p>No saved clipboard items.</p>';$('#clipCount').textContent=clips.length;$$('[data-copy]').forEach(b=>b.onclick=()=>{navigator.clipboard?.writeText(clips[+b.dataset.copy].value);toast('Copied to this browser')})}
$('#clearClipboard').addEventListener('click',()=>{clips=[];state.clips=clips;persist();renderClips();toast('Clipboard history cleared')});renderClips();

// Transfers
$('#chooseFiles').onclick=()=>$('#fileInput').click();$('#dropZone').addEventListener('dragover',e=>e.preventDefault());$('#dropZone').addEventListener('drop',e=>{e.preventDefault();queueFiles(e.dataTransfer.files)});$('#fileInput').onchange=e=>queueFiles(e.target.files);
function queueFiles(files){[...files].forEach(file=>{const item=document.createElement('article');item.className='transfer-item';item.innerHTML=`<span class="clip-type">⇅</span><div><b>${escapeHtml(file.name)}</b><small>${formatBytes(file.size)} · sending to Design PC</small></div><strong>Sending</strong><i class="progress"></i>`;$('#transferList').prepend(item);requestAnimationFrame(()=>$('.progress',item).style.width='100%');setTimeout(()=>{$('strong',item).textContent='Complete';toast(`${file.name} transferred (demo)`)},1600)})}
const formatBytes=n=>n<1024?n+' B':n<1048576?(n/1024).toFixed(1)+' KB':(n/1048576).toFixed(1)+' MB';

// Routines
let routines=state.routines||[{name:'Focus handoff',desc:'Mute client notifications when the cursor enters Studio Mac.',on:true},{name:'Presentation clean-up',desc:'Hide desktop icons and enable Do Not Disturb across every screen.',on:true},{name:'Night desk',desc:'Dim inactive displays after 8:00 PM.',on:false},{name:'Game boundary',desc:'Lock the cursor to Design PC while a full-screen game is active.',on:true}];
function renderRoutines(){$('#routineGrid').innerHTML=routines.map((r,i)=>`<article class="routine"><header><h5>${r.name}</h5><i class="switch ${r.on?'on':''}" data-routine="${i}"></i></header><p>${r.desc}</p></article>`).join('');$$('[data-routine]').forEach(s=>s.onclick=()=>{const r=routines[+s.dataset.routine];r.on=!r.on;s.classList.toggle('on');state.routines=routines;persist();toast(`${r.name} ${r.on?'enabled':'disabled'}`)})}renderRoutines();
$('#addRoutine').onclick=()=>{routines.unshift({name:'New workspace routine',desc:'A ready-to-customize local automation.',on:false});state.routines=routines;persist();renderRoutines();toast('Routine added')};

// Settings
const dialog=$('#settingsDialog');['#openSettings','#sideSettings'].forEach(s=>$(s).onclick=()=>dialog.showModal());$('#dwell').oninput=e=>$('#dwellValue').textContent=e.target.value+' ms';$$('.swatches button').forEach(b=>b.onclick=()=>{document.documentElement.style.setProperty('--accent',b.dataset.color);state.color=b.dataset.color});
if(state.color)document.documentElement.style.setProperty('--accent',state.color);if(state.name){$('#workspaceName').value=state.name;$('.app-kicker').textContent=state.name}
$('#saveSettings').onclick=()=>{state.name=$('#workspaceName').value||'My workspace';state.dwell=$('#dwell').value;state.profile=$('#profile').value;state.shortcuts=$('#shortcuts').checked;state.clipHistory=$('#clipHistory').checked;$('.app-kicker').textContent=state.name;persist();toast('Workspace preferences saved')};
$('#tourButton').onclick=()=>{$('#workspace').scrollIntoView();setTimeout(()=>{$('.tool[data-mode="test"]').click()},650)};
function escapeHtml(v){return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
