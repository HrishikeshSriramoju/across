'use strict';
const fs=require('node:fs');
class TrustStore{
  constructor(file,cipher){this.file=file;this.cipher=cipher;this.records=new Map();if(fs.existsSync(file)){if(!cipher.isEncryptionAvailable())throw new Error('OS credential protection is unavailable; remembered pairing cannot be loaded.');const items=JSON.parse(cipher.decryptString(fs.readFileSync(file)));if(!Array.isArray(items)||items.length>100)throw new Error('Invalid trusted device store');for(const item of items)if(validRecord(item))this.records.set(item.id,item);}}
  get(id){return this.records.get(id);}
  values(){return [...this.records.values()];}
  persist(){if(!this.cipher.isEncryptionAvailable())throw new Error('OS credential protection is unavailable; cannot remember this device.');const data=this.cipher.encryptString(JSON.stringify(this.values())),temp=this.file+'.new';fs.writeFileSync(temp,data,{mode:0o600});fs.renameSync(temp,this.file);}
  put(record){if(!validRecord(record))throw new Error('Invalid device credential');if(this.records.size>=100&&!this.records.has(record.id))throw new Error('Too many remembered devices; forget an old device first.');const before=new Map(this.records);if(record.kind==='host')for(const [id,r] of this.records)if(r.kind==='host'&&r.pin===record.pin)this.records.delete(id);this.records.set(record.id,record);try{this.persist();}catch(e){this.records=before;throw e;}}
  delete(id){const before=new Map(this.records);this.records.delete(id);try{this.persist();}catch(e){this.records=before;throw e;}}
}
function validRecord(r){return r&&typeof r.id==='string'&&/^[a-f0-9-]{36}$/.test(r.id)&&['host','client'].includes(r.kind)&&typeof r.name==='string'&&r.name.length<=64&&typeof r.secret==='string'&&/^[a-f0-9]{64}$/.test(r.secret)&&(r.kind!=='host'||/^(?:[A-F0-9]{2}:){31}[A-F0-9]{2}$/.test(r.pin));}
module.exports={TrustStore,validRecord};
