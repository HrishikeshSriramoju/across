'use strict';
const tls=require('node:tls');
const crypto=require('node:crypto');
const {EventEmitter}=require('node:events');
const MAX_FRAME=1024*1024;
function normalizeCode(s){return typeof s==='string'?s.replace(/[\s-]/g,'').toUpperCase():'';}
function pairingProof(code,socket,nonce,side){return crypto.createHmac('sha256',normalizeCode(code)).update(socket.exportKeyingMaterial(32,'across-nearby-v1')).update(nonce).update(side).digest('hex');}
function safeEqual(a,b){if(typeof a!=='string'||typeof b!=='string')return false;const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&crypto.timingSafeEqual(x,y);}
function parseInvite(s){
  if(typeof s!=='string'||s.length>4096)throw new Error('Invalid pairing invite');
  const v=JSON.parse(Buffer.from(s.replace(/^across:\/\//,''),'base64url').toString());
  if(v.v!==1||typeof v.host!=='string'||v.host.length>253||!Number.isInteger(v.port)||v.port<1024||v.port>65535||!/^[A-F0-9:]{95}$/.test(v.pin)||!/^[a-f0-9]{64}$/.test(v.token)||v.exp<Date.now())throw new Error('Pairing invite is invalid or expired');
  return v;
}
class Channel extends EventEmitter{
  constructor(socket){super();this.socket=socket;this.buffer='';this.closed=false;socket.setEncoding('utf8');socket.setNoDelay(true);socket.on('data',s=>this.read(s));socket.on('error',e=>this.emit('fault',e));socket.on('close',()=>{this.closed=true;this.emit('close');});}
  read(s){this.buffer+=s;if(this.buffer.length>MAX_FRAME*2)return this.destroy();let i;while((i=this.buffer.indexOf('\n'))>=0){const line=this.buffer.slice(0,i);this.buffer=this.buffer.slice(i+1);if(line.length>MAX_FRAME)return this.destroy();try{const m=JSON.parse(line);if(!m||typeof m!=='object'||Array.isArray(m))return this.destroy();this.emit('message',m);}catch{return this.destroy();}}}
  send(m){if(this.closed||this.socket.destroyed)return false;const s=JSON.stringify(m)+'\n';if(s.length>MAX_FRAME)throw new Error('Message exceeds protocol limit');return this.socket.write(s);}
  async sendWait(m){if(this.send(m))return;if(this.closed)throw new Error('Connection closed');await new Promise((resolve,reject)=>{const done=()=>{cleanup();resolve();},fail=()=>{cleanup();reject(new Error('Connection closed'));},cleanup=()=>{this.socket.off('drain',done);this.socket.off('close',fail);};this.socket.once('drain',done);this.socket.once('close',fail);});}
  destroy(){this.socket.destroy();}
}
class Link extends EventEmitter{
  constructor(identity,metadata,approve,trust=null){super();this.identity=identity;this.metadata=metadata;this.approve=approve;this.trust=trust;this.channels=new Map();this.pendingSockets=new Set();this.server=null;this.invite=null;}
  async listen(port=45876,host='0.0.0.0'){
    if(this.server)throw new Error('Already hosting');
    this.refreshPairing();this.nearbyAttempts=new Map();
    this.server=tls.createServer({key:this.identity.private,cert:this.identity.cert,minVersion:'TLSv1.3',maxVersion:'TLSv1.3',handshakeTimeout:5000},socket=>{
      if(this.channels.size>=10||this.pendingSockets.size>=20){socket.destroy();return;}
      this.pendingSockets.add(socket);socket.once('close',()=>this.pendingSockets.delete(socket));
      const c=new Channel(socket);c.on('fault',()=>{});let auth=false,pending=false;const timer=setTimeout(()=>c.destroy(),120000);
      c.on('close',()=>clearTimeout(timer));
      c.on('message',async m=>{
        if(auth)return;
        if(pending||m.type!=='auth'){c.destroy();return;}
        const nearby=m.mode==='nearby',remembered=m.mode==='trusted',credential=remembered?this.trust?.get(m.trustId):null;
        if(!remembered&&Date.now()>this.expires){c.destroy();return;}
        if(nearby||remembered){
          const address=socket.remoteAddress,now=Date.now();
          for(const [key,value] of this.nearbyAttempts)if(now-value.at>60000)this.nearbyAttempts.delete(key);
          const attempt=this.nearbyAttempts.get(address)||{count:0,at:now};
          if(attempt.count>=5||this.nearbyAttempts.size>=100){c.destroy();return;}
          attempt.count++;this.nearbyAttempts.set(address,attempt);
          const secret=remembered?(credential?.kind==='client'?credential.secret:null):this.pairingCode;
          if(!secret||typeof m.nonce!=='string'||!/^[a-f0-9]{32}$/.test(m.nonce)||!safeEqual(m.proof,pairingProof(secret,socket,m.nonce,'client'))){c.destroy();return;}
        }else if(!safeEqual(m.token,this.token)){c.destroy();return;}
        pending=true;
        if(!validMetadata(m.info)){c.destroy();return;}
        try{
          if(!remembered&&!await this.approve(m.info,socket.remoteAddress)){c.destroy();return;}
          if(socket.destroyed||this.channels.size>=10){c.destroy();return;}
          let offer;if(!remembered&&m.remember===true&&this.trust){offer={id:crypto.randomUUID(),secret:crypto.randomBytes(32).toString('hex')};this.trust.put({...offer,kind:'client',name:m.info.name});}
          auth=true;clearTimeout(timer);const id=crypto.randomUUID();c.id=id;c.info=m.info;c.trustId=remembered?credential.id:offer?.id;c.send({type:'welcome',info:this.metadata,id,...(nearby||remembered?{proof:pairingProof(remembered?credential.secret:this.pairingCode,socket,m.nonce,'host')}:{}) ,...(offer?{remember:offer}:{})});this.attach(c);
        }catch{c.destroy();}
      });
    });
    this.server.on('tlsClientError',()=>{});
    await new Promise((resolve,reject)=>{this.server.once('error',reject);this.server.listen(port,host,()=>{this.server.off('error',reject);resolve();});});
    this.server.on('error',e=>this.emit('fault',e));return this.server.address().port;
  }
  createInvite(host,port){return 'across://'+Buffer.from(JSON.stringify({v:1,host,port,pin:new crypto.X509Certificate(this.identity.cert).fingerprint256,token:this.token,exp:this.expires})).toString('base64url');}
  refreshPairing(){this.token=crypto.randomBytes(32).toString('hex');this.pairingCode=crypto.randomBytes(8).toString('hex').toUpperCase();this.expires=Date.now()+10*60*1000;}
  async connectNearby(peer,code){
    code=normalizeCode(code);if(!/^[A-F0-9]{16}$/.test(code))throw new Error('Enter the 16-character code shown on the hosting computer.');
    if(!peer||typeof peer.host!=='string'||!Number.isInteger(peer.port)||peer.port<1024||peer.port>65535||!/^(?:[A-F0-9]{2}:){31}[A-F0-9]{2}$/.test(peer.pin))throw new Error('Refresh nearby computers and try again.');
    return this.connect(null,{...peer,code});
  }
  async connectTrusted(peer,credential){if(credential?.kind!=='host'||credential.pin!==peer?.pin)throw new Error('Remembered host identity does not match');return this.connect(null,{...peer,pin:credential.pin,code:credential.secret,trustId:credential.id,trusted:true});}
  async connect(invite,nearby=null){
    const v=nearby||parseInvite(invite);
    return new Promise((resolve,reject)=>{
      const socket=tls.connect({host:v.host,port:v.port,minVersion:'TLSv1.3',maxVersion:'TLSv1.3',rejectUnauthorized:false});
      this.pendingSockets.add(socket);socket.once('close',()=>this.pendingSockets.delete(socket));
      const nonce=crypto.randomBytes(16).toString('hex');let timeout;
      const c=new Channel(socket);timeout=setTimeout(()=>{c.destroy();reject(new Error('Cannot reach this computer. Check same Wi-Fi, Local Network permission, and Windows Private-network firewall access.'));},10000);
      c.on('fault',e=>{clearTimeout(timeout);reject(e);});c.once('close',()=>{clearTimeout(timeout);reject(new Error('Connection closed before pairing'));});
      socket.once('secureConnect',()=>{
        // Self-signed identities are checked against the out-of-band invite before any secret is sent.
        if(!safeEqual(socket.getPeerCertificate().fingerprint256,v.pin)){clearTimeout(timeout);c.destroy();reject(new Error('Host certificate does not match your invite'));return;}
        clearTimeout(timeout);timeout=setTimeout(()=>{c.destroy();reject(new Error('The host did not approve within two minutes. Check Across on the hosting computer.'));},120000);
        c.send(nearby?{type:'auth',mode:v.trusted?'trusted':'nearby',trustId:v.trustId,nonce,proof:pairingProof(v.code,socket,nonce,'client'),remember:!!this.trust,info:this.metadata}:{type:'auth',token:v.token,remember:!!this.trust,info:this.metadata});
      });
      c.on('message',function welcome(m){if(m.type!=='welcome'||!validMetadata(m.info))return;if(nearby&&!safeEqual(m.proof,pairingProof(v.code,socket,nonce,'host'))){clearTimeout(timeout);c.destroy();reject(new Error('Host could not verify the pairing code.'));return;}c.off('message',welcome);clearTimeout(timeout);try{if(m.remember&&this.trust)this.trust.put({...m.remember,kind:'host',name:m.info.name,pin:v.pin});}catch(e){c.destroy();reject(e);return;}c.id='host';c.info=m.info;c.trustId=v.trustId||m.remember?.id;this.attach(c);resolve(c);}.bind(this));
    });
  }
  attach(c){this.pendingSockets.delete(c.socket);this.channels.set(c.id,c);c.on('message',m=>this.emit('message',c,m));c.on('close',()=>{this.channels.delete(c.id);this.emit('disconnected',c);});c.on('fault',e=>this.emit('fault',e));this.emit('connected',c);}
  close(){for(const s of this.pendingSockets)s.destroy();this.pendingSockets.clear();for(const c of this.channels.values())c.destroy();this.channels.clear();if(this.server){this.server.close();this.server=null;}this.token=null;this.pairingCode=null;}
}
function validMetadata(v){return v&&typeof v.name==='string'&&v.name.length<=64&&['darwin','win32'].includes(v.platform)&&v.bounds&&['x','y','width','height'].every(k=>Number.isFinite(v.bounds[k]))&&v.bounds.width>=100&&v.bounds.width<=40000&&v.bounds.height>=100&&v.bounds.height<=40000;}
module.exports={Link,Channel,parseInvite,safeEqual,validMetadata,MAX_FRAME};
