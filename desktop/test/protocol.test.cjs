'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const {once}=require('node:events');const {Link,parseInvite,Channel,validMetadata}=require('../src/link.cjs');const {route,snap}=require('../src/geometry.cjs');const {PassThrough}=require('node:stream');
const info={name:'Test host',platform:'darwin',bounds:{x:-100,y:0,width:1920,height:1080},inputReady:false};
let identity;async function cert(){return identity??=await require('selfsigned').generate([{name:'commonName',value:'Across test'}],{keySize:2048,algorithm:'sha256',days:1});}
test('TLS peers authenticate pinned identity, require approval, and carry bidirectional messages',async()=>{
  const certs=await cert();let approvals=0;const host=new Link(certs,info,async()=>{approvals++;return true;});const client=new Link(certs,{...info,name:'Windows client',platform:'win32'},async()=>true);
  try{const port=await host.listen(0,'127.0.0.1');const invite=host.createInvite('127.0.0.1',port);const received=once(host,'connected');const peer=await client.connect(invite);const [hostPeer]=await received;assert.equal(approvals,1);assert.equal(hostPeer.info.name,'Windows client');assert.equal(peer.socket.getProtocol(),'TLSv1.3');
    const message=once(host,'message');peer.send({type:'probe',value:'encrypted payload'});const [,m]=await message;assert.deepEqual(m,{type:'probe',value:'encrypted payload'});
    const reply=once(client,'message');hostPeer.send({type:'answer',ok:true});assert.equal((await reply)[1].ok,true);
  }finally{client.close();host.close();}
});
test('certificate mismatch prevents pairing and host approval',async()=>{
  const certs=await cert();let approvals=0;const host=new Link(certs,info,async()=>{approvals++;return true;});const client=new Link(certs,info,async()=>true);
  try{const port=await host.listen(0,'127.0.0.1');const raw=parseInvite(host.createInvite('127.0.0.1',port));raw.pin='00:'.repeat(31)+'00';const bad='across://'+Buffer.from(JSON.stringify(raw)).toString('base64url');await assert.rejects(client.connect(bad),/certificate/);assert.equal(approvals,0);assert.equal(host.channels.size,0);}finally{client.close();host.close();}
});
test('wrong invite secret and declined approval cannot attach peers',async()=>{
  const certs=await cert();const host=new Link(certs,info,async()=>false),client=new Link(certs,info,async()=>true);
  try{const port=await host.listen(0,'127.0.0.1');const invite=host.createInvite('127.0.0.1',port);await assert.rejects(client.connect(invite));assert.equal(host.channels.size,0);const bad=parseInvite(invite);bad.token='a'.repeat(64);await assert.rejects(client.connect('across://'+Buffer.from(JSON.stringify(bad)).toString('base64url')));assert.equal(host.channels.size,0);}finally{client.close();host.close();}
});
test('expired and malformed invitations rejected',()=>{assert.throws(()=>parseInvite('not an invite'));assert.equal(validMetadata({...info,name:'x'.repeat(65)}),false);assert.equal(validMetadata({...info,bounds:{x:0,y:0,width:NaN,height:1000}}),false);});
test('handoff respects adjoining screens, offsets, dead gaps, and gaming lock',()=>{
  const r={local:{x:0,y:0,width:1920,height:1080},peer:{x:1920,y:200,width:1280,height:720}};
  assert.equal(route(r,'local',{x:1919,y:400},{dx:5,dy:0}).id,'peer');
  assert.equal(route(r,'local',{x:1919,y:100},{dx:5,dy:0}).id,'local');
  assert.equal(route(r,'local',{x:1919,y:400},{dx:5,dy:0},true).id,'local');
  assert.equal(route(r,'peer',{x:0,y:100},{dx:-5,dy:0}).id,'local');
  assert.equal(snap({x:1950,y:0,width:1000,height:800},[r.local]).x,1920);
});
