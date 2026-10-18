(function(root){
  'use strict';
  const special={Space:'Space',Escape:'Escape',Tab:'Tab',Enter:'Enter',Backspace:'Backspace',Delete:'Delete',Insert:'Insert',Home:'Home',End:'End',PageUp:'PageUp',PageDown:'PageDown',ArrowUp:'Up',ArrowDown:'Down',ArrowLeft:'Left',ArrowRight:'Right',Minus:'Minus',Equal:'Equal',Comma:'Comma',Period:'Period',Slash:'Slash',Semicolon:'Semicolon',Quote:'Quote',Backquote:'Backquote',BracketLeft:'BracketLeft',BracketRight:'BracketRight',Backslash:'Backslash'};
  function fromEvent(e){if(e.repeat||e.isComposing)return null;const c=e.code;const key=special[c]||(/^Key[A-Z]$/.test(c)?c.slice(3):/^Digit[0-9]$/.test(c)?c.slice(5):/^F([1-9]|1[0-9]|20)$/.test(c)?c:null);if(!key||!(e.ctrlKey||e.altKey||e.metaKey))return null;return[e.ctrlKey?'Control':null,e.altKey?'Alt':null,e.shiftKey?'Shift':null,e.metaKey?'Super':null,key].filter(Boolean).join('+');}
  function isComplete(e){return !/^(Control|Alt|Shift|Meta)(Left|Right)$/.test(e.code);}
  if(typeof module==='object')module.exports={fromEvent,isComplete};else root.ShortcutRecorder={fromEvent,isComplete};
})(typeof window==='object'?window:globalThis);
