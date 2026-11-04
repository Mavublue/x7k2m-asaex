import { useState } from 'react';
import { View, Text, Image, TouchableOpacity, Linking, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { Colors, Radius, Spacing } from '../constants/theme';
import { youtubeId } from '../lib/youtube';

// YouTube, referrer'sız gömmeyi reddediyor (Hata 153): iframe https origin'li html içinde açılır
function playerHtml(id: string) {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;height:100%;background:#000}iframe{width:100%;height:100%;border:0;display:block}</style></head><body><iframe src="https://www.youtube-nocookie.com/embed/${id}?autoplay=1&playsinline=1&rel=0" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></body></html>`;
}

// Tıklanana kadar sadece kapak görseli: WebView açılmaz, video oynamaz
export default function YoutubeVideo({ url }: { url: string | null | undefined }) {
  const [oynat, setOynat] = useState(false);
  const id = youtubeId(url);
  if (!id) return null;
  return (
    <View>
      <View style={styles.kutu}>
        {oynat ? (
          <WebView
            source={{ html: playerHtml(id), baseUrl: 'https://frexa.com.tr' }}
            originWhitelist={['*']}
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            allowsFullscreenVideo
            style={styles.player}
          />
        ) : (
          <TouchableOpacity style={styles.kapak} activeOpacity={0.85} onPress={() => setOynat(true)}>
            <Image source={{ uri: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            <View style={styles.rozet}><Text style={styles.rozetText}>▶ Videoyu İzle</Text></View>
          </TouchableOpacity>
        )}
      </View>
      <TouchableOpacity onPress={() => Linking.openURL(`https://www.youtube.com/watch?v=${id}`)}>
        <Text style={styles.link}>YouTube'da Aç</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  kutu: { width: '100%', aspectRatio: 16 / 9, borderRadius: Radius.md, overflow: 'hidden', backgroundColor: '#000' },
  player: { flex: 1, backgroundColor: '#000' },
  kapak: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  rozet: { backgroundColor: 'rgba(0,0,0,0.72)', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 24 },
  rozetText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  link: { fontSize: 13, color: Colors.onSurfaceVariant, marginTop: Spacing.sm, textAlign: 'right' },
});
