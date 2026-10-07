import { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, Modal, Image, Alert, StyleSheet, ActivityIndicator,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Colors, Radius, Spacing } from '../constants/theme';
import type { Ilan } from '../types';
import {
  maskeBaslat, maskeDurum, maskeOnayla, maskeReddet,
  thumbUrl, oncesiUrl, sonrasiUrl, type MaskeRow,
} from '../lib/maskesil';

// WebView çizim tuvali: foto arka plan + üstüne dikdörtgen/fırça/silgi. Maske (siyah zemin + beyaz
// şekiller) ayrı offscreen canvas'tan export edilir (foto çizilmez → taint yok). __IMG__ enjekte edilir.
const DRAW_HTML = `<!DOCTYPE html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no"/>
<style>
*{margin:0;padding:0;box-sizing:border-box;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}
html,body{width:100%;height:100%;background:#000;overflow:hidden}
#wrap{width:100%;height:100%;display:flex;align-items:center;justify-content:center}
#c{display:block;max-width:100%;max-height:100%;touch-action:none}
</style></head><body>
<div id="wrap"><canvas id="c"></canvas></div>
<script>
var img=new Image();
var canvas=document.getElementById('c'), ctx=canvas.getContext('2d');
var shapes=[], cur=null, tool='rect', brush=32, W=0, H=0, started=false;
function post(o){ if(window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(o)); }
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
canvas.addEventListener('touchstart',down,{passive:false});
canvas.addEventListener('touchmove',move,{passive:false});
canvas.addEventListener('touchend',up,{passive:false});
canvas.addEventListener('mousedown',down); canvas.addEventListener('mousemove',move); window.addEventListener('mouseup',up);
window.setTool=function(t){ tool=t; };
window.setBrush=function(n){ brush=n; };
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

type Tool = 'rect' | 'brush' | 'eraser';

export default function MaskeSilModal({ ilan, visible, onClose, onChanged }: {
  ilan: Ilan; visible: boolean; onClose: () => void; onChanged?: () => void;
}) {
  // Sadece müşteriye görünür fotolar. Gizlilik = gizli_fotograflar KÜMESİNDE olmak (bir key hem
  // fotograflar hem gizli_fotograflar'da olabilir → gizliSet.has ile ele). ilan/[id] ile aynı mantık.
  const gizliSet = new Set((ilan.gizli_fotograflar ?? []) as string[]);
  const fotolar = ((ilan.fotograflar ?? []) as string[]).filter((k) => !gizliSet.has(k));
  const [rows, setRows] = useState<MaskeRow[]>([]);
  const [secili, setSecili] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>('rect');
  const [brush, setBrush] = useState(32);
  const [sayi, setSayi] = useState(0);        // çizilen şekil sayısı (WebView'den)
  const [gonderiliyor, setGonderiliyor] = useState(false);
  const [incele, setIncele] = useState(false);
  const [idx, setIdx] = useState(0);
  const [islem, setIslem] = useState<Set<string>>(new Set());
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);
  const kararlanan = useRef<Set<string>>(new Set());
  const webRef = useRef<WebView>(null);
  const scrollRef = useRef<ScrollView>(null);
  const scrollY = useRef(0);              // picker scroll konumu
  const restoreScroll = useRef(false);    // foto seçip dönünce konumu geri yükle

  const yenile = useCallback(async () => {
    try {
      const r = await maskeDurum(ilan.id);
      setRows(r.filter((x) => !kararlanan.current.has(x.id)));
    } catch {}
  }, [ilan.id]);

  useEffect(() => {
    if (!visible) return;
    yenile();
    poll.current = setInterval(yenile, 5000);
    return () => { if (poll.current) clearInterval(poll.current); };
  }, [visible, yenile]);

  const aktif = rows.filter((r) => r.durum === 'bekliyor' || r.durum === 'isleniyor');
  const hazir = rows.filter((r) => r.durum === 'hazir');
  const islenenKeys = new Set(aktif.map((r) => r.foto_key)); // işlenen fotoları picker'da işaretle
  const cur = Math.min(idx, Math.max(0, hazir.length - 1));  // gösterilen hazır foto

  useEffect(() => { if (hazir.length === 0) setIncele(false); }, [hazir.length]);
  useEffect(() => { if (idx > hazir.length - 1) setIdx(Math.max(0, hazir.length - 1)); }, [hazir.length, idx]);

  const inject = (js: string) => webRef.current?.injectJavaScript(js + ';true;');
  const secTool = (t: Tool) => { setTool(t); inject(`window.setTool(${JSON.stringify(t)})`); };
  const secBrush = (n: number) => { setBrush(n); inject(`window.setBrush(${n})`); };

  async function onMessage(data: string) {
    let m: any; try { m = JSON.parse(data); } catch { return; }
    if (m.type === 'count') setSayi(m.n);
    else if (m.type === 'empty') { setGonderiliyor(false); Alert.alert('Uyarı', 'Önce silinecek alan işaretle.'); }
    else if (m.type === 'imgerror') { Alert.alert('Hata', 'Fotoğraf yüklenemedi.'); }
    else if (m.type === 'mask') {
      try {
        await maskeBaslat(ilan.id, secili!, m.data);
        setSecili(null); setSayi(0);
        await yenile();
      } catch (e: any) { Alert.alert('Hata', e.message); }
      setGonderiliyor(false);
    }
  }

  function gonder() {
    if (!secili || !sayi || gonderiliyor) return;
    setGonderiliyor(true);
    inject('window.exportMask()');
  }

  async function karar(row: MaskeRow, onay: boolean) {
    if (islem.has(row.id)) return;
    setIslem((s) => new Set(s).add(row.id));
    kararlanan.current.add(row.id);
    setRows((prev) => prev.filter((r) => r.id !== row.id)); // anında sonraki hazıra geç (tam ekran açık kalır)
    try {
      if (onay) { await maskeOnayla(row.id); onChanged?.(); }
      else { await maskeReddet(row.id); }
    } catch (e: any) { kararlanan.current.delete(row.id); Alert.alert('Hata', e.message); await yenile(); }
    setIslem((s) => { const n = new Set(s); n.delete(row.id); return n; });
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={s.container}>
        <View style={s.header}>
          <Text style={s.title}>🩹 Maske ile Sil</Text>
          <TouchableOpacity onPress={onClose}><Text style={s.close}>×</Text></TouchableOpacity>
        </View>

        {secili ? (
          <View style={{ flex: 1 }}>
            {/* Araç çubuğu */}
            <View style={s.toolbar}>
              {(['rect', 'brush', 'eraser'] as Tool[]).map((t) => (
                <TouchableOpacity key={t} onPress={() => secTool(t)} style={[s.tbtn, tool === t && s.tbtnOn]}>
                  <Text style={[s.tbtnTxt, tool === t && s.tbtnTxtOn]}>{t === 'rect' ? '▭' : t === 'brush' ? '🖌' : '🧽'}</Text>
                </TouchableOpacity>
              ))}
              {(tool === 'brush' || tool === 'eraser') && [16, 32, 64].map((n) => (
                <TouchableOpacity key={n} onPress={() => secBrush(n)} style={[s.tbtn, brush === n && s.tbtnOn]}>
                  <Text style={[s.tbtnTxt, brush === n && s.tbtnTxtOn]}>{n === 16 ? 'İnce' : n === 32 ? 'Orta' : 'Kalın'}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity onPress={() => inject('window.undo()')} disabled={!sayi} style={[s.tbtn, !sayi && s.tbtnDis]}><Text style={s.tbtnTxt}>↩</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => inject('window.clearAll()')} disabled={!sayi} style={[s.tbtn, !sayi && s.tbtnDis]}><Text style={s.tbtnTxt}>Temizle</Text></TouchableOpacity>
            </View>
            <View style={{ flex: 1, backgroundColor: '#000' }}>
              <WebView
                ref={webRef}
                originWhitelist={['*']}
                source={{ html: DRAW_HTML.replace('__IMG__', oncesiUrl(secili)) }}
                onMessage={(e) => onMessage(e.nativeEvent.data)}
                style={{ flex: 1, backgroundColor: '#000' }}
                scrollEnabled={false}
              />
            </View>
            <Text style={s.hint}>Silmek istediğin alan(lar)ı işaretle. Birden çok şekil ekleyebilirsin.</Text>
            <View style={s.row}>
              <TouchableOpacity onPress={() => { setSecili(null); setSayi(0); }} style={[s.btn, s.btnGri, { flex: 1 }]}><Text style={s.btnGriTxt}>← Vazgeç</Text></TouchableOpacity>
              <TouchableOpacity onPress={gonder} disabled={!sayi || gonderiliyor} style={[s.btn, (!sayi || gonderiliyor) ? s.btnOff : s.btnKirmizi, { flex: 2 }]}>
                {gonderiliyor ? <ActivityIndicator color="#fff" /> : <Text style={s.btnKirmiziTxt}>Gönder{sayi ? ` (${sayi})` : ''}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ padding: Spacing.lg }}
            onScroll={(e) => { scrollY.current = e.nativeEvent.contentOffset.y; }} scrollEventThrottle={16}
            onContentSizeChange={() => { if (restoreScroll.current) { restoreScroll.current = false; scrollRef.current?.scrollTo({ y: scrollY.current, animated: false }); } }}>
            {aktif.length > 0 && (
              <View style={s.aktifBox}><Text style={s.aktifTxt}>Dolduruluyor… {aktif.length} işlemde · ~{Math.ceil(aktif.length * 1.5)} dk</Text></View>
            )}

            {/* HAZIR onay — tek foto (ilk), dokun→tam ekran, onaylayınca sonrakine geçer */}
            {hazir.length > 0 && (() => { const r = hazir[cur]; return (
              <View style={s.card}>
                <Text style={s.secTitle}>İncele — {hazir.length} kaldı</Text>
                <TouchableOpacity onPress={() => setIncele(true)} activeOpacity={0.85}>
                  <View style={s.ikili}>
                    <View style={{ flex: 1 }}><Text style={s.cap}>ÖNCESİ</Text><Image source={{ uri: oncesiUrl(r.foto_key) }} style={s.img} /></View>
                    <View style={{ flex: 1 }}><Text style={[s.cap, { color: '#3aaa6e' }]}>SONRASI</Text>{r.temiz_key ? <Image source={{ uri: sonrasiUrl(r.temiz_key) }} style={s.img} /> : <View style={s.img} />}</View>
                  </View>
                  <Text style={s.buyutHint}>👆 Büyütmek için dokun</Text>
                </TouchableOpacity>
                <View style={s.row}>
                  <TouchableOpacity onPress={() => karar(r, false)} disabled={islem.has(r.id)} style={[s.btn, s.btnRed, { flex: 1 }]}><Text style={s.btnRedTxt}>✕ Olmamış</Text></TouchableOpacity>
                  <TouchableOpacity onPress={() => karar(r, true)} disabled={islem.has(r.id)} style={[s.btn, s.btnYesil, { flex: 1 }]}><Text style={s.btnYesilTxt}>✓ Onayla</Text></TouchableOpacity>
                </View>
              </View>
            ); })()}

            {rows.some((r) => r.durum === 'hata') && <Text style={s.hata}>Bazı işlemler başarısız oldu, tekrar deneyebilirsin.</Text>}

            <Text style={s.secTitle}>Düzenlenecek fotoğrafı seç</Text>
            <View style={s.grid}>
              {fotolar.map((k) => {
                const isleniyor = islenenKeys.has(k);
                return (
                  <TouchableOpacity key={k} disabled={isleniyor} activeOpacity={0.8}
                    onPress={() => { restoreScroll.current = true; setSecili(k); setSayi(0); }}
                    style={[s.thumbWrap, isleniyor && s.thumbIsleniyor]}>
                    <Image source={{ uri: thumbUrl(k) }} style={s.thumb} />
                    {isleniyor && <View style={s.thumbBadge}><Text style={s.thumbBadgeTxt}>⏳ İşleniyor…</Text></View>}
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
        )}

        {/* Tam ekran inceleme — tek foto, sağ/sol gezinme */}
        {incele && hazir.length > 0 && (() => { const r = hazir[cur]; return (
          <View style={s.fs}>
            <View style={s.fsHead}>
              <Text style={s.fsTitle}>İncele — {cur + 1}/{hazir.length}</Text>
              <TouchableOpacity onPress={() => setIncele(false)}><Text style={s.close}>×</Text></TouchableOpacity>
            </View>
            <View style={s.fsBody}>
              <View style={{ flex: 1 }}><Text style={s.fsCap}>ÖNCESİ</Text><Image source={{ uri: oncesiUrl(r.foto_key) }} style={s.fsImg} resizeMode="contain" /></View>
              <View style={{ flex: 1 }}><Text style={[s.fsCap, { color: '#6ee7a8' }]}>SONRASI</Text>{r.temiz_key ? <Image source={{ uri: sonrasiUrl(r.temiz_key) }} style={s.fsImg} resizeMode="contain" /> : null}</View>
            </View>
            {hazir.length > 1 && (
              <View style={s.navRow}>
                <TouchableOpacity onPress={() => setIdx((i) => Math.max(0, i - 1))} disabled={cur === 0} style={[s.navBtn, cur === 0 && s.navOff]}><Text style={s.navTxt}>‹ Önceki</Text></TouchableOpacity>
                <TouchableOpacity onPress={() => setIdx((i) => Math.min(hazir.length - 1, i + 1))} disabled={cur >= hazir.length - 1} style={[s.navBtn, cur >= hazir.length - 1 && s.navOff]}><Text style={s.navTxt}>Sonraki ›</Text></TouchableOpacity>
              </View>
            )}
            <View style={[s.row, { padding: Spacing.lg }]}>
              <TouchableOpacity onPress={() => karar(r, false)} disabled={islem.has(r.id)} style={[s.btn, { flex: 1, backgroundColor: 'rgba(229,57,53,0.28)' }]}><Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>✕ Olmamış</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => karar(r, true)} disabled={islem.has(r.id)} style={[s.btn, { flex: 1, backgroundColor: '#3aaa6e' }]}><Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>✓ Onayla</Text></TouchableOpacity>
            </View>
          </View>
        ); })()}
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.lg, borderBottomWidth: 1, borderBottomColor: Colors.outline },
  title: { fontSize: 17, fontWeight: '700', color: Colors.onSurface },
  close: { fontSize: 30, color: Colors.onSurfaceVariant, lineHeight: 32 },
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, padding: Spacing.sm, backgroundColor: Colors.surfaceContainer },
  tbtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radius.sm, backgroundColor: Colors.surfaceContainerHigh },
  tbtnOn: { backgroundColor: Colors.primary },
  tbtnDis: { opacity: 0.4 },
  tbtnTxt: { color: Colors.onSurface, fontWeight: '700', fontSize: 13 },
  tbtnTxtOn: { color: '#fff' },
  hint: { fontSize: 12, color: Colors.onSurfaceVariant, textAlign: 'center', paddingVertical: 6 },
  row: { flexDirection: 'row', gap: 10, padding: Spacing.md },
  btn: { paddingVertical: 14, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  btnKirmizi: { backgroundColor: Colors.primary },
  btnKirmiziTxt: { color: '#fff', fontWeight: '700', fontSize: 15 },
  btnOff: { backgroundColor: Colors.surfaceContainerHighest },
  btnGri: { backgroundColor: Colors.surfaceContainerHigh },
  btnGriTxt: { color: Colors.onSurface, fontWeight: '700', fontSize: 15 },
  aktifBox: { backgroundColor: 'rgba(234,88,12,0.15)', borderRadius: Radius.sm, padding: 12, marginBottom: 12 },
  aktifTxt: { color: '#ea580c', fontWeight: '700', fontSize: 13 },
  card: { borderWidth: 1, borderColor: '#2e7d54', borderRadius: Radius.md, padding: 10, marginBottom: 14 },
  ikili: { flexDirection: 'row', gap: 8 },
  cap: { fontSize: 10, fontWeight: '700', color: Colors.onSurfaceVariant, marginBottom: 3, letterSpacing: 0.5 },
  img: { width: '100%', height: 150, borderRadius: 6, backgroundColor: Colors.surfaceContainer, resizeMode: 'contain' },
  buyutHint: { fontSize: 12, color: Colors.primary, fontWeight: '700', textAlign: 'center', marginTop: 6 },
  btnRed: { backgroundColor: 'rgba(229,57,53,0.15)' },
  btnRedTxt: { color: Colors.primary, fontWeight: '700', fontSize: 14 },
  btnYesil: { backgroundColor: '#3aaa6e' },
  btnYesilTxt: { color: '#fff', fontWeight: '700', fontSize: 14 },
  hata: { fontSize: 12, color: Colors.error, marginBottom: 10 },
  secTitle: { fontSize: 14, fontWeight: '700', color: Colors.onSurface, marginBottom: 10, marginTop: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  thumbWrap: { width: '48.5%', aspectRatio: 1, borderRadius: Radius.sm, overflow: 'hidden' },
  thumbIsleniyor: { borderWidth: 2, borderColor: '#fdba74' },
  thumbBadge: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  thumbBadgeTxt: { color: '#fff', fontWeight: '800', fontSize: 12 },
  navRow: { flexDirection: 'row', gap: 10, paddingHorizontal: Spacing.lg, paddingTop: 6 },
  navBtn: { flex: 1, paddingVertical: 10, borderRadius: Radius.md, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.14)' },
  navOff: { opacity: 0.3 },
  navTxt: { color: '#fff', fontWeight: '700', fontSize: 14 },
  thumb: { width: '100%', height: '100%', backgroundColor: Colors.surfaceContainer },
  fs: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#0b0b0b' },
  fsHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.md },
  fsTitle: { color: '#fff', fontWeight: '700', fontSize: 15 },
  fsBody: { flex: 1, flexDirection: 'row', gap: 6, paddingHorizontal: 8 },
  fsCap: { color: '#e5e7eb', fontWeight: '700', fontSize: 11, paddingVertical: 4 },
  fsImg: { flex: 1, width: '100%' },
});
