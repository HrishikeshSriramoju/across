'use strict';
const {execFileSync}=require('node:child_process');const path=require('node:path');
module.exports=async context=>{
  if(context.electronPlatformName!=='darwin')return;
  const app=path.join(context.appOutDir,'Across.app');
  execFileSync('codesign',['--force','--deep','--sign','-','--identifier','dev.across.personal',app],{stdio:'inherit'});
  execFileSync('codesign',['--verify','--deep','--strict',app],{stdio:'inherit'});
  console.log('Across bundle has a verified local development signature (not notarized).');
};
