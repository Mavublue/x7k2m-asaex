import { useEffect, useState, useCallback, useRef } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, ScrollView, Image, Dimensions,
} from 'react-native';

const { width: SCREEN_W } = Dimensions.get('window');
const POPUP_W = 290;
import { router, useFocusEffect } from 'expo-router';
import { WebView } from 'react-native-webview';
import { supabase } from '../../lib/supabase';
import { Colors, Radius, Spacing } from '../../constants/theme';
import { Ilan } from '../../types';

function buildHtml(ilanlar: Ilan[]) {
  const markers = ilanlar
    .filter(i => i.lat && i.lng)
    .map(i => ({
      id: i.id,
      lat: i.lat,
      lng: i.lng,
      fiyat: i.fiyat >= 1_000_000
      ? (i.fiyat / 1_000_000).toFixed(1) + 'M'
      : i.fiyat >= 1_000
        ? Math.round(i.fiyat / 1_000) + 'K'
        : String(i.fiyat),
      baslik: i.baslik.replace(/'/g, "\\'"),
      tip: i.tip,
    }));

  const markersJson = JSON.stringify(markers);
  const merkez = markers.length > 0
    ? `[${markers[0].lat}, ${markers[0].lng}]`
    : '[39.925, 32.836]';
  const zoom = markers.length > 0 ? 13 : 6;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"/>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
  <link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css"/>
  <link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css"/>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script src="https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { width: 100vw; height: 100vh; overflow: hidden; }
    #map { width: 100%; height: 100%; }
    .pm {
      background: #6750A4;
      color: #fff;
      border-radius: 20px;
      padding: 5px 10px;
      font-weight: 700;
      font-size: 11px;
      white-space: nowrap;
      box-shadow: 0 3px 10px rgba(0,0,0,0.35);
      border: 2px solid #fff;
      cursor: pointer;
    }
    .pm.kiralik { background: #4e5ba6; }
    .leaflet-control-attribution { font-size: 9px; }
    .marker-cluster-small, .marker-cluster-medium, .marker-cluster-large {
      background-color: rgba(103,80,164,0.25);
    }
    .marker-cluster-small div, .marker-cluster-medium div, .marker-cluster-large div {
      background-color: rgba(103,80,164,0.85);
      color: #fff;
      font-weight: 700;
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var map = L.map('map', { zoomControl: true }).setView(${merkez}, ${zoom});
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19
    }).addTo(map);

    var cluster = L.markerClusterGroup({ maxClusterRadius: 40 });
    var markers = ${markersJson};
    var bounds = [];

    markers.forEach(function(m) {
      var cls = m.tip === 'Kiralık' ? 'pm kiralik' : 'pm';
      var icon = L.divIcon({
        html: '<div class="' + cls + '">₺' + m.fiyat + '</div>',
        className: '',
        iconSize: null,
        iconAnchor: [28, 16]
      });
      var marker = L.marker([m.lat, m.lng], { icon: icon });
      marker.on('click', function(e) {
        var pt = map.latLngToContainerPoint(e.latlng);
        window.ReactNativeWebView.postMessage(JSON.stringify({ id: m.id, px: pt.x, py: pt.y }));
      });
      cluster.addLayer(marker);
      bounds.push([m.lat, m.lng]);
    });

    map.addLayer(cluster);

    if (bounds.length > 1) {
      map.fitBounds(bounds, { padding: [40, 40] });
    }
  </script>
</body>
</html>`;
}

export default function HaritaScreen() {
  const [ilanlar, setIlanlar] = useState<Ilan[]>([]);
  const [tumIlanlar, setTumIlanlar] = useState<Ilan[]>([]);
  const [secili, setSecili] = useState<Ilan | null>(null);
  const [popupPos, setPopupPos] = useState<{ x: number; y: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [html, setHtml] = useState('');
  const webRef = useRef<WebView>(null);

  const fetchIlanlar = useCallback(async () => {
    const { data } = await supabase.from('ilanlar').select('*').order('olusturma_tarihi', { ascending: false });
    if (data) {
      const hepsini = data as Ilan[];
      const koordinatlilar = hepsini.filter(i => i.lat && i.lng);
      setTumIlanlar(hepsini);
      setIlanlar(koordinatlilar);
      setHtml(buildHtml(koordinatlilar));
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchIlanlar(); }, []);
  useFocusEffect(useCallback(() => { fetchIlanlar(); }, [fetchIlanlar]));

  function handleMessage(event: any) {
    try {
      const { id, px, py } = JSON.parse(event.nativeEvent.data);
      const bulunan = ilanlar.find(i => i.id === id);
      if (bulunan) { setSecili(bulunan); setPopupPos({ x: px, y: py }); }
    } catch {}
  }

  function konumaGit(ilan: Ilan) {
    if (!ilan.lat || !ilan.lng) return;
    const js = `map.flyTo([${ilan.lat}, ${ilan.lng}], 15, { duration: 1 });`;
    webRef.current?.injectJavaScript(js);
    setSecili(ilan);
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Harita */}
      <View style={styles.mapContainer}>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={Colors.primary} />
          </View>
        ) : html ? (
          <WebView
            ref={webRef}
            source={{ html }}
            style={styles.map}
            onMessage={handleMessage}
            javaScriptEnabled
            domStorageEnabled
            originWhitelist={['*']}
            mixedContentMode="always"
          />
        ) : (
          <View style={styles.center}>
            <Text style={styles.noMapText}>🗺️</Text>
            <Text style={styles.noMapSubText}>İlan eklerken enlem/boylam{'\n'}girerseniz haritada görünür</Text>
          </View>
        )}

        {/* Seçili ilan popup */}
        {secili && popupPos && (() => {
          const POPUP_H = 96;
          const rawTop = popupPos.y - POPUP_H - 18;
          const top = rawTop > 60 ? rawTop : popupPos.y + 18;
          const left = Math.max(8, Math.min(SCREEN_W - POPUP_W - 8, popupPos.x - POPUP_W / 2));
          return (
            <TouchableOpacity style={[styles.popup, { top, left, width: POPUP_W }]} onPress={() => router.push(`/ilan/${secili.id}` as any)} activeOpacity={0.9}>
              {secili.fotograflar?.[0] ? (
                <Image source={{ uri: secili.fotograflar[0] }} style={styles.popupFoto} resizeMode="cover" />
              ) : (
                <View style={[styles.popupFoto, styles.popupFotoPlaceholder]}>
                  <Text style={{ fontSize: 24 }}>🏠</Text>
                </View>
              )}
              <View style={styles.popupInfo}>
                <Text style={styles.popupBaslik} numberOfLines={1}>{secili.baslik}</Text>
                <Text style={styles.popupKonum} numberOfLines={1}>📍 {secili.konum}{secili.ilce ? `, ${secili.ilce}` : ''}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                  <Text style={styles.popupFiyat}>₺{secili.fiyat.toLocaleString('tr-TR')}</Text>
                  <View style={styles.popupKategori}><Text style={styles.popupKategoriText}>{secili.kategori}</Text></View>
                </View>
              </View>
              <TouchableOpacity style={styles.popupKapat} onPress={() => { setSecili(null); setPopupPos(null); }}>
                <Text style={styles.popupKapatText}>✕</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          );
        })()}
      </View>

      {/* Alt panel */}
      <View style={styles.bottomPanel}>
        <View style={styles.panelHandle} />
        <Text style={styles.panelTitle}>
          {ilanlar.length > 0
            ? `${ilanlar.length} ilan haritada · ${tumIlanlar.length - ilanlar.length} konum yok`
            : 'Haritada gösterilecek ilan yok'}
        </Text>

        {tumIlanlar.length === 0 ? (
          <Text style={styles.emptyText}>Henüz ilan eklenmedi</Text>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.kartlar}>
            {tumIlanlar.map(ilan => (
              <TouchableOpacity
                key={ilan.id}
                style={[styles.miniKart, (!ilan.lat || !ilan.lng) && styles.miniKartSoluk]}
                onPress={() => ilan.lat && ilan.lng ? konumaGit(ilan) : router.push(`/ilan/${ilan.id}` as any)}
              >
                {ilan.fotograflar?.[0] ? (
                  <Image source={{ uri: ilan.fotograflar[0] }} style={styles.miniKartFoto} resizeMode="cover" />
                ) : (
                  <View style={[styles.miniKartFoto, styles.miniKartFotoPlaceholder]}>
                    <Text style={{ fontSize: 20 }}>🏠</Text>
                  </View>
                )}
                <View style={styles.miniKartInfo}>
                  <Text style={styles.miniBaslik} numberOfLines={1}>{ilan.baslik}</Text>
                  <Text style={styles.miniKonum} numberOfLines={1}>{ilan.konum}{ilan.ilce ? `, ${ilan.ilce}` : ''}</Text>
                  <Text style={styles.miniFiyat}>₺{(ilan.fiyat / 1_000_000).toFixed(1)}M</Text>
                </View>
                {(!ilan.lat || !ilan.lng) && (
                  <View style={styles.konumYok}>
                    <Text style={styles.konumYokText}>Konum yok</Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  mapContainer: { flex: 1 },
  map: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  noMapText: { fontSize: 52 },
  noMapSubText: { fontSize: 14, color: Colors.onSurfaceVariant, textAlign: 'center', lineHeight: 22 },

  popup: {
    position: 'absolute',
    backgroundColor: '#fff',
    borderRadius: Radius.xl,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 12,
  },
  popupFoto: { width: 88, height: 88 },
  popupFotoPlaceholder: { backgroundColor: Colors.surfaceContainerLow, alignItems: 'center', justifyContent: 'center' },
  popupInfo: { flex: 1, padding: Spacing.md },
  popupBaslik: { fontSize: 13, fontWeight: '700', color: Colors.onSurface },
  popupKonum: { fontSize: 11, color: Colors.onSurfaceVariant, marginTop: 2 },
  popupFiyat: { fontSize: 15, fontWeight: '700', color: Colors.primary },
  popupKategori: { backgroundColor: Colors.primaryFixed, borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 2 },
  popupKategoriText: { fontSize: 10, color: Colors.primary, fontWeight: '600' },
  popupKapat: { padding: Spacing.md },
  popupKapatText: { fontSize: 16, color: Colors.onSurfaceVariant },

  bottomPanel: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.lg,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -4 },
    elevation: 8,
  },
  panelHandle: { width: 36, height: 4, backgroundColor: Colors.outlineVariant, borderRadius: 2, alignSelf: 'center', marginBottom: Spacing.md },
  panelTitle: { fontSize: 13, fontWeight: '600', color: Colors.onSurfaceVariant, paddingHorizontal: Spacing.xl, marginBottom: Spacing.md },
  emptyText: { fontSize: 13, color: Colors.onSurfaceVariant, paddingHorizontal: Spacing.xl },

  kartlar: { paddingHorizontal: Spacing.xl, gap: Spacing.md },
  miniKart: {
    width: 180,
    backgroundColor: Colors.surfaceContainerLow,
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },
  miniKartSoluk: { opacity: 0.6 },
  miniKartFoto: { width: '100%', height: 90 },
  miniKartFotoPlaceholder: { backgroundColor: Colors.surfaceContainerHigh, alignItems: 'center', justifyContent: 'center' },
  miniKartInfo: { padding: Spacing.sm },
  miniBaslik: { fontSize: 12, fontWeight: '700', color: Colors.onSurface },
  miniKonum: { fontSize: 10, color: Colors.onSurfaceVariant, marginTop: 2 },
  miniFiyat: { fontSize: 13, fontWeight: '700', color: Colors.primary, marginTop: 4 },
  konumYok: { position: 'absolute', top: 6, right: 6, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: Radius.full, paddingHorizontal: 6, paddingVertical: 2 },
  konumYokText: { fontSize: 9, color: '#fff', fontWeight: '600' },
});
