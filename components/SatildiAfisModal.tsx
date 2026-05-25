import { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, Modal, Alert,
  StyleSheet, ActivityIndicator, Platform, KeyboardAvoidingView,
} from 'react-native';
import { WebView } from 'react-native-webview';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import R2Image from './R2Image';
import { getCachedPhoto } from '../lib/photoCache';
import { getMahalleGruplar } from '../constants/turkiye';
import { Colors } from '../constants/theme';
import type { Ilan } from '../types';

const FONTS = ['Allura', 'Sacramento', 'Great Vibes', 'Pinyon Script'] as const;
type Font = typeof FONTS[number];

function semtBul(il: string, ilce: string | null, mahalle: string | null): string | null {
  if (!ilce || !mahalle) return null;
  try {
    const gruplar = getMahalleGruplar(il, ilce);
    for (const g of gruplar) {
      if (g.semt && g.mahalleler.some(m => m.toLowerCase() === mahalle.toLowerCase())) return g.semt;
    }
  } catch { /* ignore */ }
  return null;
}

const HTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Allura&family=Great+Vibes&family=Sacramento&family=Pinyon+Script&family=Inter:wght@500;700&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:100%;height:100%;background:#0f172a;overflow:hidden}
#wrap{width:100%;height:100%;display:flex;align-items:center;justify-content:center}
canvas{display:block;max-width:100%;max-height:100%}
</style>
</head>
<body>
<div id="wrap"><canvas id="c" width="1080" height="1920"></canvas></div>
<script>
var W=1080,H=1920;
var canvas=document.getElementById('c');
var ctx=canvas.getContext('2d');
var state={ foto:null, yer:'', fiyat:'', font:'Allura' };
var loadedImg=null;
var loadedSrc=null;

function roundRect(x,y,w,h,r){
  ctx.beginPath();
  ctx.moveTo(x+r,y);
  ctx.arcTo(x+w,y,x+w,y+h,r);
  ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r);
  ctx.arcTo(x,y,x+w,y,r);
  ctx.closePath();
}

function loadImg(src){
  return new Promise(function(resolve,reject){
    if (loadedSrc===src && loadedImg){ resolve(loadedImg); return; }
    var img = new Image();
    img.onload = function(){ loadedImg=img; loadedSrc=src; resolve(img); };
    img.onerror = function(e){ reject(new Error('img load failed')); };
    img.src = src;
  });
}

function drawNow(){
  if (!state.foto || !loadedImg) return;
  var img = loadedImg;
  var bgScale = H / img.height;
  var bgW = img.width * bgScale;
  var bgX = (W - bgW) / 2;
  ctx.clearRect(0,0,W,H);
  ctx.save();
  ctx.filter = 'blur(8px) saturate(1.05)';
  ctx.drawImage(img, bgX, 0, bgW, H);
  ctx.restore();

  var grad = ctx.createRadialGradient(W/2,H/2, Math.min(W,H)*0.25, W/2, H/2, Math.sqrt((W/2)*(W/2)+(H/2)*(H/2)));
  grad.addColorStop(0,'rgba(0,0,0,0.15)');
  grad.addColorStop(1,'rgba(0,0,0,0.9)');
  ctx.fillStyle = grad;
  ctx.fillRect(0,0,W,H);

  var kartX=60, kartW = W-120;
  var kartH = kartW*(img.height/img.width);
  var kartY=(H-kartH)/2;
  ctx.drawImage(img, kartX, kartY, kartW, kartH);

  ctx.save();
  ctx.font='180px "'+state.font+'", cursive';
  ctx.fillStyle='#ffffff';
  ctx.textAlign='center';
  ctx.textBaseline='middle';
  ctx.shadowColor='rgba(0,0,0,0.6)';
  ctx.shadowBlur=20;
  ctx.shadowOffsetY=4;
  ctx.fillText('Satıldı', W/2, kartY+10);
  ctx.restore();

  var fiyatText = state.fiyat || '';
  ctx.font='700 54px Inter, sans-serif';
  var m=ctx.measureText(fiyatText);
  var padX=40,padY=18;
  var pillW=m.width+padX*2;
  var pillH=54+padY*2;
  var pillX=(W-pillW)/2;
  var pillY=kartY+kartH-pillH/2;
  ctx.fillStyle='rgba(20,20,20,0.95)';
  roundRect(pillX,pillY,pillW,pillH,14);
  ctx.fill();
  ctx.fillStyle='#ffffff';
  ctx.textAlign='center';
  ctx.textBaseline='middle';
  ctx.fillText(fiyatText, W/2, pillY+pillH/2);

  if (state.yer){
    ctx.font='500 44px Inter, sans-serif';
    ctx.fillStyle='#ffffff';
    ctx.shadowColor='rgba(0,0,0,0.5)';
    ctx.shadowBlur=8;
    ctx.fillText(state.yer, W/2, pillY+pillH+70);
  }
}

