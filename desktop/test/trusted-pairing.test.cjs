'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {Link}=require('../src/link.cjs');
const info={name:'Remembered Mac',platform:'darwin',bounds:{x:0,y:0,width:1920,height:1080},inputReady:false};
let identity;async function cert(){return identity??=await require('selfsigned').generate([{name:'commonName',value:'Across remembered test'}],{keySize:2048,algorithm:'sha256',days:1});}
function memoryStore(records=new Map()){return{get:id=>records.get(id),put:r=>records.set(r.id,r),values:()=>[...records.values()],delete:id=>records.delete(id),records};}
test('approved first pairing persists credentials and reconnects after host restart without approval or a code',async()=>{
  const identity=await cert(),hs=memoryStore(),cs=memoryStore();let approvals=0;
  let host=new Link(identity,info,async()=>{approvals++;return true;},hs);const client=new Link(identity,{...info,name:'Windows',platform:'win32'},async()=>true,cs);
  try{let port=await host.listen(0,'127.0.0.1'),peer={host:'127.0.0.1',port,pin:new crypto.X509Certificate(identity.cert).fingerprint256};await client.connectNearby(peer,host.pairingCode);
    assert.equal(approvals,1);assert.equal(hs.values().length,1);assert.equal(cs.values().length,1);const record=cs.values()[0];assert.equal(record.kind,'host');assert.equal(hs.get(record.id).secret,record.secret);
    client.close();host.close();host=new Link(identity,info,async()=>{throw new Error('Trusted reconnect must not ask approval');},hs);port=await host.listen(0,'127.0.0.1');host.expires=Date.now()-1;
    await client.connectTrusted({...peer,port},record);assert.equal(client.channels.size,1);assert.equal(host.channels.size,1);assert.equal(approvals,1);
  }finally{client.close();host.close();}
});
test('forgotten credentials and altered host fingerprints cannot reconnect',async()=>{
  const identity=await cert(),hs=memoryStore(),cs=memoryStore(),host=new Link(identity,info,async()=>true,hs),client=new Link(identity,info,async()=>true,cs);
  try{const port=await host.listen(0,'127.0.0.1'),peer={host:'127.0.0.1',port,pin:new crypto.X509Certificate(identity.cert).fingerprint256};await client.connectNearby(peer,host.pairingCode);const record=cs.values()[0];client.close();
    await assert.rejects(client.connectTrusted({...peer,pin:'00:'.repeat(31)+'00'},record),/identity/);
    hs.delete(record.id);await assert.rejects(client.connectTrusted(peer,record));assert.equal(client.channels.size,0);
  }finally{client.close();host.close();}
});
