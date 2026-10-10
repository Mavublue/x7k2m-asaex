import { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, Modal, Image, Alert, StyleSheet, ActivityIndicator, TextInput, Switch,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Colors, Radius, Spacing } from '../constants/theme';
import { supabase } from '../lib/supabase';
import type { Ilan } from '../types';
import {
  filigranBaslat, filigranDurum, filigranOnayla, filigranOnaylaHepsi, filigranReddet,
  thumbUrl, oncesiUrl as filOncesiUrl, sonrasiUrl as filSonrasiUrl, type FiligranRow,
} from '../lib/filigran';
import {
  maskeBaslat, maskeDurum, maskeOnayla, maskeReddet,
  oncesiUrl as mskOncesiUrl, sonrasiUrl as mskSonrasiUrl, type MaskeRow,
} from '../lib/maskesil';
import { kirpUygula, kirpOncesiUrl, type Crop } from '../lib/kirp';

type Mode = 'filigran' | 'maske' | 'kirp';

export default function FotoTemizleModal({ ilan, visible, onClose, onChanged }: {
  ilan: Ilan; visible: boolean; onClose: () => void; onChanged?: () => void;
}) {
  const [mode, setMode] = useState<Mode>('filigran');
  const [filCount, setFilCount] = useState(0); // filigran bekleyen/onay sayısı (rozet)
  const [mskCount, setMskCount] = useState(0); // maske bekleyen/onay sayısı (rozet)

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
      <View style={shell.wrap}>
        <View style={shell.header}>
          <Text style={shell.title}>Fotoğraf Temizle</Text>
          <TouchableOpacity onPress={onClose} hitSlop={10}><Text style={shell.close}>✕</Text></TouchableOpacity>
        </View>

        {/* SEKME */}
        <View style={shell.tabs}>
          <TouchableOpacity style={[shell.tab, mode === 'filigran' && shell.tabOn]} onPress={() => setMode('filigran')}>
            <Text style={[shell.tabTxt, mode === 'filigran' && shell.tabTxtOn]}>🧹 Filigran</Text>
            {filCount > 0 && <View style={shell.badge}><Text style={shell.badgeTxt}>{filCount}</Text></View>}
          </TouchableOpacity>
          <TouchableOpacity style={[shell.tab, mode === 'maske' && shell.tabOn]} onPress={() => setMode('maske')}>
            <Text style={[shell.tabTxt, mode === 'maske' && shell.tabTxtOn]}>🩹 Maske</Text>
            {mskCount > 0 && <View style={shell.badge}><Text style={shell.badgeTxt}>{mskCount}</Text></View>}
          </TouchableOpacity>
          <TouchableOpacity style={[shell.tab, mode === 'kirp' && shell.tabOn]} onPress={() => setMode('kirp')}>
            <Text style={[shell.tabTxt, mode === 'kirp' && shell.tabTxtOn]}>✂️ Kırp</Text>
          </TouchableOpacity>
        </View>

        {/* Filigran+Maske pane'leri monte kalır (poll+rozet sürsün); pasif olan gizlenir */}
        <View style={{ flex: 1, display: mode === 'filigran' ? 'flex' : 'none' }}>
          <FiligranPane ilan={ilan} visible={visible} onChanged={onChanged} onCount={setFilCount} />
        </View>
        <View style={{ flex: 1, display: mode === 'maske' ? 'flex' : 'none' }}>
          <MaskePane ilan={ilan} visible={visible} onChanged={onChanged} onCount={setMskCount} />
        </View>
        {/* Kırp: durum/poll yok, sadece aktifken monte */}
        {mode === 'kirp' && (
          <View style={{ flex: 1 }}>
            <KirpPane ilan={ilan} onChanged={onChanged} />
          </View>
        )}
      </View>
    </Modal>
  );
}

