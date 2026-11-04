import { useState } from 'react';
import { View, Text, Image, Modal, TouchableOpacity, Linking, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { Radius } from '../constants/theme';
import { youtubeId } from '../lib/youtube';
import R2Image from './R2Image';

// YouTube, referrer'sız gömmeyi reddediyor (Hata 153): iframe https origin'li html içinde açılır
function playerHtml(id: string) {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;height:100%;background:#000}iframe{width:100%;height:100%;border:0;display:block}</style></head><body><iframe src="https://www.youtube-nocookie.com/embed/${id}?autoplay=1&playsinline=1&rel=0" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></body></html>`;
}

// Kapakta ilan fotoğrafı; tıklanana kadar WebView açılmaz. Oynat → tam ekran pencere, kapat → video durur.
export default function YoutubeVideo({ url, kapak }: { url: string | null | undefined; kapak?: string | null }) {
  const [acik, setAcik] = useState(false);
  const id = youtubeId(url);
  if (!id) return null;
  return (
    <>
      <TouchableOpacity style={styles.kutu} activeOpacity={0.85} onPress={() => setAcik(true)}>
        {kapak
          ? <R2Image source={kapak} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
          : <Image source={{ uri: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` }} style={StyleSheet.absoluteFill} resizeMode="cover" />}
        <View style={styles.rozet}><Text style={styles.rozetText}>▶ Videoyu İzle</Text></View>
      </TouchableOpacity>
      <Modal visible={acik} animationType="fade" supportedOrientations={['portrait', 'landscape']} onRequestClose={() => setAcik(false)}>
        <SafeAreaView style={styles.modal}>
          <View style={styles.modalUst}>
            <TouchableOpacity onPress={() => Linking.openURL(`https://www.youtube.com/watch?v=${id}`)}>
              <Text style={styles.link}>YouTube'da Aç</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.kapat} onPress={() => setAcik(false)}>
              <Text style={styles.kapatText}>✕</Text>
            </TouchableOpacity>
          </View>
          {acik && (
            <WebView
              source={{ html: playerHtml(id), baseUrl: 'https://frexa.com.tr' }}
              originWhitelist={['*']}
              allowsInlineMediaPlayback
              mediaPlaybackRequiresUserAction={false}
              allowsFullscreenVideo
              style={styles.player}
            />
          )}
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  kutu: { width: '100%', aspectRatio: 16 / 9, borderRadius: Radius.md, overflow: 'hidden', backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  rozet: { backgroundColor: 'rgba(0,0,0,0.72)', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 24 },
  rozetText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  modal: { flex: 1, backgroundColor: '#000' },
  modalUst: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 8 },
  link: { color: '#fff', fontSize: 13, fontWeight: '600' },
  kapat: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },
  kapatText: { color: '#fff', fontSize: 18 },
  player: { flex: 1, backgroundColor: '#000' },
});
