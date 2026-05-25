import { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, Modal, Alert,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import { WebView } from 'react-native-webview';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import R2Image from './R2Image';
import { getCachedPhoto } from '../lib/photoCache';
import { Colors } from '../constants/theme';
import type { Ilan } from '../types';

const TEMPLATES = [
  { id: 't1_3', name: '1 büyük + 3', count: 4 },
  { id: 't3x2', name: '3×2', count: 6 },
  { id: 't232', name: '2+3+2', count: 7 },
  { id: 't4x2', name: '4×2', count: 8 },
] as const;

const HTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no"/>
<style>
*{margin:0;padding:0;box-sizing:border-box;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}
html,body{width:100%;height:100%;background:#000;overflow:hidden}
#wrap{width:100%;height:100%;display:flex;align-items:center;justify-content:center}
canvas{display:block;max-width:100%;max-height:100%;touch-action:none}
</style>
</head>
<body>
<div id="wrap"><canvas id="c"></canvas></div>
<script>
var W=1333,H=1999,GAP=16,PAD=16;
var canvas=document.getElementById('c');
canvas.width=W; canvas.height=H;
var ctx=canvas.getContext('2d');

function gridT(rows,cols){
  var sw=(W-PAD*2-GAP*(cols-1))/cols;
  var sh=(H-PAD*2-GAP*(rows-1))/rows;
  var s=[];
  for(var r=0;r<rows;r++) for(var c=0;c<cols;c++){
    s.push({x:PAD+c*(sw+GAP),y:PAD+r*(sh+GAP),w:sw,h:sh});
  }
  return s;
}
function tBigTop(){
  var topH=(H-PAD*2-GAP)*0.45;
  var botH=H-PAD*2-GAP-topH;
  var halfW=(W-PAD*2-GAP)/2;
  var rH=(botH-GAP)/2;
  return [
    {x:PAD,y:PAD,w:W-PAD*2,h:topH},
    {x:PAD,y:PAD+topH+GAP,w:halfW,h:botH},
    {x:PAD+halfW+GAP,y:PAD+topH+GAP,w:halfW,h:rH},
    {x:PAD+halfW+GAP,y:PAD+topH+GAP+rH+GAP,w:halfW,h:rH}
  ];
}
function t232(){
  var rH=(H-PAD*2-GAP*2)/3;
  var w2=(W-PAD*2-GAP)/2;
  var w3=(W-PAD*2-GAP*2)/3;
  var y1=PAD,y2=PAD+rH+GAP,y3=PAD+(rH+GAP)*2;
  return [
    {x:PAD,y:y1,w:w2,h:rH},{x:PAD+w2+GAP,y:y1,w:w2,h:rH},
    {x:PAD,y:y2,w:w3,h:rH},{x:PAD+w3+GAP,y:y2,w:w3,h:rH},{x:PAD+(w3+GAP)*2,y:y2,w:w3,h:rH},
    {x:PAD,y:y3,w:w2,h:rH},{x:PAD+w2+GAP,y:y3,w:w2,h:rH}
  ];
}
var TPL={ t1_3:tBigTop(), t3x2:gridT(3,2), t232:t232(), t4x2:gridT(4,2) };

var state={ tpl:'t1_3', slots:[], aktif:0 };
var imgs={};

function curSlots(){ return TPL[state.tpl]; }

function loadImg(src){
  return new Promise(function(res,rej){
    if(imgs[src]){ res(imgs[src]); return; }
    var im=new Image();
    im.onload=function(){ imgs[src]=im; res(im); };
    im.onerror=function(){ rej(new Error('img')); };
    im.src=src;
  });
}

function coverBase(img,slot){
  var sr=slot.w/slot.h, ir=img.width/img.height;
  if(ir>sr) return { baseSw: img.height*sr, baseSh: img.height };
  return { baseSw: img.width, baseSh: img.width/sr };
}

function drawSlot(slot,sd){
  if(!sd || !sd.src){
    ctx.fillStyle='#1f2937'; ctx.fillRect(slot.x,slot.y,slot.w,slot.h);
    return;
  }
  var img=imgs[sd.src]; if(!img) return;
  var b=coverBase(img,slot);
  var z=Math.max(1,sd.zoom||1);
  var sw=b.baseSw/z, sh=b.baseSh/z;
  var ox=Math.max(0,Math.min(1,sd.ox==null?0.5:sd.ox));
  var oy=Math.max(0,Math.min(1,sd.oy==null?0.5:sd.oy));
  var sx=(img.width-sw)*ox, sy=(img.height-sh)*oy;
  ctx.drawImage(img,sx,sy,sw,sh,slot.x,slot.y,slot.w,slot.h);
}

function draw(){
  ctx.fillStyle='#000'; ctx.fillRect(0,0,W,H);
  var slots=curSlots();
  for(var i=0;i<slots.length;i++){
    drawSlot(slots[i], state.slots[i]);
  }
  // active slot highlight
  var act=slots[state.aktif];
  if(act){
    ctx.save();
    ctx.strokeStyle='#E53935'; ctx.lineWidth=6;
    ctx.strokeRect(act.x+3,act.y+3,act.w-6,act.h-6);
    ctx.restore();
  }
}

function ensureSlots(n){
  while(state.slots.length<n) state.slots.push({src:null,zoom:1,ox:0.5,oy:0.5});
  state.slots.length=n;
}

function postReady(){
  if(window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify({type:'ready'}));
}

window.setTpl=function(tplId){
  state.tpl=tplId;
  state.slots=[]; ensureSlots(TPL[tplId].length);
  state.aktif=0;
  draw();
};

window.setActive=function(i){ state.aktif=i; draw(); };

window.setSlotPhoto=function(i,src){
  ensureSlots(curSlots().length);
  state.slots[i]={src:src,zoom:1,ox:0.5,oy:0.5};
  loadImg(src).then(draw).catch(function(){});
  // auto-advance
  var slots=curSlots();
  for(var k=i+1;k<slots.length;k++){ if(!state.slots[k].src){ state.aktif=k; break; } }
  draw();
  if(window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify({type:'aktif',idx:state.aktif}));
};

window.zoomDelta=function(d){
  var s=state.slots[state.aktif]; if(!s||!s.src) return;
  s.zoom=Math.max(1,Math.min(5,(s.zoom||1)+d));
  draw();
};
window.panDelta=function(dx,dy){
  var s=state.slots[state.aktif]; if(!s||!s.src) return;
  s.ox=Math.max(0,Math.min(1,(s.ox==null?0.5:s.ox)+dx));
  s.oy=Math.max(0,Math.min(1,(s.oy==null?0.5:s.oy)+dy));
  draw();
};
window.resetSlot=function(){
  var s=state.slots[state.aktif]; if(!s||!s.src) return;
  s.zoom=1; s.ox=0.5; s.oy=0.5; draw();
};

window.exportPng=function(){
  try{
    var prev=state.aktif; state.aktif=-1; draw();
    var d=canvas.toDataURL('image/png');
    state.aktif=prev; draw();
    window.ReactNativeWebView.postMessage(JSON.stringify({type:'png',data:d}));
  }catch(e){
    window.ReactNativeWebView.postMessage(JSON.stringify({type:'error',message:String(e)}));
  }
};

// touch drag inside canvas
var drag=null;
function canvasPt(t){
  var rect=canvas.getBoundingClientRect();
  return { x:((t.clientX-rect.left)/rect.width)*W, y:((t.clientY-rect.top)/rect.height)*H, rect:rect };
}
function slotAt(x,y){
  var slots=curSlots();
  for(var i=0;i<slots.length;i++){
    var s=slots[i];
    if(x>=s.x&&x<=s.x+s.w&&y>=s.y&&y<=s.y+s.h) return i;
  }
  return -1;
}
function pinchDist(ts){
  var dx=ts[0].clientX-ts[1].clientX, dy=ts[0].clientY-ts[1].clientY;
  return Math.sqrt(dx*dx+dy*dy);
}

canvas.addEventListener('touchstart',function(e){
  if(e.touches.length===2){
    drag={ type:'pinch', startDist:pinchDist(e.touches), startZoom:(state.slots[state.aktif]||{}).zoom||1 };
    e.preventDefault();
    return;
  }
  var p=canvasPt(e.touches[0]);
  var idx=slotAt(p.x,p.y);
  if(idx===-1) return;
  state.aktif=idx;
  var s=state.slots[idx];
  if(!s||!s.src){ draw(); if(window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify({type:'aktif',idx:idx})); return; }
  var img=imgs[s.src]; if(!img){ draw(); return; }
  var slot=curSlots()[idx];
  var b=coverBase(img,slot);
  var z=Math.max(1,s.zoom||1);
  var sw=b.baseSw/z, sh=b.baseSh/z;
  drag={ type:'pan', idx:idx, startX:e.touches[0].clientX, startY:e.touches[0].clientY,
    startOx:s.ox==null?0.5:s.ox, startOy:s.oy==null?0.5:s.oy,
    rangeX:(img.width-sw)*(slot.w/sw)*(p.rect.width/W),
    rangeY:(img.height-sh)*(slot.h/sh)*(p.rect.height/H) };
  draw();
  if(window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify({type:'aktif',idx:idx}));
  e.preventDefault();
},{passive:false});

canvas.addEventListener('touchmove',function(e){
  if(!drag) return;
  if(drag.type==='pinch' && e.touches.length===2){
    var d=pinchDist(e.touches);
    var nz=Math.max(1,Math.min(5,drag.startZoom*(d/drag.startDist)));
    var s=state.slots[state.aktif]; if(s&&s.src){ s.zoom=nz; draw(); }
    e.preventDefault();
    return;
  }
  if(drag.type==='pan'){
    var dx=e.touches[0].clientX-drag.startX;
    var dy=e.touches[0].clientY-drag.startY;
    var s=state.slots[drag.idx];
    if(drag.rangeX>0) s.ox=Math.max(0,Math.min(1,drag.startOx - dx/drag.rangeX));
    if(drag.rangeY>0) s.oy=Math.max(0,Math.min(1,drag.startOy - dy/drag.rangeY));
    draw();
    e.preventDefault();
  }
},{passive:false});

canvas.addEventListener('touchend',function(){ drag=null; });
canvas.addEventListener('touchcancel',function(){ drag=null; });

ensureSlots(TPL[state.tpl].length);
draw();
postReady();
</script>
</body>
</html>`;

interface Props {
  ilan: Ilan;
  visible: boolean;
  onClose: () => void;
}

export default function KolajModal({ ilan, visible, onClose }: Props) {
  const fotos = ilan.fotograflar ?? [];
  const [tplIdx, setTplIdx] = useState(0);
  const [aktifSlot, setAktifSlot] = useState(0);
  const [secimler, setSecimler] = useState<(string | null)[]>([]);
  const [fotoBase64, setFotoBase64] = useState<Map<string, string>>(new Map());
  const [yukluyor, setYukluyor] = useState(false);
  const [hazir, setHazir] = useState(false);
  const [indiriliyor, setIndiriliyor] = useState(false);
  const webviewRef = useRef<WebView>(null);

  const tpl = TEMPLATES[tplIdx];

  useEffect(() => {
    setSecimler(Array(tpl.count).fill(null));
    setAktifSlot(0);
    if (hazir) webviewRef.current?.injectJavaScript(`window.setTpl(${JSON.stringify(tpl.id)}); true;`);
  }, [tplIdx, hazir]);

  async function fotoSec(fotoKey: string) {
    let dataUrl = fotoBase64.get(fotoKey);
    if (!dataUrl) {
      setYukluyor(true);
      try {
        const localPath = await getCachedPhoto(fotoKey, 'lg');
        const b64 = await FileSystem.readAsStringAsync(localPath, { encoding: FileSystem.EncodingType.Base64 });
        dataUrl = `data:image/jpeg;base64,${b64}`;
        setFotoBase64(prev => { const m = new Map(prev); m.set(fotoKey, dataUrl!); return m; });
      } catch (e: any) {
        setYukluyor(false);
        Alert.alert('Hata', 'Fotoğraf yüklenemedi: ' + (e?.message ?? ''));
        return;
      }
      setYukluyor(false);
    }
    const idx = aktifSlot;
    setSecimler(prev => {
      const next = [...prev];
      next[idx] = fotoKey;
      return next;
    });
    const js = `window.setSlotPhoto(${idx}, ${JSON.stringify(dataUrl)}); true;`;
    webviewRef.current?.injectJavaScript(js);
  }

  function slotSec(idx: number) {
    setAktifSlot(idx);
    webviewRef.current?.injectJavaScript(`window.setActive(${idx}); true;`);
  }

  function onMessage(e: any) {
    try {
      const msg = JSON.parse(e.nativeEvent.data);
      if (msg.type === 'ready') {
        setHazir(true);
        webviewRef.current?.injectJavaScript(`window.setTpl(${JSON.stringify(tpl.id)}); true;`);
      } else if (msg.type === 'aktif') {
        setAktifSlot(msg.idx);
      } else if (msg.type === 'png') {
        savePng(msg.data);
      } else if (msg.type === 'error') {
        setIndiriliyor(false);
        Alert.alert('Hata', msg.message);
      }
    } catch {}
  }

  async function savePng(dataUrl: string) {
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('İzin Gerekli', 'Galeriye kaydetmek için izin gerekli.');
        setIndiriliyor(false); return;
      }
      const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
      const dir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory!;
      const fileUri = dir + `kolaj_${ilan.portfoy_no ?? ilan.id}_${Date.now()}.png`;
      await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: FileSystem.EncodingType.Base64 });
      await MediaLibrary.saveToLibraryAsync(fileUri);
      setIndiriliyor(false);
      Alert.alert('Kaydedildi', 'Kolaj galeriye kaydedildi.');
    } catch (e: any) {
      setIndiriliyor(false);
      Alert.alert('Hata', e?.message ?? 'Kaydedilemedi');
    }
  }

  function indir() {
    if (secimler.every(s => !s)) {
      Alert.alert('Eksik', 'En az bir slota fotoğraf seçin.');
      return;
    }
    setIndiriliyor(true);
    webviewRef.current?.injectJavaScript('window.exportPng(); true;');
  }

  const slotChips = useMemo(() => Array.from({ length: tpl.count }, (_, i) => i), [tpl.count]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.dimmer} activeOpacity={1} onPress={onClose} />
        <View style={styles.panel}>
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} style={{ width: 32 }}>
              <Text style={styles.kapat}>✕</Text>
            </TouchableOpacity>
            <Text style={styles.baslik}>🖼 Kolaj</Text>
            <View style={{ width: 32 }} />
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
            <Text style={styles.label}>Şablon</Text>
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
              {TEMPLATES.map((t, i) => (
                <TouchableOpacity key={t.id} onPress={() => setTplIdx(i)} style={[styles.chip, tplIdx === i && styles.chipAktif]}>
                  <Text style={[styles.chipText, tplIdx === i && styles.chipTextAktif]}>{t.name}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.previewWrap}>
              <WebView
                ref={webviewRef}
                originWhitelist={['*']}
                source={{ html: HTML }}
                style={styles.preview}
                onMessage={onMessage}
                scrollEnabled={false}
                javaScriptEnabled
                domStorageEnabled
                androidLayerType="hardware"
                mixedContentMode="always"
                setBuiltInZoomControls={false}
              />
              {yukluyor && (
                <View style={styles.previewOverlay}><ActivityIndicator color="#fff" /></View>
              )}
            </View>

            <Text style={[styles.label, { marginTop: 12 }]}>Slot {aktifSlot + 1}/{tpl.count}</Text>
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
              {slotChips.map(i => (
                <TouchableOpacity key={i} onPress={() => slotSec(i)} style={[
                  styles.slotBtn,
                  i === aktifSlot && styles.slotBtnAktif,
                  secimler[i] && i !== aktifSlot && styles.slotBtnDolu,
                ]}>
                  <Text style={[styles.slotBtnText, (i === aktifSlot || secimler[i]) && { color: '#fff' }]}>{i + 1}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {secimler[aktifSlot] && (
              <View style={{ flexDirection: 'row', gap: 6, justifyContent: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
                <TouchableOpacity style={styles.ctrlBtn} onPress={() => webviewRef.current?.injectJavaScript('window.zoomDelta(-0.2); true;')}><Text style={styles.ctrlBtnText}>− Uzaklaş</Text></TouchableOpacity>
                <TouchableOpacity style={styles.ctrlBtn} onPress={() => webviewRef.current?.injectJavaScript('window.zoomDelta(0.2); true;')}><Text style={styles.ctrlBtnText}>+ Yakınlaş</Text></TouchableOpacity>
                <TouchableOpacity style={styles.ctrlBtn} onPress={() => webviewRef.current?.injectJavaScript('window.resetSlot(); true;')}><Text style={styles.ctrlBtnText}>Sıfırla</Text></TouchableOpacity>
              </View>
            )}

            <Text style={styles.label}>Fotoğraf seçin (aktif slota atanır)</Text>
            {fotos.length === 0 ? (
              <View style={styles.empty}><Text style={styles.emptyText}>Fotoğraf yok</Text></View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
                {fotos.map(f => {
                  const aktifMi = secimler[aktifSlot] === f;
                  return (
                    <TouchableOpacity key={f} onPress={() => fotoSec(f)} style={[styles.thumb, aktifMi && styles.thumbAktif]}>
                      <R2Image source={f} style={{ width: '100%', height: '100%' }} resizeMode="cover" size="sm" />
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}

            <TouchableOpacity
              onPress={indir}
              disabled={indiriliyor}
              style={[styles.indirBtn, indiriliyor && { opacity: 0.5 }]}
            >
              <Text style={styles.indirBtnText}>{indiriliyor ? 'Hazırlanıyor...' : 'Galeriye Kaydet (PNG)'}</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  dimmer: { ...StyleSheet.absoluteFillObject },
  panel: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, height: '94%' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  baslik: { fontSize: 16, fontWeight: '700', color: '#111' },
  kapat: { fontSize: 22, color: '#6b7280' },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 },
  previewWrap: { aspectRatio: 1333 / 1999, backgroundColor: '#000', borderRadius: 12, overflow: 'hidden', marginBottom: 8 },
  preview: { flex: 1, backgroundColor: '#000' },
  previewOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.3)' },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 9999, borderWidth: 1.5, borderColor: '#e5e7eb', backgroundColor: '#fff' },
  chipAktif: { borderColor: Colors.primary, backgroundColor: 'rgba(0,35,111,0.08)' },
  chipText: { fontSize: 12, fontWeight: '600', color: '#6b7280' },
  chipTextAktif: { color: Colors.primary },
  slotBtn: { width: 36, height: 36, borderRadius: 8, backgroundColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center' },
  slotBtnAktif: { backgroundColor: '#E53935' },
  slotBtnDolu: { backgroundColor: '#10b981' },
  slotBtnText: { fontSize: 13, fontWeight: '700', color: '#6b7280' },
  ctrlBtn: { paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#f3f4f6', borderRadius: 8 },
  ctrlBtnText: { fontSize: 12, fontWeight: '700', color: '#374151' },
  empty: { padding: 24, backgroundColor: '#f9fafb', borderRadius: 8, alignItems: 'center' },
  emptyText: { color: '#9ca3af', fontSize: 13 },
  thumb: { width: 64, height: 64, borderRadius: 8, overflow: 'hidden', borderWidth: 3, borderColor: 'transparent' },
  thumbAktif: { borderColor: Colors.primary },
  indirBtn: { marginTop: 20, backgroundColor: Colors.primary, borderRadius: 8, padding: 14, alignItems: 'center' },
  indirBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