function loadAndDraw(){
  if (!state.foto) return Promise.resolve();
  return loadImg(state.foto).then(function(){
    var fontPromises = [];
    if (document.fonts && document.fonts.load){
      fontPromises.push(document.fonts.load('180px "'+state.font+'"'));
      fontPromises.push(document.fonts.load('700 54px Inter'));
      fontPromises.push(document.fonts.load('500 44px Inter'));
    }
    return Promise.all(fontPromises).then(drawNow, drawNow);
  });
}

window.setData = function(payload){
  var p = (typeof payload === 'string') ? JSON.parse(payload) : payload;
  state = Object.assign(state, p);
  loadAndDraw().catch(function(e){
    window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({type:'error',message:String(e)}));
  });
};

window.exportPng = function(){
  loadAndDraw().then(function(){
    try {
      var d = canvas.toDataURL('image/png');
      window.ReactNativeWebView.postMessage(JSON.stringify({type:'png',data:d}));
    } catch(e){
      window.ReactNativeWebView.postMessage(JSON.stringify({type:'error',message:String(e)}));
    }
  });
};

window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({type:'ready'}));
</script>
</body>
</html>`;

interface Props {
  ilan: Ilan;
  visible: boolean;
  onClose: () => void;
}

export default function SatildiAfisModal({ ilan, visible, onClose }: Props) {
  const fotos = ilan.fotograflar ?? [];
  const [seciliFoto, setSeciliFoto] = useState<string | null>(fotos[0] ?? null);
  const ilkSemt = semtBul(ilan.konum, ilan.ilce, ilan.mahalle);
  const [yer, setYer] = useState(() => {
    if (ilkSemt && ilan.mahalle) return `${ilkSemt}, ${ilan.mahalle}`;
    return [ilan.ilce, ilan.mahalle].filter(Boolean).join(', ');
  });
  const [fiyatStr, setFiyatStr] = useState(() => `${Number(ilan.fiyat).toLocaleString('tr-TR')} ₺`);
  const [font, setFont] = useState<Font>('Allura');
  const [fotoDataUrl, setFotoDataUrl] = useState<string | null>(null);
  const [hazirlaniyor, setHazirlaniyor] = useState(false);
  const [indiriliyor, setIndiriliyor] = useState(false);
  const [webviewHazir, setWebviewHazir] = useState(false);
  const webviewRef = useRef<WebView>(null);

  useEffect(() => {
    let iptal = false;
    if (!seciliFoto) { setFotoDataUrl(null); return; }
    setHazirlaniyor(true);
    (async () => {
      try {
        const localPath = await getCachedPhoto(seciliFoto, 'lg');
        const base64 = await FileSystem.readAsStringAsync(localPath, { encoding: FileSystem.EncodingType.Base64 });
        if (iptal) return;
        setFotoDataUrl(`data:image/jpeg;base64,${base64}`);
      } catch (e: any) {
        if (!iptal) Alert.alert('Hata', 'Fotoğraf yüklenemedi: ' + (e?.message ?? ''));
      } finally {
        if (!iptal) setHazirlaniyor(false);
      }
    })();
    return () => { iptal = true; };
  }, [seciliFoto]);

  useEffect(() => {
    if (!webviewHazir || !fotoDataUrl) return;
    const payload = { foto: fotoDataUrl, yer, fiyat: fiyatStr, font };
    const js = `window.setData(${JSON.stringify(JSON.stringify(payload))}); true;`;
    webviewRef.current?.injectJavaScript(js);
  }, [webviewHazir, fotoDataUrl, yer, fiyatStr, font]);

  function fiyatChange(v: string) {
    const sayi = v.replace(/[^\d]/g, '');
    if (!sayi) { setFiyatStr(''); return; }
    setFiyatStr(`${Number(sayi).toLocaleString('tr-TR')} ₺`);
  }

  function onMessage(e: any) {
    try {
      const msg = JSON.parse(e.nativeEvent.data);
      if (msg.type === 'ready') {
        setWebviewHazir(true);
      } else if (msg.type === 'png') {
        const dataUrl: string = msg.data;
        const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
        savePng(base64);
      } else if (msg.type === 'error') {
        setIndiriliyor(false);
        Alert.alert('Hata', msg.message ?? 'Bilinmeyen hata');
      }
    } catch { /* ignore */ }
  }

  async function savePng(base64: string) {
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('İzin Gerekli', 'Galeriye kaydetmek için izin gerekli.');
        setIndiriliyor(false); return;
      }
      const dir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory!;
      const fileUri = dir + `satildi_${ilan.portfoy_no ?? ilan.id}_${Date.now()}.png`;
      await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: FileSystem.EncodingType.Base64 });
      await MediaLibrary.saveToLibraryAsync(fileUri);
      setIndiriliyor(false);
      Alert.alert('Kaydedildi', 'Satıldı afişi galeriye kaydedildi.');
    } catch (e: any) {
      setIndiriliyor(false);
      Alert.alert('Hata', e?.message ?? 'Kaydedilemedi');
    }
  }

  function indir() {
    if (!fotoDataUrl) return;
    setIndiriliyor(true);
    webviewRef.current?.injectJavaScript('window.exportPng(); true;');
  }

  const indirDisabled = !seciliFoto || indiriliyor || hazirlaniyor || !webviewHazir || !fotoDataUrl;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={styles.overlay}>
          <TouchableOpacity style={styles.dimmer} activeOpacity={1} onPress={onClose} />
          <View style={styles.panel}>
            <View style={styles.header}>
              <TouchableOpacity onPress={onClose} style={{ width: 32 }}>
                <Text style={styles.kapat}>✕</Text>
              </TouchableOpacity>
              <Text style={styles.baslik}>🏷 Satıldı Afişi</Text>
              <View style={{ width: 32 }} />
            </View>

            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
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
                />
                {hazirlaniyor && (
                  <View style={styles.previewOverlay}>
                    <ActivityIndicator color="#fff" />
                  </View>
                )}
              </View>

              <Text style={styles.label}>Fotoğraf seçin</Text>
              {fotos.length === 0 ? (
                <View style={styles.empty}><Text style={styles.emptyText}>Bu ilanda fotoğraf yok</Text></View>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
                  {fotos.map(f => (
                    <TouchableOpacity
                      key={f}
                      onPress={() => setSeciliFoto(f)}
                      style={[styles.thumb, f === seciliFoto && styles.thumbAktif]}
                    >
                      <R2Image source={f} style={{ width: '100%', height: '100%' }} resizeMode="cover" size="sm" />
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}

              <Text style={[styles.label, { marginTop: 16 }]}>Konum (ilçe, semt/mahalle)</Text>
              <TextInput value={yer} onChangeText={setYer} placeholder="Örn: Özdere, Çukuraltı" style={styles.input} placeholderTextColor="#9ca3af" />

              <Text style={[styles.label, { marginTop: 12 }]}>Fiyat</Text>
              <TextInput value={fiyatStr} onChangeText={fiyatChange} placeholder="Örn: 11.500.000 ₺" style={styles.input} placeholderTextColor="#9ca3af" keyboardType="numbers-and-punctuation" />

              <Text style={[styles.label, { marginTop: 12 }]}>"Satıldı" yazı stili</Text>
              <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                {FONTS.map(f => (
                  <TouchableOpacity key={f} onPress={() => setFont(f)} style={[styles.fontChip, font === f && styles.fontChipAktif]}>
                    <Text style={[styles.fontChipText, font === f && styles.fontChipTextAktif]}>{f}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity
                onPress={indir}
                disabled={indirDisabled}
                style={[styles.indirBtn, indirDisabled && { opacity: 0.5 }]}
              >
                <Text style={styles.indirBtnText}>{indiriliyor ? 'Hazırlanıyor...' : 'Galeriye Kaydet (PNG)'}</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  dimmer: { ...StyleSheet.absoluteFillObject },
  panel: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, height: '92%' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  baslik: { fontSize: 16, fontWeight: '700', color: '#111' },
  kapat: { fontSize: 22, color: '#6b7280' },
  previewWrap: { aspectRatio: 9 / 16, backgroundColor: '#0f172a', borderRadius: 12, overflow: 'hidden', marginBottom: 16 },
  preview: { flex: 1, backgroundColor: '#0f172a' },
  previewOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.3)' },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 8 },
  empty: { padding: 24, backgroundColor: '#f9fafb', borderRadius: 8, alignItems: 'center' },
  emptyText: { color: '#9ca3af', fontSize: 13 },
  thumb: { width: 64, height: 64, borderRadius: 8, overflow: 'hidden', borderWidth: 3, borderColor: 'transparent' },
  thumbAktif: { borderColor: Colors.primary },
  input: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, padding: 10, fontSize: 14, color: '#111' },
  fontChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 9999, borderWidth: 1.5, borderColor: '#e5e7eb', backgroundColor: '#fff' },
  fontChipAktif: { borderColor: Colors.primary, backgroundColor: 'rgba(0,35,111,0.08)' },
  fontChipText: { fontSize: 12, fontWeight: '600', color: '#6b7280' },
  fontChipTextAktif: { color: Colors.primary },
  indirBtn: { marginTop: 20, backgroundColor: Colors.primary, borderRadius: 8, padding: 14, alignItems: 'center' },
  indirBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
