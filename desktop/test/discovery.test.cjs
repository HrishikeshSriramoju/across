'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {targets,parseBeacon,Discovery}=require('../src/discovery.cjs');
const {Link}=require('../src/link.cjs');
const info={name:'Nearby Mac',platform:'darwin',bounds:{x:0,y:0,width:1920,height:1080},inputReady:false};
let identity;async function cert(){return identity??=await require('selfsigned').generate([{name:'commonName',value:'Across nearby test'}],{keySize:2048,algorithm:'sha256',days:1});}
test('discovery covers multicast and each interface subnet, excluding loopback',()=>{
  assert.deepEqual(targets({wifi:[{family:'IPv4',address:'192.168.7.4',netmask:'255.255.255.0',internal:false}],lan:[{family:'IPv4',address:'10.1.0.4',netmask:'255.255.0.0',internal:false}],lo:[{family:'IPv4',address:'127.0.0.1',netmask:'255.0.0.0',internal:true}]}),['255.255.255.255','239.255.45.77','192.168.7.255','10.1.255.255']);
});
test('only bounded, well formed discovery messages are accepted',()=>{
  const encode=o=>Buffer.from(JSON.stringify(o)),base={service:'across-v2',kind:'device',instance:'test',name:'Windows',platform:'win32',ready:false};
  assert.equal(parseBeacon(encode(base)).name,'Windows');
  assert.equal(parseBeacon(encode({...base,ready:true,port:45876,pin:'AA:'.repeat(31)+'AA'})).port,45876);
  for(const value of [{...base,ready:true},{...base,name:'x'.repeat(65)},{...base,platform:'unknown'},{...base,ready:true,port:99999,pin:'bad'}])assert.equal(parseBeacon(encode(value)),null);
  assert.equal(parseBeacon(Buffer.alloc(1501)),null);assert.equal(parseBeacon(Buffer.from('bad')),null);
});
test('announcement contains no invite or pairing secret',()=>{
  const d=new Discovery('instance',()=>({}),()=>({name:'Mac',platform:'darwin',ready:true,port:45876,pin:'AA:'.repeat(31)+'AA'}));let packet;d.send=m=>{packet=m;};d.announce('127.0.0.1');assert.equal(packet.kind,'device');assert.equal(packet.token,undefined);assert.equal(packet.pairingCode,undefined);assert.equal(packet.invite,undefined);
});
test('nearby code mutually authenticates TLS peers and still requires host approval',async()=>{
  const identity=await cert();let approvals=0;const host=new Link(identity,info,async()=>{approvals++;return true;}),client=new Link(identity,{...info,name:'Windows',platform:'win32'},async()=>true);
  try{const port=await host.listen(0,'127.0.0.1');const peer={host:'127.0.0.1',port,pin:new (require('node:crypto').X509Certificate)(identity.cert).fingerprint256};
    const code=host.pairingCode.match(/.{4}/g).join('-');await client.connectNearby(peer,code.toLowerCase());assert.equal(approvals,1);assert.equal(client.channels.size,1);assert.equal(host.channels.size,1);
  }finally{client.close();host.close();}
});
test('wrong nearby code, stale code, and declined requests never attach',async()=>{
  const identity=await cert();let approvals=0;const host=new Link(identity,info,async()=>{approvals++;return false;}),client=new Link(identity,info,async()=>true);
  try{const port=await host.listen(0,'127.0.0.1'),peer={host:'127.0.0.1',port,pin:new (require('node:crypto').X509Certificate)(identity.cert).fingerprint256};
    await assert.rejects(client.connectNearby(peer,'bad'),/16-character/);
    await assert.rejects(client.connectNearby(peer,'0'.repeat(16)));assert.equal(approvals,0);
    const old=host.pairingCode;host.refreshPairing();await assert.rejects(client.connectNearby(peer,old));assert.equal(approvals,0);
    await assert.rejects(client.connectNearby(peer,host.pairingCode));assert.equal(approvals,1);assert.equal(host.channels.size,0);
  }finally{client.close();host.close();}
});
test('forwarding a nearby proof over a different TLS connection cannot pair',async()=>{
  const tls=require('node:tls'),identity=await cert();let approvals=0;
  const host=new Link(identity,info,async()=>{approvals++;return true;}),client=new Link(identity,info,async()=>true),sockets=new Set();
  const proxy=tls.createServer({key:identity.private,cert:identity.cert,minVersion:'TLSv1.3',maxVersion:'TLSv1.3'},inbound=>{
    sockets.add(inbound);const outbound=tls.connect({host:'127.0.0.1',port:host.server.address().port,rejectUnauthorized:false,minVersion:'TLSv1.3',maxVersion:'TLSv1.3'});sockets.add(outbound);
    inbound.pipe(outbound).pipe(inbound);inbound.on('error',()=>outbound.destroy());outbound.on('error',()=>inbound.destroy());outbound.on('close',()=>inbound.destroy());inbound.on('close',()=>outbound.destroy());
  });
  try{await host.listen(0,'127.0.0.1');await new Promise(resolve=>proxy.listen(0,'127.0.0.1',resolve));
    await assert.rejects(client.connectNearby({host:'127.0.0.1',port:proxy.address().port,pin:new (require('node:crypto').X509Certificate)(identity.cert).fingerprint256},host.pairingCode));assert.equal(approvals,0);assert.equal(host.channels.size,0);
  }finally{client.close();host.close();for(const s of sockets)s.destroy();await new Promise(resolve=>proxy.close(resolve));}
});
test('nearby repeated guesses are capped before opening approval dialogs',async()=>{
  const identity=await cert();let approvals=0;const host=new Link(identity,info,async()=>{approvals++;return true;}),client=new Link(identity,info,async()=>true);
  try{const port=await host.listen(0,'127.0.0.1'),peer={host:'127.0.0.1',port,pin:new (require('node:crypto').X509Certificate)(identity.cert).fingerprint256};
    for(let i=0;i<5;i++)await assert.rejects(client.connectNearby(peer,'0'.repeat(16)));
    await assert.rejects(client.connectNearby(peer,host.pairingCode));assert.equal(approvals,0);assert.equal(host.channels.size,0);
  }finally{client.close();host.close();}
});
