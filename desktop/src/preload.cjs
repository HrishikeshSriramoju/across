'use strict';
const {contextBridge,ipcRenderer}=require('electron');
const allowed=new Set(['state','host','connect','connect-nearby','forget-device','refresh-discovery','renew-code','disconnect','enable-input','disable-input','release','pause','settings','shortcut-record-start','shortcut-record-end','copy-invite','send-file','cancel-files','layout','profile-save','profile-load','privacy']);
contextBridge.exposeInMainWorld('across',Object.freeze({
  act:(name,args)=>{if(!allowed.has(name))return Promise.reject(new Error('Unknown action'));return ipcRenderer.invoke('action',name,args);},
  onState:callback=>{const listener=(_event,value)=>callback(value);ipcRenderer.on('state',listener);return()=>ipcRenderer.removeListener('state',listener);}
}));
