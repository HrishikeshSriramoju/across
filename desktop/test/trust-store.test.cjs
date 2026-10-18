'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {TrustStore}=require('../src/trust-store.cjs');
function testCipher(){const key=crypto.randomBytes(32);return{isEncryptionAvailable:()=>true,encryptString:s=>{const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',key,iv),body=Buffer.concat([c.update(s,'utf8'),c.final()]);return Buffer.concat([iv,c.getAuthTag(),body]);},decryptString:b=>{const c=crypto.createDecipheriv('aes-256-gcm',key,b.subarray(0,12));c.setAuthTag(b.subarray(12,28));return Buffer.concat([c.update(b.subarray(28)),c.final()]).toString();}};}
test('remembered store persists via OS cipher adapter and forget survives reopening',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'across-trust-test-')),file=path.join(dir,'trusted.enc'),cipher=testCipher(),record={id:crypto.randomUUID(),kind:'host',name:'PC',secret:crypto.randomBytes(32).toString('hex'),pin:'AA:'.repeat(31)+'AA'};
  try{const first=new TrustStore(file,cipher);first.put(record);assert.equal(fs.readFileSync(file).includes(Buffer.from(record.secret)),false);const reopened=new TrustStore(file,cipher);assert.deepEqual(reopened.get(record.id),record);reopened.delete(record.id);assert.equal(new TrustStore(file,cipher).values().length,0);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('no plaintext fallback if OS credential protection is unavailable',()=>{
  const store=new TrustStore('/nonexistent/across-test-credentials',{isEncryptionAvailable:()=>false});assert.throws(()=>store.put({id:crypto.randomUUID(),kind:'client',name:'PC',secret:'a'.repeat(64)}),/protection/);assert.equal(store.values().length,0);
});
