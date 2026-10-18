'use strict';
const dgram=require('node:dgram');
const {EventEmitter}=require('node:events');
const GROUP='239.255.45.77',PORT=45877;
const PIN=/^(?:[A-F0-9]{2}:){31}[A-F0-9]{2}$/;
function targets(interfaces){
  const result=new Set(['255.255.255.255',GROUP]);
  for(const v of Object.values(interfaces).flat())if(v&&v.family==='IPv4'&&!v.internal){
    const ip=v.address.split('.').map(Number),mask=v.netmask.split('.').map(Number);
    if(ip.length===4&&mask.length===4)result.add(ip.map((n,i)=>(n|(~mask[i]&255))).join('.'));
  }
  return [...result];
}
function parseBeacon(buf){
  if(buf.length>1500)return null;
  try{const m=JSON.parse(buf);if(m.service!=='across-v2'||!['probe','device'].includes(m.kind)||typeof m.instance!=='string'||m.instance.length>64)return null;
    if(m.kind==='probe')return m;
    if(typeof m.name!=='string'||!m.name.length||m.name.length>64||!['darwin','win32'].includes(m.platform)||typeof m.ready!=='boolean')return null;
    if((m.ready||m.hosting===true)&&(!Number.isInteger(m.port)||m.port<1024||m.port>65535||!PIN.test(m.pin)))return null;
    return m;
  }catch{return null;}
}
class Discovery extends EventEmitter{
  constructor(instance,interfaces,describe){super();this.instance=instance;this.interfaces=interfaces;this.describe=describe;this.peers=new Map();this.lastReply=0;}
  start(){
    const socket=this.socket=dgram.createSocket({type:'udp4',reuseAddr:true});
    socket.on('error',e=>{this.emit('fault',e);this.close();});
    socket.on('message',(buf,r)=>{const m=parseBeacon(buf);if(!m||m.instance===this.instance)return;
      if(m.kind==='probe'){if(Date.now()-this.lastReply>250){this.lastReply=Date.now();this.announce(r.address,r.port);}return;}
      const id=m.instance+'@'+r.address;
      if(!this.peers.has(id)&&this.peers.size>=200)return;
      this.peers.set(id,{id,name:m.name,platform:m.platform,host:r.address,port:m.port,pin:m.pin,hosting:m.hosting===true,ready:m.ready,seen:Date.now()});this.emit('change');
    });
    socket.bind(PORT,()=>{if(this.socket!==socket)return;this.bound=true;socket.setBroadcast(true);socket.setMulticastTTL(1);
      for(const v of Object.values(this.interfaces()).flat())if(v&&v.family==='IPv4'&&!v.internal)try{socket.addMembership(GROUP,v.address);}catch{}
      this.refresh();this.timer=setInterval(()=>{this.announce();let changed=false;for(const [id,p] of this.peers)if(Date.now()-p.seen>12000){this.peers.delete(id);changed=true;}if(changed)this.emit('change');},2000);
    });
  }
  send(value,host,port=PORT){if(!this.bound||!this.socket)return;const data=Buffer.from(JSON.stringify(value));this.socket.send(data,port,host,()=>{});}
  announce(host,port){const m={service:'across-v2',kind:'device',instance:this.instance,...this.describe()};for(const address of host?[host]:targets(this.interfaces()))this.send(m,address,port);}
  refresh(){for(const host of targets(this.interfaces()))this.send({service:'across-v2',kind:'probe',instance:this.instance},host);this.announce();}
  close(){clearInterval(this.timer);this.bound=false;const s=this.socket;this.socket=null;if(s)try{s.close();}catch{}}
}
module.exports={Discovery,targets,parseBeacon};
