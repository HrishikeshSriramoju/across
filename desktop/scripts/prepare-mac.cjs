'use strict';
const fs=require('node:fs');const path=require('node:path');const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');const bundle=path.join(root,'native','Across Input.app');
fs.mkdirSync(path.join(bundle,'Contents','MacOS'),{recursive:true});
execFileSync('swiftc',['-O','-target','arm64-apple-macos13.0',path.join(root,'native','MacInput.swift'),'-o',path.join(bundle,'Contents','MacOS','across-input')],{stdio:'inherit'});
fs.copyFileSync(path.join(root,'native','InputInfo.plist'),path.join(bundle,'Contents','Info.plist'));
execFileSync('codesign',['--force','--sign','-','--identifier','dev.across.input',bundle],{stdio:'inherit'});
execFileSync('codesign',['--verify','--strict',bundle],{stdio:'inherit'});
console.log('Built and verified Across Input.app');
