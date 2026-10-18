// Maske çizim WebView HTML'i (FotoTemizleModal + MaskeCizModal ortak kullanır — döngüsel import olmasın diye ayrı dosya).
// '__IMG__' çalışma anında görsel URL'si ile değiştirilir.
export const DRAW_HTML = `<!DOCTYPE html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no"/>
<style>
*{margin:0;padding:0;box-sizing:border-box;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}
html,body{width:100%;height:100%;background:#000;overflow:hidden}
#wrap{width:100%;height:100%;display:flex;align-items:center;justify-content:center;overflow:hidden}
#c{display:block;max-width:100%;max-height:100%;touch-action:none;transform-origin:0 0}
</style></head><body>
<div id="wrap"><canvas id="c"></canvas></div>
<script>
var img=new Image();
var canvas=document.getElementById('c'), ctx=canvas.getContext('2d');
var shapes=[], cur=null, tool='rect', brush=32, W=0, H=0, started=false;
var zoomMode=false, view={s:1,tx:0,ty:0}, pinch=null, panLast=null;
function post(o){ if(window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(o)); }
function applyView(){ canvas.style.transform='translate('+view.tx+'px,'+view.ty+'px) scale('+view.s+')'; }
img.onload=function(){
  W=img.naturalWidth; H=img.naturalHeight;
  canvas.width=W; canvas.height=H;
  render(); post({type:'ready'});
};
img.onerror=function(){ post({type:'imgerror'}); };
img.src='__IMG__';
function drawShape(c,s,disp){
  if(s.t==='rect'){
    if(disp){ c.fillStyle='rgba(229,57,53,0.45)'; c.fillRect(s.x,s.y,s.w,s.h); c.strokeStyle='#E53935'; c.lineWidth=Math.max(2,W/400); c.strokeRect(s.x,s.y,s.w,s.h); }
    else { c.fillStyle='#fff'; c.fillRect(s.x,s.y,s.w,s.h); }
  } else {
    c.save();
    if(s.erase){ c.globalCompositeOperation='destination-out'; }
    c.strokeStyle=disp?'rgba(229,57,53,0.45)':'#fff'; c.fillStyle=disp?'rgba(229,57,53,0.45)':'#fff';
    c.lineWidth=s.size; c.lineCap='round'; c.lineJoin='round';
    c.beginPath();
    for(var i=0;i<s.pts.length;i++){ var p=s.pts[i]; if(i) c.lineTo(p.x,p.y); else c.moveTo(p.x,p.y); }
    if(s.pts.length===1){ c.arc(s.pts[0].x,s.pts[0].y,s.size/2,0,7); c.fill(); } else c.stroke();
    c.restore();
  }
}
function render(){
  ctx.clearRect(0,0,W,H);
  if(img.complete) ctx.drawImage(img,0,0,W,H);
  var all=shapes.slice(); if(cur) all.push(cur);
  for(var i=0;i<all.length;i++) drawShape(ctx,all[i],true);
}
function pos(e){
  var r=canvas.getBoundingClientRect();
  var t=e.touches&&e.touches[0]?e.touches[0]:e;
  return { x:(t.clientX-r.left)*(W/r.width), y:(t.clientY-r.top)*(H/r.height) };
}
function down(e){ e.preventDefault(); var p=pos(e);
  if(tool==='rect') cur={t:'rect',x:p.x,y:p.y,w:0,h:0,sx:p.x,sy:p.y};
  else cur={t:'brush',size:brush,erase:tool==='eraser',pts:[p]};
  render();
}
function move(e){ if(!cur) return; e.preventDefault(); var p=pos(e);
  if(cur.t==='rect'){ cur.x=Math.min(cur.sx,p.x); cur.y=Math.min(cur.sy,p.y); cur.w=Math.abs(p.x-cur.sx); cur.h=Math.abs(p.y-cur.sy); }
  else cur.pts.push(p);
  render();
}
function up(){ if(!cur) return; var s=cur; cur=null;
  if(s.t==='rect'&&(s.w<4||s.h<4)){ render(); return; }
  shapes.push(s); render(); post({type:'count',n:shapes.length});
}
function dist(a,b){ var dx=a.clientX-b.clientX, dy=a.clientY-b.clientY; return Math.hypot(dx,dy); }
function mid(a,b){ return { x:(a.clientX+b.clientX)/2, y:(a.clientY+b.clientY)/2 }; }
function tstart(e){
  if(e.touches.length>=2){ e.preventDefault(); if(cur){ cur=null; render(); }
    var m=mid(e.touches[0],e.touches[1]); pinch={d:dist(e.touches[0],e.touches[1]),cx:m.x,cy:m.y}; panLast=null; return; }
  if(zoomMode){ e.preventDefault(); panLast={x:e.touches[0].clientX,y:e.touches[0].clientY}; return; }
  down(e);
}
function tmove(e){
  if(pinch && e.touches.length>=2){ e.preventDefault();
    var a=e.touches[0], b=e.touches[1], nd=dist(a,b), m=mid(a,b);
    var r=canvas.getBoundingClientRect();
    var ns=Math.max(1,Math.min(8,view.s*(nd/pinch.d))), f=ns/view.s;
    view.tx+=(m.x-r.left)*(1-f); view.ty+=(m.y-r.top)*(1-f); view.s=ns;
    view.tx+=(m.x-pinch.cx); view.ty+=(m.y-pinch.cy);
    if(view.s<=1){ view.tx=0; view.ty=0; }
    applyView(); pinch.d=nd; pinch.cx=m.x; pinch.cy=m.y; return; }
  if(panLast && zoomMode){ e.preventDefault(); var t=e.touches[0];
    view.tx+=t.clientX-panLast.x; view.ty+=t.clientY-panLast.y;
    if(view.s<=1){ view.tx=0; view.ty=0; }
    applyView(); panLast={x:t.clientX,y:t.clientY}; return; }
  move(e);
}
function tend(e){
  if(pinch){ if(e.touches.length<2){ pinch=null; panLast=null; } return; }
  if(panLast){ if(e.touches.length===0) panLast=null; return; }
  up();
}
canvas.addEventListener('touchstart',tstart,{passive:false});
canvas.addEventListener('touchmove',tmove,{passive:false});
canvas.addEventListener('touchend',tend,{passive:false});
canvas.addEventListener('mousedown',down); canvas.addEventListener('mousemove',move); window.addEventListener('mouseup',up);
window.setTool=function(t){ tool=t; };
window.setBrush=function(n){ brush=n; };
window.setZoomMode=function(b){ zoomMode=!!b; };
window.undo=function(){ shapes.pop(); render(); post({type:'count',n:shapes.length}); };
window.clearAll=function(){ shapes=[]; render(); post({type:'count',n:0}); };
window.exportMask=function(){
  if(!shapes.length){ post({type:'empty'}); return; }
  var m=document.createElement('canvas'); m.width=W; m.height=H; var mc=m.getContext('2d');
  mc.fillStyle='#000'; mc.fillRect(0,0,W,H);
  for(var i=0;i<shapes.length;i++) drawShape(mc,shapes[i],false);
  post({type:'mask',data:m.toDataURL('image/png')});
};
</script></body></html>`;