/* ======================= FİLİGRAN ======================= */
function FiligranPane({ ilan, visible, onChanged, onCount }: {
  ilan: Ilan; visible: boolean; onChanged?: () => void; onCount: (n: number) => void;
}) {
  const fotolar = (ilan.fotograflar ?? []) as string[];
  const [rows, setRows] = useState<FiligranRow[]>([]);
  const [secili, setSecili] = useState<Set<string>>(new Set());
  const [ofisVar, setOfisVar] = useState(false);
  const [ofisAdi, setOfisAdi] = useState('');
  const [baslatiliyor, setBaslatiliyor] = useState(false);
  const [islem, setIslem] = useState<Set<string>>(new Set());
  const [incele, setIncele] = useState(false);
  const [idx, setIdx] = useState(0);
  const [yatay, setYatay] = useState(true);
  const [oncesiAcik, setOncesiAcik] = useState<Set<string>>(new Set());
  const [onaylaniyor, setOnaylaniyor] = useState(false);
  const [onaylaToplam, setOnaylaToplam] = useState(0);
  const [tamamlandi, setTamamlandi] = useState(false);
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);
  const kararlanan = useRef<Set<string>>(new Set());

  const yenile = useCallback(async () => {
    try {
      const r = await filigranDurum(ilan.id);
      setRows(r.filter((x) => !kararlanan.current.has(x.id)));
    } catch {}
  }, [ilan.id]);

  useEffect(() => {
    if (!visible) return;
    yenile();
    const ch = supabase.channel(`fil-${ilan.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ilan_filigran', filter: `ilan_id=eq.${ilan.id}` }, () => yenile())
      .subscribe();
    poll.current = setInterval(yenile, 15000); // güvenlik ağı (realtime varken)
    return () => { if (poll.current) clearInterval(poll.current); supabase.removeChannel(ch); };
  }, [visible, yenile, ilan.id]);

  const aktif = rows.filter((r) => r.durum === 'bekliyor' || r.durum === 'isleniyor');
  const hazir = rows.filter((r) => r.durum === 'hazir');
  const mesgul = new Set([...aktif, ...hazir].map((r) => r.foto_key));
  const secilebilir = fotolar.filter((k) => !mesgul.has(k));

  useEffect(() => { onCount(aktif.length + hazir.length); }, [aktif.length, hazir.length, onCount]);
  useEffect(() => { if (hazir.length === 0) setIncele(false); }, [hazir.length]);
  useEffect(() => { if (idx > hazir.length - 1) setIdx(Math.max(0, hazir.length - 1)); }, [hazir.length, idx]);
  const cur = Math.min(idx, Math.max(0, hazir.length - 1));
  useEffect(() => {
    const r = hazir[cur];
    if (!r) return;
    const u = r.temiz_key ? filSonrasiUrl(r.temiz_key) : filOncesiUrl(r.foto_key);
    Image.getSize(u, (w, h) => setYatay(w >= h), () => setYatay(true));
  }, [hazir, cur]);
  const pipeline = aktif.length + hazir.length;
  const biten = hazir.length;
  const kalanDk = Math.ceil(aktif.length * 3);

  const toggle = (k: string) => setSecili((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const hepsiniSec = () => setSecili(new Set(secilebilir.length === secili.size ? [] : secilebilir));

  async function baslat() {
    if (!secili.size || baslatiliyor) return;
    setBaslatiliyor(true);
    try { await filigranBaslat(ilan.id, [...secili], ofisVar ? ofisAdi.trim() : ''); setSecili(new Set()); await yenile(); }
    catch (e: any) { Alert.alert('Hata', e.message); }
    setBaslatiliyor(false);
  }
  async function karar(row: FiligranRow, onay: boolean) {
    if (islem.has(row.id)) return;
    setIslem((s) => new Set(s).add(row.id));
    kararlanan.current.add(row.id);
    setRows((prev) => prev.filter((r) => r.id !== row.id));
    try {
      if (onay) { await filigranOnayla(row.id); onChanged?.(); } else { await filigranReddet(row.id); }
    } catch (e: any) { kararlanan.current.delete(row.id); Alert.alert('Hata', e.message); await yenile(); }
    setIslem((s) => { const n = new Set(s); n.delete(row.id); return n; });
  }
  async function hepsiniOnayla() {
    if (!hazir.length || onaylaniyor) return;
    setOnaylaToplam(hazir.length);
    setOnaylaniyor(true);
    setTamamlandi(false);
    setIncele(false);
    try { await filigranOnaylaHepsi(ilan.id); }
    catch (e: any) { setOnaylaniyor(false); Alert.alert('Hata', e.message); }
  }

  useEffect(() => {
    if (onaylaniyor && hazir.length === 0) {
      setOnaylaniyor(false);
      setTamamlandi(true);
      onChanged?.();
      const t = setTimeout(() => setTamamlandi(false), 4000);
      return () => clearTimeout(t);
    }
  }, [onaylaniyor, hazir.length, onChanged]);

  useEffect(() => {
    // İleri-ağırlıklı: hızlı giderken SONRASI temiz foto (R2'de hep soğuk) hazır gelsin
    [cur + 1, cur + 2, cur + 3, cur - 1].forEach((i) => {
      const r = hazir[i];
      if (r?.temiz_key) Image.prefetch(filSonrasiUrl(r.temiz_key));
    });
  }, [cur, hazir]);

  return (
    <>
      <ScrollView contentContainerStyle={{ padding: Spacing.lg, gap: Spacing.lg }}>
        {/* İLERLEME */}
        {aktif.length > 0 && (
          <View style={sf.progressBox}>
            <Text style={sf.progressText}>Temizleniyor… {biten}/{pipeline} bitti · {aktif.length} sırada{kalanDk > 0 ? ` · ~${kalanDk} dk` : ''}</Text>
            <View style={sf.barBg}><View style={[sf.barFill, { width: `${pipeline ? (biten / pipeline) * 100 : 0}%` }]} /></View>
          </View>
        )}

        {/* TOPLU ONAY İLERLEME */}
        {onaylaniyor && (
          <View style={[sf.progressBox, { backgroundColor: 'rgba(34,197,94,0.12)', borderColor: '#22c55e' }]}>
            <Text style={[sf.progressText, { color: '#22c55e' }]}>Onaylanıyor… {onaylaToplam - hazir.length}/{onaylaToplam} bitti</Text>
            <View style={sf.barBg}><View style={[sf.barFill, { width: `${onaylaToplam ? ((onaylaToplam - hazir.length) / onaylaToplam) * 100 : 0}%`, backgroundColor: '#22c55e' }]} /></View>
          </View>
        )}

        {/* TAMAMLANDI */}
        {tamamlandi && (
          <View style={[sf.progressBox, { backgroundColor: 'rgba(34,197,94,0.12)', borderColor: '#86efac' }]}>
            <Text style={[sf.progressText, { color: '#22c55e' }]}>✓ Tümü onaylandı — fotoğraflar güncellendi</Text>
          </View>
        )}

        {/* İNCELE */}
        {hazir.length > 0 && !onaylaniyor && (
          <View style={{ gap: Spacing.md }}>
            <View style={sf.rowBetween}>
              <Text style={sf.sectionTitle}>İncele — {hazir.length} kaldı</Text>
              {hazir.length > 1 && <TouchableOpacity style={sf.onayHepsi} onPress={hepsiniOnayla}><Text style={sf.onayHepsiText}>✓ Hepsini Onayla</Text></TouchableOpacity>}
            </View>
            {(() => { const r = hazir[cur]; return (
              <TouchableOpacity activeOpacity={0.9} style={sf.card} onPress={() => setIncele(true)}>
                <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
                  <View style={{ flex: 1 }}>
                    <Text style={sf.cap}>ÖNCESİ</Text>
                    {oncesiAcik.has(r.foto_key)
                      ? <Image source={{ uri: filOncesiUrl(r.foto_key) }} style={sf.img} />
                      : <TouchableOpacity activeOpacity={0.8} style={[sf.img, sf.oncesiPh]} onPress={() => setOncesiAcik((set) => new Set(set).add(r.foto_key))}>
                          <Text style={sf.oncesiPhText}>👆 Orijinali göster</Text>
                        </TouchableOpacity>}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[sf.cap, { color: '#3aaa6e' }]}>SONRASI</Text>
                    {r.temiz_key ? <Image source={{ uri: filSonrasiUrl(r.temiz_key) }} style={sf.img} /> : null}
                  </View>
                </View>
                <Text style={sf.dokunHintRed}>👆 İncelemek ve onaylamak için dokun</Text>
              </TouchableOpacity>
            ); })()}
          </View>
        )}

        {rows.some((r) => r.durum === 'hata') && (
          <Text style={sf.hataText}>Bazı fotolar temizlenemedi (tekrar seçip deneyebilirsin).</Text>
        )}

        {/* SEÇ + BAŞLAT */}
        <View style={{ gap: Spacing.sm }}>
          <View style={sf.rowBetween}>
            <Text style={sf.sectionTitle}>Temizlenecek Fotoğraflar{secili.size > 0 ? ` (${secili.size})` : ''}</Text>
            {secilebilir.length > 0 && (
              <TouchableOpacity onPress={hepsiniSec}><Text style={sf.link}>{secili.size === secilebilir.length ? 'Kaldır' : 'Hepsini Seç'}</Text></TouchableOpacity>
            )}
          </View>
          {secilebilir.length === 0 ? (
            <Text style={sf.bos}>Temizlenecek başka foto yok.</Text>
          ) : (
            <View style={sf.grid}>
              {secilebilir.map((k) => {
                const sec = secili.has(k);
                const temizlenmis = /_c\d{10,}/.test(k);
                return (
                  <TouchableOpacity key={k} onPress={() => toggle(k)} style={[sf.thumbWrap, temizlenmis && sf.thumbTemiz, sec && sf.thumbSel]}>
                    <Image source={{ uri: thumbUrl(k) }} style={sf.thumb} />
                    {sec && <View style={sf.check}><Text style={sf.checkText}>✓</Text></View>}
                    {temizlenmis && <View style={sf.temizBanner}><Text style={sf.temizBannerText}>✓ temizlendi</Text></View>}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
          {/* Ofis adı */}
          <View style={sf.ofisBox}>
            <View style={sf.rowBetween}>
              <Text style={sf.ofisLabel}>Fotoğrafta ofis/mağaza adı var</Text>
              <Switch value={ofisVar} onValueChange={setOfisVar} />
            </View>
            {ofisVar && (
              <>
                <TextInput value={ofisAdi} onChangeText={setOfisAdi} maxLength={60}
                  placeholder="Ör: TEOK GAYRİMENKUL" placeholderTextColor={Colors.onSurfaceVariant}
                  style={sf.ofisInput} />
                <Text style={sf.ofisHint}>sahibinden.com yazısının hemen altındaki mağaza adını aynen yazın. Bant harf sayısına göre ayarlanır.</Text>
              </>
            )}
          </View>
          <TouchableOpacity style={[sf.temizleBtn, (!secili.size || baslatiliyor) && sf.temizleBtnOff]} disabled={!secili.size || baslatiliyor} onPress={baslat}>
            {baslatiliyor ? <ActivityIndicator color="#fff" /> : <Text style={sf.temizleText}>Temizle{secili.size ? ` (${secili.size})` : ''}</Text>}
          </TouchableOpacity>
        </View>
      </ScrollView>
      {incele && hazir.length > 0 && (() => { const r = hazir[cur]; return (
        <Modal visible transparent animationType="fade" onRequestClose={() => setIncele(false)}>
          <View style={sf.fsWrap}>
            <View style={sf.fsHeader}>
              <Text style={sf.fsTitle}>İncele — {cur + 1}/{hazir.length}</Text>
              <TouchableOpacity onPress={() => setIncele(false)} hitSlop={12}><Text style={sf.fsClose}>✕</Text></TouchableOpacity>
            </View>
            <View style={[sf.fsRow, { flexDirection: yatay ? 'column' : 'row' }]}>
              <View style={sf.fsCol}>
                <Text style={sf.fsCap}>ÖNCESİ</Text>
                {oncesiAcik.has(r.foto_key) ? (
                  <ScrollView style={sf.fsZoom} contentContainerStyle={sf.fsZoomC} maximumZoomScale={4} minimumZoomScale={1} centerContent bouncesZoom>
                    <Image source={{ uri: filOncesiUrl(r.foto_key) }} style={sf.fsHalf} resizeMode="contain" />
                  </ScrollView>
                ) : (
                  <TouchableOpacity activeOpacity={0.8} style={[sf.fsHalf, sf.oncesiPhFs]} onPress={() => setOncesiAcik((set) => new Set(set).add(r.foto_key))}>
                    <Text style={sf.oncesiPhText}>👆 Orijinali göster</Text>
                  </TouchableOpacity>
                )}
              </View>
              <View style={sf.fsCol}>
                <Text style={[sf.fsCap, { color: '#6ee7a8' }]}>SONRASI</Text>
                {r.temiz_key ? (
                  <ScrollView style={sf.fsZoom} contentContainerStyle={sf.fsZoomC} maximumZoomScale={4} minimumZoomScale={1} centerContent bouncesZoom>
                    <Image source={{ uri: filSonrasiUrl(r.temiz_key) }} style={sf.fsHalf} resizeMode="contain" />
                  </ScrollView>
                ) : null}
              </View>
            </View>
            {hazir.length > 1 && (
              <View style={sf.navRow}>
                <TouchableOpacity onPress={() => setIdx((i) => Math.max(0, i - 1))} disabled={cur === 0} style={[sf.navBtn, cur === 0 && sf.navOff]}>
                  <Text style={sf.navTxt}>‹ Önceki</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setIdx((i) => Math.min(hazir.length - 1, i + 1))} disabled={cur >= hazir.length - 1} style={[sf.navBtn, cur >= hazir.length - 1 && sf.navOff]}>
                  <Text style={sf.navTxt}>Sonraki ›</Text>
                </TouchableOpacity>
              </View>
            )}
            <View style={sf.fsBtnRow}>
              <TouchableOpacity style={[sf.fsBtn, sf.fsRed]} disabled={islem.has(r.id)} onPress={() => karar(r, false)}>
                <Text style={sf.fsBtnText}>✕ Olmamış</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[sf.fsBtn, sf.fsGreen]} disabled={islem.has(r.id)} onPress={() => karar(r, true)}>
                <Text style={sf.fsBtnText}>✓ Olmuş</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      ); })()}
    </>
  );
}

/* ======================= MASKE ======================= */
const DRAW_HTML = `<!DOCTYPE html><html><head>
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

type Tool = 'rect' | 'brush' | 'eraser';

function MaskePane({ ilan, visible, onChanged, onCount }: {
  ilan: Ilan; visible: boolean; onChanged?: () => void; onCount: (n: number) => void;
}) {
  const gizliSet = new Set((ilan.gizli_fotograflar ?? []) as string[]);
  const fotolar = ((ilan.fotograflar ?? []) as string[]).filter((k) => !gizliSet.has(k));
  const [rows, setRows] = useState<MaskeRow[]>([]);
  const [secili, setSecili] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>('rect');
  const [brush, setBrush] = useState(32);
  const [zoomMode, setZoomMode] = useState(false);
  const [sayi, setSayi] = useState(0);
  const [gonderiliyor, setGonderiliyor] = useState(false);
  const [incele, setIncele] = useState(false);
  const [idx, setIdx] = useState(0);
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);
  const kararlanan = useRef<Set<string>>(new Set());
  // Onay/ret kuyruğu: kullanıcı hızlı basar, arkada teker teker (sırayla) gönderilir.
  const kuyruk = useRef<{ id: string; onay: boolean }[]>([]);
  const kuyrukCalisiyor = useRef(false);
  const [kuyrukSayi, setKuyrukSayi] = useState(0);
  const [hataSayi, setHataSayi] = useState(0);
  const webRef = useRef<WebView>(null);
  const scrollRef = useRef<ScrollView>(null);
  const scrollY = useRef(0);
  const restoreScroll = useRef(false);

  const yenile = useCallback(async () => {
    try {
      const r = await maskeDurum(ilan.id);
      setRows(r.filter((x) => !kararlanan.current.has(x.id)));
    } catch {}
  }, [ilan.id]);

  useEffect(() => {
    if (!visible) return;
    yenile();
    const ch = supabase.channel(`msk-${ilan.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ilan_maske_sil', filter: `ilan_id=eq.${ilan.id}` }, () => yenile())
      .subscribe();
    poll.current = setInterval(yenile, 15000); // güvenlik ağı (realtime varken)
    return () => { if (poll.current) clearInterval(poll.current); supabase.removeChannel(ch); };
  }, [visible, yenile, ilan.id]);

  const aktif = rows.filter((r) => r.durum === 'bekliyor' || r.durum === 'isleniyor');
  const hazir = rows.filter((r) => r.durum === 'hazir');
  const islenenKeys = new Set(aktif.map((r) => r.foto_key));
  const hazirKeys = new Set(hazir.map((r) => r.foto_key));
  const cur = Math.min(idx, Math.max(0, hazir.length - 1));

  useEffect(() => { onCount(aktif.length + hazir.length); }, [aktif.length, hazir.length, onCount]);
  useEffect(() => { if (hazir.length === 0) setIncele(false); }, [hazir.length]);
  useEffect(() => { if (idx > hazir.length - 1) setIdx(Math.max(0, hazir.length - 1)); }, [hazir.length, idx]);
  // Onay karuselinde komşuları (öncesi _lg + sonrası temiz) önden yükle → hızlı giderken takılmasın
  useEffect(() => {
    if (!hazir.length) return;
    [cur + 1, cur + 2, cur + 3, cur - 1].forEach((i) => {
      const r = hazir[i];
      if (!r) return;
      Image.prefetch(mskOncesiUrl(r.foto_key));
      if (r.temiz_key) Image.prefetch(mskSonrasiUrl(r.temiz_key));
    });
  }, [cur, hazir]);

  const inject = (js: string) => webRef.current?.injectJavaScript(js + ';true;');
  const secTool = (t: Tool) => { setTool(t); inject(`window.setTool(${JSON.stringify(t)})`); };
  const secBrush = (n: number) => { setBrush(n); inject(`window.setBrush(${n})`); };
  const secZoom = () => { const v = !zoomMode; setZoomMode(v); inject(`window.setZoomMode(${v})`); };

  async function onMessage(data: string) {
    let m: any; try { m = JSON.parse(data); } catch { return; }
    if (m.type === 'count') setSayi(m.n);
    else if (m.type === 'empty') { setGonderiliyor(false); Alert.alert('Uyarı', 'Önce silinecek alan işaretle.'); }
    else if (m.type === 'imgerror') { Alert.alert('Hata', 'Fotoğraf yüklenemedi.'); }
    else if (m.type === 'mask') {
      try {
        await maskeBaslat(ilan.id, secili!, m.data);
        setSecili(null); setSayi(0);
        setGonderiliyor(false);
        await yenile(); // grid "işleniyor"u anında göstersin (realtime de tetikler)
        return;
      } catch (e: any) { Alert.alert('Hata', e.message); }
      setGonderiliyor(false);
    }
  }

  function gonder() {
    if (!secili || !sayi || gonderiliyor) return;
    setGonderiliyor(true);
    inject('window.exportMask()');
  }

  // Arkada çalışan kuyruk işçisi: sıradakileri TEK TEK sunucuya yollar (aynı anda yığılmaz).
  const kuyrukSur = useCallback(async () => {
    if (kuyrukCalisiyor.current) return;
    kuyrukCalisiyor.current = true;
    try {
      while (kuyruk.current.length) {
        const job = kuyruk.current[0];
        try {
          if (job.onay) { await maskeOnayla(job.id); onChanged?.(); }
          else { await maskeReddet(job.id); }
        } catch {
          kararlanan.current.delete(job.id);
          setHataSayi((n) => n + 1);
        }
        kuyruk.current.shift();
        setKuyrukSayi(kuyruk.current.length);
      }
    } finally {
      kuyrukCalisiyor.current = false;
      await yenile();
    }
  }, [onChanged, yenile]);

  // Kullanıcı basar: ekran ANINDA ilerler, istek kuyruğa atılır (beklemez). Çift basış kararlanan ile yutulur.
  function karar(row: MaskeRow, onay: boolean) {
    if (kararlanan.current.has(row.id)) return;
    kararlanan.current.add(row.id);
    setRows((prev) => prev.filter((r) => r.id !== row.id));
    kuyruk.current.push({ id: row.id, onay });
    setKuyrukSayi(kuyruk.current.length);
    kuyrukSur();
  }

  return (
    <View style={{ flex: 1 }}>
      {secili ? (
        <View style={{ flex: 1 }}>
          {/* Araç çubuğu */}
          <View style={sm.toolbar}>
            <TouchableOpacity onPress={secZoom} style={[sm.tbtn, zoomMode && sm.tbtnOn]}>
              <Text style={[sm.tbtnTxt, zoomMode && sm.tbtnTxtOn]}>🔍</Text>
            </TouchableOpacity>
            {!zoomMode && (['rect', 'brush', 'eraser'] as Tool[]).map((t) => (
              <TouchableOpacity key={t} onPress={() => secTool(t)} style={[sm.tbtn, tool === t && sm.tbtnOn]}>
                <Text style={[sm.tbtnTxt, tool === t && sm.tbtnTxtOn]}>{t === 'rect' ? '▭' : t === 'brush' ? '🖌' : '🧽'}</Text>
              </TouchableOpacity>
            ))}
            {!zoomMode && (tool === 'brush' || tool === 'eraser') && [16, 32, 64].map((n) => (
              <TouchableOpacity key={n} onPress={() => secBrush(n)} style={[sm.tbtn, brush === n && sm.tbtnOn]}>
                <Text style={[sm.tbtnTxt, brush === n && sm.tbtnTxtOn]}>{n === 16 ? 'İnce' : n === 32 ? 'Orta' : 'Kalın'}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity onPress={() => inject('window.undo()')} disabled={!sayi} style={[sm.tbtn, !sayi && sm.tbtnDis]}><Text style={sm.tbtnTxt}>↩</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => inject('window.clearAll()')} disabled={!sayi} style={[sm.tbtn, !sayi && sm.tbtnDis]}><Text style={sm.tbtnTxt}>Temizle</Text></TouchableOpacity>
          </View>
          <View style={{ flex: 1, backgroundColor: '#000' }}>
            <WebView
              ref={webRef}
              originWhitelist={['*']}
              source={{ html: DRAW_HTML.replace('__IMG__', mskOncesiUrl(secili)) }}
              onMessage={(e) => onMessage(e.nativeEvent.data)}
              style={{ flex: 1, backgroundColor: '#000' }}
              scrollEnabled={false}
            />
          </View>
          <Text style={sm.hint}>Silmek istediğin alan(lar)ı işaretle. İki parmakla yakınlaştır; 🔍 ile kaydır.</Text>
          <View style={sm.row}>
            <TouchableOpacity onPress={() => { setSecili(null); setSayi(0); setZoomMode(false); }} style={[sm.btn, sm.btnGri, { flex: 1 }]}><Text style={sm.btnGriTxt}>← Vazgeç</Text></TouchableOpacity>
            <TouchableOpacity onPress={gonder} disabled={!sayi || gonderiliyor} style={[sm.btn, (!sayi || gonderiliyor) ? sm.btnOff : sm.btnKirmizi, { flex: 2 }]}>
              {gonderiliyor ? <ActivityIndicator color="#fff" /> : <Text style={sm.btnKirmiziTxt}>Gönder{sayi ? ` (${sayi})` : ''}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ padding: Spacing.lg }}
          onScroll={(e) => { scrollY.current = e.nativeEvent.contentOffset.y; }} scrollEventThrottle={16}
          onContentSizeChange={() => { if (restoreScroll.current) { restoreScroll.current = false; scrollRef.current?.scrollTo({ y: scrollY.current, animated: false }); } }}>
          {aktif.length > 0 && (
            <View style={sm.aktifBox}><Text style={sm.aktifTxt}>Dolduruluyor… {aktif.length} işlemde · ~{Math.ceil(aktif.length * 1.5)} dk</Text></View>
          )}

          {kuyrukSayi > 0 && (
            <View style={sm.kuyrukBox}><Text style={sm.kuyrukTxt}>Gönderiliyor… {kuyrukSayi} sırada (sen devam edebilirsin)</Text></View>
          )}
          {hataSayi > 0 && (
            <View style={sm.hataBox}><Text style={sm.hataBoxTxt}>{hataSayi} tanesi gönderilemedi, tekrar deneyebilirsin.</Text></View>
          )}

          {/* HAZIR onay */}
          {hazir.length > 0 && (() => { const r = hazir[cur]; return (
            <View style={sm.card}>
              <Text style={sm.secTitle}>İncele — {hazir.length} kaldı</Text>
              <TouchableOpacity onPress={() => setIncele(true)} activeOpacity={0.85}>
                <View style={sm.ikili}>
                  <View style={{ flex: 1 }}><Text style={sm.cap}>ÖNCESİ</Text><Image source={{ uri: mskOncesiUrl(r.foto_key) }} style={sm.img} /></View>
                  <View style={{ flex: 1 }}><Text style={[sm.cap, { color: '#3aaa6e' }]}>SONRASI</Text>{r.temiz_key ? <Image source={{ uri: mskSonrasiUrl(r.temiz_key) }} style={sm.img} /> : <View style={sm.img} />}</View>
                </View>
                <Text style={sm.buyutHint}>👆 Büyütmek için dokun</Text>
              </TouchableOpacity>
              <View style={sm.row}>
                <TouchableOpacity onPress={() => karar(r, false)} style={[sm.btn, sm.btnRed, { flex: 1 }]}><Text style={sm.btnRedTxt}>✕ Olmamış</Text></TouchableOpacity>
                <TouchableOpacity onPress={() => karar(r, true)} style={[sm.btn, sm.btnYesil, { flex: 1 }]}><Text style={sm.btnYesilTxt}>✓ Onayla</Text></TouchableOpacity>
              </View>
            </View>
          ); })()}

          {rows.some((r) => r.durum === 'hata') && <Text style={sm.hata}>Bazı işlemler başarısız oldu, tekrar deneyebilirsin.</Text>}

          <Text style={sm.secTitle}>Düzenlenecek fotoğrafı seç</Text>
          <View style={sm.grid}>
            {fotolar.map((k) => {
              const isleniyor = islenenKeys.has(k);
              const onayBekliyor = hazirKeys.has(k);
              const mesgul = isleniyor || onayBekliyor;
              return (
                <TouchableOpacity key={k} disabled={mesgul} activeOpacity={0.8}
                  onPress={() => { restoreScroll.current = true; setSecili(k); setSayi(0); setZoomMode(false); }}
                  style={[sm.thumbWrap, isleniyor && sm.thumbIsleniyor, onayBekliyor && sm.thumbHazir]}>
                  <Image source={{ uri: thumbUrl(k) }} style={sm.thumb} />
                  {isleniyor && <View style={sm.thumbBadge}><Text style={sm.thumbBadgeTxt}>⏳ İşleniyor…</Text></View>}
                  {onayBekliyor && <View style={[sm.thumbBadge, sm.thumbBadgeOnay]}><Text style={sm.thumbBadgeTxt}>✓ Onay bekliyor</Text></View>}
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      )}

      {/* Tam ekran inceleme */}
      {incele && hazir.length > 0 && (() => { const r = hazir[cur]; return (
        <View style={sm.fs}>
          <View style={sm.fsHead}>
            <Text style={sm.fsTitle}>İncele — {cur + 1}/{hazir.length}</Text>
            <TouchableOpacity onPress={() => setIncele(false)}><Text style={sm.close}>×</Text></TouchableOpacity>
          </View>
          <View style={sm.fsBody}>
            <View style={{ flex: 1 }}><Text style={sm.fsCap}>ÖNCESİ</Text><Image source={{ uri: mskOncesiUrl(r.foto_key) }} style={sm.fsImg} resizeMode="contain" /></View>
            <View style={{ flex: 1 }}><Text style={[sm.fsCap, { color: '#6ee7a8' }]}>SONRASI</Text>{r.temiz_key ? <Image source={{ uri: mskSonrasiUrl(r.temiz_key) }} style={sm.fsImg} resizeMode="contain" /> : null}</View>
          </View>
          {hazir.length > 1 && (
            <View style={sm.navRow}>
              <TouchableOpacity onPress={() => setIdx((i) => Math.max(0, i - 1))} disabled={cur === 0} style={[sm.navBtn, cur === 0 && sm.navOff]}><Text style={sm.navTxt}>‹ Önceki</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => setIdx((i) => Math.min(hazir.length - 1, i + 1))} disabled={cur >= hazir.length - 1} style={[sm.navBtn, cur >= hazir.length - 1 && sm.navOff]}><Text style={sm.navTxt}>Sonraki ›</Text></TouchableOpacity>
            </View>
          )}
          <View style={[sm.row, { padding: Spacing.lg }]}>
            <TouchableOpacity onPress={() => karar(r, false)} style={[sm.btn, { flex: 1, backgroundColor: 'rgba(229,57,53,0.28)' }]}><Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>✕ Olmamış</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => karar(r, true)} style={[sm.btn, { flex: 1, backgroundColor: '#3aaa6e' }]}><Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>✓ Olmuş</Text></TouchableOpacity>
          </View>
        </View>
      ); })()}
    </View>
  );
}

/* ======================= KIRP ======================= */
const CROP_HTML = `<!DOCTYPE html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no"/>
<style>
*{margin:0;padding:0;box-sizing:border-box;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}
html,body{width:100%;height:100%;background:#000;overflow:hidden}
#wrap{width:100%;height:100%;display:flex;align-items:center;justify-content:center;overflow:hidden}
#c{display:block;max-width:100%;max-height:100%;touch-action:none}
</style></head><body>
<div id="wrap"><canvas id="c"></canvas></div>
<script>
var img=new Image();
var canvas=document.getElementById('c'), ctx=canvas.getContext('2d');
var W=0,H=0, rect=null, drag=null, aspect=0;
function post(o){ if(window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(o)); }
img.onload=function(){ W=img.naturalWidth; H=img.naturalHeight; canvas.width=W; canvas.height=H; render(); post({type:'ready'}); };
img.onerror=function(){ post({type:'imgerror'}); };
img.src='__IMG__';
function render(){
  ctx.clearRect(0,0,W,H);
  if(img.complete) ctx.drawImage(img,0,0,W,H);
  if(!rect){ ctx.fillStyle='rgba(0,0,0,0.5)'; ctx.fillRect(0,0,W,H); return; }
  var r=rect;
  ctx.fillStyle='rgba(0,0,0,0.5)';
  ctx.fillRect(0,0,W,r.y);
  ctx.fillRect(0,r.y+r.h,W,H-(r.y+r.h));
  ctx.fillRect(0,r.y,r.x,r.h);
  ctx.fillRect(r.x+r.w,r.y,W-(r.x+r.w),r.h);
  ctx.strokeStyle='#E53935'; ctx.lineWidth=Math.max(2,W/400); ctx.strokeRect(r.x,r.y,r.w,r.h);
  ctx.strokeStyle='rgba(255,255,255,0.5)'; ctx.lineWidth=Math.max(1,W/800);
  for(var i=1;i<3;i++){
    ctx.beginPath(); ctx.moveTo(r.x+r.w*i/3,r.y); ctx.lineTo(r.x+r.w*i/3,r.y+r.h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(r.x,r.y+r.h*i/3); ctx.lineTo(r.x+r.w,r.y+r.h*i/3); ctx.stroke();
  }
}
function pos(e){ var b=canvas.getBoundingClientRect(); var t=e.touches&&e.touches[0]?e.touches[0]:e;
  return { x:(t.clientX-b.left)*(W/b.width), y:(t.clientY-b.top)*(H/b.height) }; }
function clamp(r){ var x=r.x,y=r.y,w=Math.min(r.w,W),h=Math.min(r.h,H);
  x=Math.max(0,Math.min(x,W-w)); y=Math.max(0,Math.min(y,H-h)); return {x:x,y:y,w:w,h:h}; }
function down(e){ e.preventDefault(); var p=pos(e); drag={sx:p.x,sy:p.y}; rect={x:p.x,y:p.y,w:0,h:0}; render(); }
function move(e){ if(!drag) return; e.preventDefault(); var p=pos(e);
  var dx=p.x-drag.sx, dy=p.y-drag.sy, w,h;
  if(aspect){ w=Math.abs(dx); h=w/aspect; } else { w=Math.abs(dx); h=Math.abs(dy); }
  var x=dx<0?drag.sx-w:drag.sx, y=dy<0?drag.sy-h:drag.sy;
  rect=clamp({x:x,y:y,w:w,h:h}); render();
}
function up(){ if(!drag) return; drag=null;
  if(rect&&(rect.w<8||rect.h<8)){ rect=null; render(); }
  post({type:'rect',has:!!rect});
}
canvas.addEventListener('touchstart',down,{passive:false});
canvas.addEventListener('touchmove',move,{passive:false});
canvas.addEventListener('touchend',up,{passive:false});
canvas.addEventListener('mousedown',down); canvas.addEventListener('mousemove',move); window.addEventListener('mouseup',up);
window.setAspect=function(r){ aspect=r||0; rect=null; render(); post({type:'rect',has:false}); };
window.clearRect2=function(){ rect=null; render(); post({type:'rect',has:false}); };
window.exportCrop=function(){ if(!rect){ post({type:'empty'}); return; }
  post({type:'crop',x:rect.x/W,y:rect.y/H,w:rect.w/W,h:rect.h/H}); };
</script></body></html>`;

const KIRP_ASPECTS: { label: string; r: number }[] = [
  { label: 'Serbest', r: 0 }, { label: '1:1', r: 1 }, { label: '4:3', r: 4 / 3 },
  { label: '3:4', r: 3 / 4 }, { label: '16:9', r: 16 / 9 }, { label: '9:16', r: 9 / 16 },
];

function KirpPane({ ilan, onChanged }: { ilan: Ilan; onChanged?: () => void }) {
  const fotolar = (ilan.fotograflar ?? []) as string[];
  const [secili, setSecili] = useState<string | null>(null);
  const [aspect, setAspect] = useState(0);
  const [varRect, setVarRect] = useState(false);
  const [kirpiliyor, setKirpiliyor] = useState(false);
  const webRef = useRef<WebView>(null);
  const seciliRef = useRef<string | null>(null);
  seciliRef.current = secili;

  const inject = (js: string) => webRef.current?.injectJavaScript(js + ';true;');
  const secAspect = (r: number) => { setAspect(r); setVarRect(false); inject(`window.setAspect(${r})`); };

  async function onMessage(data: string) {
    let m: any; try { m = JSON.parse(data); } catch { return; }
    if (m.type === 'rect') setVarRect(!!m.has);
    else if (m.type === 'empty') { setKirpiliyor(false); Alert.alert('Uyarı', 'Önce tutulacak alanı seç.'); }
    else if (m.type === 'imgerror') Alert.alert('Hata', 'Fotoğraf yüklenemedi.');
    else if (m.type === 'crop') {
      try {
        const crop: Crop = { x: m.x, y: m.y, w: m.w, h: m.h };
        await kirpUygula(ilan.id, seciliRef.current!, crop);
        onChanged?.();
        setSecili(null); setVarRect(false);
      } catch (e: any) { Alert.alert('Hata', e.message); }
      setKirpiliyor(false);
    }
  }

  function kirp() {
    if (!secili || !varRect || kirpiliyor) return;
    Alert.alert('Kırp', 'Fotoğraf kırpılacak. Orijinal boyut geri alınamaz. Devam?', [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Kırp', style: 'destructive', onPress: () => { setKirpiliyor(true); inject('window.exportCrop()'); } },
    ]);
  }

  if (!secili) {
    return (
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: Spacing.lg }}>
        <Text style={sm.secTitle}>Kırpılacak fotoğrafı seç</Text>
        {fotolar.length === 0 ? <Text style={sf.bos}>Fotoğraf yok.</Text> : (
          <View style={sm.grid}>
            {fotolar.map((k) => (
              <TouchableOpacity key={k} activeOpacity={0.8} onPress={() => { setSecili(k); setVarRect(false); setAspect(0); }} style={sm.thumbWrap}>
                <Image source={{ uri: thumbUrl(k) }} style={sm.thumb} />
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={sm.toolbar}>
        {KIRP_ASPECTS.map((a) => (
          <TouchableOpacity key={a.label} onPress={() => secAspect(a.r)} style={[sm.tbtn, aspect === a.r && sm.tbtnOn]}>
            <Text style={[sm.tbtnTxt, aspect === a.r && sm.tbtnTxtOn]}>{a.label}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity onPress={() => inject('window.clearRect2()')} disabled={!varRect} style={[sm.tbtn, !varRect && sm.tbtnDis]}><Text style={sm.tbtnTxt}>Temizle</Text></TouchableOpacity>
      </View>
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <WebView
          ref={webRef}
          originWhitelist={['*']}
          source={{ html: CROP_HTML.replace('__IMG__', kirpOncesiUrl(secili)) }}
          onMessage={(e) => onMessage(e.nativeEvent.data)}
          style={{ flex: 1, backgroundColor: '#000' }}
          scrollEnabled={false}
        />
      </View>
      <Text style={sm.hint}>Tutulacak alanı sürükleyerek seç (dışı atılır).</Text>
      <View style={sm.row}>
        <TouchableOpacity onPress={() => { setSecili(null); setVarRect(false); }} style={[sm.btn, sm.btnGri, { flex: 1 }]}><Text style={sm.btnGriTxt}>← Vazgeç</Text></TouchableOpacity>
        <TouchableOpacity onPress={kirp} disabled={!varRect || kirpiliyor} style={[sm.btn, (!varRect || kirpiliyor) ? sm.btnOff : sm.btnKirmizi, { flex: 2 }]}>
          {kirpiliyor ? <ActivityIndicator color="#fff" /> : <Text style={sm.btnKirmiziTxt}>Kırp</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const shell = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: Colors.surface },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.outlineVariant },
  title: { fontSize: 17, fontWeight: '700', color: Colors.onSurface },
  close: { fontSize: 20, color: Colors.onSurfaceVariant },
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: Colors.outlineVariant },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderBottomWidth: 3, borderBottomColor: 'transparent' },
  tabOn: { borderBottomColor: Colors.primary },
  tabTxt: { fontSize: 15, fontWeight: '700', color: Colors.onSurfaceVariant },
  tabTxtOn: { color: Colors.primary },
  badge: { minWidth: 20, height: 20, paddingHorizontal: 5, borderRadius: 10, backgroundColor: '#3aaa6e', alignItems: 'center', justifyContent: 'center' },
  badgeTxt: { color: '#fff', fontSize: 11, fontWeight: '800' },
});

const GAP = 6;
const sf = StyleSheet.create({
  progressBox: { backgroundColor: Colors.surfaceContainer, borderRadius: Radius.md, padding: Spacing.md, borderWidth: 1, borderColor: Colors.secondaryContainer },
  progressText: { fontSize: 13, fontWeight: '700', color: Colors.secondary, marginBottom: 6 },
  barBg: { height: 8, backgroundColor: Colors.surfaceContainerHighest, borderRadius: 4, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: Colors.secondary },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: Colors.onSurface },
  link: { fontSize: 13, fontWeight: '700', color: Colors.primary },
  card: { borderWidth: 1, borderColor: Colors.outlineVariant, borderRadius: Radius.md, padding: Spacing.sm },
  cap: { fontSize: 10, fontWeight: '700', color: Colors.onSurfaceVariant, marginBottom: 3 },
  img: { width: '100%', aspectRatio: 4 / 3, borderRadius: Radius.sm, backgroundColor: Colors.surfaceContainer },
  oncesiPh: { alignItems: 'center', justifyContent: 'center' },
  oncesiPhFs: { flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center', backgroundColor: '#1f2937', borderRadius: 6 },
  oncesiPhText: { color: '#9ca3af', fontSize: 12, fontWeight: '700', textAlign: 'center', paddingHorizontal: 8 },
  dokunHintRed: { fontSize: 12, color: Colors.primary, textAlign: 'center', marginTop: 8, fontWeight: '700' },
  fsWrap: { flex: 1, backgroundColor: '#0b0b0b' },
  fsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 44, paddingBottom: 10 },
  fsTitle: { color: '#fff', fontSize: 14, fontWeight: '700' },
  fsClose: { color: '#fff', fontSize: 22 },
  fsRow: { flex: 1, flexDirection: 'row', gap: 6, paddingHorizontal: 8, minHeight: 0 },
  fsCol: { flex: 1 },
  fsCap: { color: '#e5e7eb', fontSize: 11, fontWeight: '700', paddingVertical: 4 },
  fsHalf: { flex: 1, width: '100%', borderRadius: 6 },
  fsZoom: { flex: 1, width: '100%' },
  fsZoomC: { flexGrow: 1 },
  navRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 10 },
  navBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.14)' },
  navOff: { opacity: 0.3 },
  navTxt: { color: '#fff', fontSize: 14, fontWeight: '700' },
  fsBtnRow: { flexDirection: 'row', gap: 10, padding: 16, paddingBottom: 28 },
  fsBtn: { flex: 1, paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  fsRed: { backgroundColor: 'rgba(229,57,53,0.3)' },
  fsGreen: { backgroundColor: '#3aaa6e' },
  fsBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  onayHepsi: { backgroundColor: '#3aaa6e', paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.sm },
  onayHepsiText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  hataText: { fontSize: 12, color: Colors.error },
  bos: { fontSize: 13, color: Colors.onSurfaceVariant },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  thumbWrap: { width: '31.5%', aspectRatio: 1, borderRadius: Radius.sm, overflow: 'hidden', borderWidth: 2, borderColor: 'transparent' },
  thumbSel: { borderColor: Colors.primary },
  thumbTemiz: { borderColor: '#3aaa6e' },
  thumb: { width: '100%', height: '100%', backgroundColor: Colors.surfaceContainer },
  check: { position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  checkText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  temizBanner: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(58,170,110,0.92)', paddingVertical: 2, alignItems: 'center' },
  temizBannerText: { color: '#fff', fontWeight: '700', fontSize: 10 },
  ofisBox: { marginTop: Spacing.sm, backgroundColor: Colors.surfaceContainer, borderRadius: Radius.md, padding: Spacing.md, borderWidth: 1, borderColor: Colors.outlineVariant, gap: Spacing.sm },
  ofisLabel: { fontSize: 13, fontWeight: '600', color: Colors.onSurface, flex: 1 },
  ofisInput: { borderWidth: 1, borderColor: Colors.outline, borderRadius: Radius.sm, paddingHorizontal: 11, paddingVertical: 9, fontSize: 14, color: Colors.onSurface },
  ofisHint: { fontSize: 11, color: Colors.onSurfaceVariant },
  temizleBtn: { marginTop: Spacing.sm, backgroundColor: Colors.primary, paddingVertical: 13, borderRadius: Radius.md, alignItems: 'center' },
  temizleBtnOff: { backgroundColor: Colors.surfaceContainerHighest },
  temizleText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});

const sm = StyleSheet.create({
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
  kuyrukBox: { backgroundColor: 'rgba(16,185,129,0.15)', borderRadius: Radius.sm, padding: 12, marginBottom: 12 },
  kuyrukTxt: { color: '#10b981', fontWeight: '700', fontSize: 13 },
  hataBox: { backgroundColor: 'rgba(239,68,68,0.15)', borderRadius: Radius.sm, padding: 12, marginBottom: 12 },
  hataBoxTxt: { color: '#ef4444', fontWeight: '700', fontSize: 13 },
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
  thumbHazir: { borderWidth: 2, borderColor: '#3aaa6e' },
  thumbBadge: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  thumbBadgeOnay: { backgroundColor: 'rgba(58,170,110,0.55)' },
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
