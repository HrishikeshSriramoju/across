'use strict';
const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
function validRect(r){return r&&['x','y','width','height'].every(k=>Number.isFinite(r[k]))&&r.width>=100&&r.width<=40000&&r.height>=100&&r.height<=40000;}
function route(rects,current,p,delta,locked=false){
  const r=rects[current]; if(!r)return null;
  const x=p.x+delta.dx,y=p.y+delta.dy;
  if(!locked){
    // Only adjoining displays can hand off. Gaps stay solid, preventing accidental jumps.
    for(const [id,n] of Object.entries(rects)){
      if(id===current)continue;
      const gx=r.x+x,gy=r.y+y;
      if((x>=r.width&&delta.dx>0&&Math.abs(n.x-r.x-r.width)<=8&&gy>=n.y&&gy<n.y+n.height)||
         (x<0&&delta.dx<0&&Math.abs(n.x+n.width-r.x)<=8&&gy>=n.y&&gy<n.y+n.height)||
         (y>=r.height&&delta.dy>0&&Math.abs(n.y-r.y-r.height)<=8&&gx>=n.x&&gx<n.x+n.width)||
         (y<0&&delta.dy<0&&Math.abs(n.y+n.height-r.y)<=8&&gx>=n.x&&gx<n.x+n.width))
        return {id,x:clamp(gx-n.x,2,n.width-3),y:clamp(gy-n.y,2,n.height-3)};
    }
  }
  return {id:current,x:clamp(x,0,r.width-1),y:clamp(y,0,r.height-1)};
}
function snap(r,others){
  const out={...r};
  let best=120,choice=null;
  for(const n of others){
    const candidates=[{axis:'x',value:n.x+n.width,gap:Math.abs(r.x-n.x-n.width)},
      {axis:'x',value:n.x-r.width,gap:Math.abs(r.x+r.width-n.x)},
      {axis:'y',value:n.y+n.height,gap:Math.abs(r.y-n.y-n.height)},
      {axis:'y',value:n.y-r.height,gap:Math.abs(r.y+r.height-n.y)}];
    for(const c of candidates)if(c.gap<best){best=c.gap;choice=c;}
  }
  if(choice)out[choice.axis]=choice.value;
  return out;
}
module.exports={route,snap,validRect,clamp};
