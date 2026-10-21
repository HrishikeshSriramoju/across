'use strict';
// Generate GitHub Pages' /docs publishing folder from the canonical website source.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),source=path.join(root,'website'),target=path.join(root,'docs');
function copy(from,to){
  fs.mkdirSync(to,{recursive:true});
  for(const item of fs.readdirSync(from,{withFileTypes:true})){
    if(item.name.startsWith('.'))continue;
    const input=path.join(from,item.name),output=path.join(to,item.name);
    if(item.isDirectory())copy(input,output);
    else if(/\.(html|css|js|png|svg|ico|webp|txt)$/.test(item.name))fs.copyFileSync(input,output);
  }
}
copy(source,target);fs.writeFileSync(path.join(target,'.nojekyll'),'');
console.log('GitHub Pages files generated in docs/. Commit website/, docs/, and this script.');
