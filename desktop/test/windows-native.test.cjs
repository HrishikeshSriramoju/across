'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process'),path=require('node:path');
test('Windows production helper compiles and its raw input structures have correct native offsets',{skip:process.platform!=='win32'},()=>{
 const out=execFileSync('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'../native/WindowsInput.ps1'),'-SelfTest'],{encoding:'utf8',timeout:30000});assert.equal(JSON.parse(out.trim()).ok,true);
});
