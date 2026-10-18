'use strict';
const keys={Space:'Space',Escape:'Escape',Tab:'Tab',Enter:'Enter',Backspace:'Backspace',Delete:'Delete',Insert:'Insert',Home:'Home',End:'End',PageUp:'PageUp',PageDown:'PageDown',Up:'ArrowUp',Down:'ArrowDown',Left:'ArrowLeft',Right:'ArrowRight',Minus:'Minus',Equal:'Equal',Comma:'Comma',Period:'Period',Slash:'Slash',Semicolon:'Semicolon',Quote:'Quote',Backquote:'Backquote',BracketLeft:'BracketLeft',BracketRight:'BracketRight',Backslash:'Backslash'};
function parseShortcut(value,platform='darwin'){
  if(typeof value!=='string'||value.length>80)throw new Error('Invalid shortcut');
  const parts=value.split('+'),mods=new Set();let key;
  for(const p of parts){const m={Control:'Control',Ctrl:'Control',Alt:'Alt',Option:'Alt',Shift:'Shift',Command:'Meta',Cmd:'Meta',Super:'Meta',Meta:'Meta',CommandOrControl:platform==='darwin'?'Meta':'Control'}[p];
    if(m){if(mods.has(m))throw new Error('Duplicate modifier');mods.add(m);}
    else{if(key)throw new Error('Use one key with modifiers');key=keys[p]||(/^[A-Z]$/.test(p)?'Key'+p:/^[0-9]$/.test(p)?'Digit'+p:/^F([1-9]|1[0-9]|20)$/.test(p)?p:null);if(!key)throw new Error('Unsupported shortcut key');}
  }
  if(!key||![...mods].some(m=>['Control','Alt','Meta'].includes(m)))throw new Error('Include Control, Option/Alt, or Command/Windows');
  return{key,modifiers:['Control','Alt','Shift','Meta'].filter(m=>mods.has(m))};
}
function validateShortcuts(config,platform){const seen=new Set();for(const field of ['releaseHotkey','hopHotkey','cursorLockHotkey']){const s=parseShortcut(config[field],platform),id=s.modifiers.join('+')+'+'+s.key;if(seen.has(id))throw new Error('Each action needs a different shortcut');seen.add(id);if(field!=='releaseHotkey'&&id==='Control+Alt+Escape')throw new Error('Control+Alt+Escape is reserved for emergency release');}return true;}
module.exports={parseShortcut,validateShortcuts};
