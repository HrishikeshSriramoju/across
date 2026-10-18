'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {parseShortcut,validateShortcuts}=require('../src/shortcuts.cjs'),{fromEvent,isComplete}=require('../src/shortcut-recorder.js');
const defaults={releaseHotkey:'Control+Alt+Escape',hopHotkey:'Control+Alt+Space',cursorLockHotkey:'Control+Alt+L'};
test('recorded physical keys round-trip into native shortcut bindings',()=>{
  const value=fromEvent({code:'KeyL',ctrlKey:true,altKey:true,shiftKey:false,metaKey:false});assert.equal(value,'Control+Alt+L');assert.deepEqual(parseShortcut(value),{key:'KeyL',modifiers:['Control','Alt']});
  assert.equal(fromEvent({code:'KeyK',metaKey:true,shiftKey:true}),'Shift+Super+K');assert.equal(parseShortcut('CommandOrControl+K','win32').modifiers[0],'Control');assert.equal(parseShortcut('CommandOrControl+K','darwin').modifiers[0],'Meta');
});
test('recorder ignores bare typing, modifiers alone, composition, and auto-repeat',()=>{
  for(const e of [{code:'KeyA'},{code:'ShiftLeft',shiftKey:true},{code:'KeyL',ctrlKey:true,repeat:true},{code:'KeyA',ctrlKey:true,isComposing:true}])assert.equal(fromEvent(e),null);
});
test('shortcut validation rejects duplicates, unsupported keys and emergency conflicts',()=>{
  assert.equal(validateShortcuts(defaults,'darwin'),true);assert.throws(()=>validateShortcuts({...defaults,cursorLockHotkey:defaults.hopHotkey}));assert.throws(()=>parseShortcut('Shift+A'));assert.throws(()=>parseShortcut('Control+Alt+KeyWhatever'));assert.throws(()=>parseShortcut('Control+Control+A'));
  assert.throws(()=>validateShortcuts({...defaults,releaseHotkey:'Control+Alt+R',hopHotkey:'Control+Alt+Escape'},'darwin'),/reserved/);
});
test('recording finishes on the shortcut key-up even if modifier flags remain set',()=>{
  assert.equal(isComplete({code:'KeyL',ctrlKey:true,altKey:true}),true);assert.equal(isComplete({code:'ControlLeft',ctrlKey:false}),false);assert.equal(isComplete({code:'AltRight',altKey:false}),false);
});
