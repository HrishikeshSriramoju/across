'use strict';

// Sharing belongs to the main process and native helper, not the visible window.
function showWindow(win){
  if(!win||win.isDestroyed())return;
  if(win.isMinimized())win.restore();
  win.show();win.focus();
}
function keepWindowInTray(win,{isQuitting,hasTray}){
  win.on('close',event=>{
    if(isQuitting())return;
    event.preventDefault();
    // Never hide the user's only way back into the app if tray creation failed.
    if(hasTray())win.hide();else showWindow(win);
  });
}
function powerPolicy(inputReady,connected,keepDisplayAwake){
  if(connected&&keepDisplayAwake)return 'prevent-display-sleep';
  return inputReady||connected?'prevent-app-suspension':null;
}
function trayImage(nativeImage){
  // NativeImage cannot decode SVG. Supply an original BGRA bitmap on every OS.
  const size=32,pixels=Buffer.alloc(size*size*4);
  const glyph=['0111000011111','1101100000011','1101100000111','1111100001101','1101100011001','1101100110000','1101101100000'];
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const i=(y*size+x)*4,inside=x>=2&&x<30&&y>=2&&y<30;
    const gx=Math.floor((x-3)/2),gy=Math.floor((y-9)/2);
    const ink=inside&&gx>=0&&gx<13&&gy>=0&&gy<7&&glyph[gy][gx]==='1';
    pixels[i]=ink?20:101;pixels[i+1]=ink?23:255;pixels[i+2]=ink?20:220;pixels[i+3]=inside?255:0;
  }
  const icon=nativeImage.createFromBitmap(pixels,{width:size,height:size,scaleFactor:1});
  if(icon.isEmpty())throw new Error('Could not create the Across tray icon');
  return icon;
}
module.exports={showWindow,keepWindowInTray,powerPolicy,trayImage};
