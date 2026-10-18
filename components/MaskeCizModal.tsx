import { useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Modal, Alert, StyleSheet, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import { Colors, Radius, Spacing } from '../constants/theme';
import { maskeBaslat, oncesiUrl } from '../lib/maskesil';
import { DRAW_HTML } from './FotoTemizleModal';

type Tool = 'rect' | 'brush' | 'eraser';

// Galeri fullscreen'de tek foto için hızlı "Maske ile Sil" çizim ekranı.
// Onay akışı YOK — çiz + Gönder → arka planda MAT. Onay normal Fotoğraf Temizle'den.
export default function MaskeCizModal({ visible, ilanId, fotoKey, onClose, onGonderildi }: {
  visible: boolean; ilanId: string; fotoKey: string; onClose: () => void; onGonderildi?: () => void;
}) {
  const webRef = useRef<WebView>(null);
  const [tool, setTool] = useState<Tool>('rect');
  const [brush, setBrush] = useState(32);
  const [zoomMode, setZoomMode] = useState(false);
  const [sayi, setSayi] = useState(0);
  const [gonderiliyor, setGonderiliyor] = useState(false);

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
        await maskeBaslat(ilanId, fotoKey, m.data);
        setGonderiliyor(false);
        onGonderildi?.();
        kapat(); // galeri açık kalır, foto arka planda işlenir
        return;
      } catch (e: any) { Alert.alert('Hata', e.message); }
      setGonderiliyor(false);
    }
  }

  function gonder() {
    if (!sayi || gonderiliyor) return;
    setGonderiliyor(true);
    inject('window.exportMask()');
  }

  function kapat() {
    setSayi(0); setTool('rect'); setZoomMode(false); setGonderiliyor(false);
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={kapat}>
      <View style={st.wrap}>
        <View style={st.toolbar}>
          {(['rect', 'brush', 'eraser'] as Tool[]).map((t) => (
            <TouchableOpacity key={t} onPress={() => secTool(t)} style={[st.tbtn, tool === t && st.tbtnOn]}>
              <Text style={[st.tbtnTxt, tool === t && st.tbtnTxtOn]}>{t === 'rect' ? '▭' : t === 'brush' ? '🖌' : '🧽'}</Text>
            </TouchableOpacity>
          ))}
          {!zoomMode && (tool === 'brush' || tool === 'eraser') && [16, 32, 64].map((n) => (
            <TouchableOpacity key={n} onPress={() => secBrush(n)} style={[st.tbtn, brush === n && st.tbtnOn]}>
              <Text style={[st.tbtnTxt, brush === n && st.tbtnTxtOn]}>{n === 16 ? 'İnce' : n === 32 ? 'Orta' : 'Kalın'}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity onPress={secZoom} style={[st.tbtn, zoomMode && st.tbtnOn]}><Text style={[st.tbtnTxt, zoomMode && st.tbtnTxtOn]}>🔍</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => inject('window.undo()')} disabled={!sayi} style={[st.tbtn, !sayi && st.tbtnDis]}><Text style={st.tbtnTxt}>↩</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => inject('window.clearAll()')} disabled={!sayi} style={[st.tbtn, !sayi && st.tbtnDis]}><Text style={st.tbtnTxt}>Temizle</Text></TouchableOpacity>
        </View>
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          {fotoKey ? (
            <WebView
              ref={webRef}
              originWhitelist={['*']}
              source={{ html: DRAW_HTML.replace('__IMG__', oncesiUrl(fotoKey)) }}
              onMessage={(e) => onMessage(e.nativeEvent.data)}
              style={{ flex: 1, backgroundColor: '#000' }}
              scrollEnabled={false}
            />
          ) : null}
        </View>
        <Text style={st.hint}>Silmek istediğin alan(lar)ı işaretle. İki parmakla yakınlaştır; 🔍 ile kaydır.</Text>
        <View style={st.row}>
          <TouchableOpacity onPress={kapat} style={[st.btn, st.btnGri, { flex: 1 }]}><Text style={st.btnGriTxt}>← Vazgeç</Text></TouchableOpacity>
          <TouchableOpacity onPress={gonder} disabled={!sayi || gonderiliyor} style={[st.btn, (!sayi || gonderiliyor) ? st.btnOff : st.btnKirmizi, { flex: 2 }]}>
            {gonderiliyor ? <ActivityIndicator color="#fff" /> : <Text style={st.btnKirmiziTxt}>🩹 Gönder{sayi ? ` (${sayi})` : ''}</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: Colors.background, paddingTop: 44 },
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: Spacing.md, paddingVertical: 8, alignItems: 'center' },
  tbtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radius.sm, backgroundColor: Colors.surfaceContainerLow },
  tbtnOn: { backgroundColor: Colors.primary },
  tbtnDis: { opacity: 0.4 },
  tbtnTxt: { fontSize: 14, fontWeight: '700', color: Colors.onSurface },
  tbtnTxtOn: { color: '#fff' },
  hint: { fontSize: 12, color: Colors.onSurfaceVariant, textAlign: 'center', paddingVertical: 8, paddingHorizontal: Spacing.lg },
  row: { flexDirection: 'row', gap: 10, paddingHorizontal: Spacing.lg, paddingBottom: 28, paddingTop: 4 },
  btn: { paddingVertical: 14, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  btnGri: { backgroundColor: Colors.surfaceContainerLow },
  btnGriTxt: { fontSize: 14, fontWeight: '700', color: Colors.onSurface },
  btnKirmizi: { backgroundColor: Colors.primary },
  btnKirmiziTxt: { fontSize: 15, fontWeight: '700', color: '#fff' },
  btnOff: { backgroundColor: Colors.surfaceContainerLow, opacity: 0.6 },
});
