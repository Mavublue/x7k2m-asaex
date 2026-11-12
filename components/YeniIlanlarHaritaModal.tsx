import { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, Modal, FlatList, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { router } from 'expo-router';
import { supabase } from '../lib/supabase';
import { Colors, Radius, Spacing } from '../constants/theme';
import R2Image from './R2Image';

type YeniIlan = { id: string; baslik: string; fiyat: number; tip: string; ilce: string | null; mahalle: string | null; fotograflar: string[] | null; portfoy_no: string | null; olusturma_tarihi: string; lat: number | null; lng: number | null; musteri_gizle: boolean | null };

function kisaFiyat(f: number) {
  return f >= 1_000_000 ? (f / 1_000_000).toFixed(1) + 'M' : f >= 1_000 ? Math.round(f / 1_000) + 'K' : String(f);
}

function buildMap(markers: { id: string; lat: number; lng: number; fiyat: string; tip: string; acik: boolean }[]) {
  return `<!DOCTYPE html><html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script src="https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js"></script>
<style>*{margin:0;padding:0;box-sizing:border-box}body,#map{width:100vw;height:100vh;overflow:hidden;background:#000}
.pm{background:#E53935;color:#fff;border-radius:20px;padding:4px 9px;font-weight:700;font-size:11px;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,.3);border:2px solid #fff;font-family:sans-serif}
.pm.k{background:#4e5ba6}.pm.acik{border-color:#16a34a;border-width:3px;box-shadow:0 0 0 2px rgba(22,163,74,.35),0 2px 8px rgba(0,0,0,.3)}.leaflet-control-attribution{font-size:8px}
.marker-cluster-small,.marker-cluster-medium,.marker-cluster-large{background-color:rgba(229,57,53,.2)}
.marker-cluster-small div,.marker-cluster-medium div,.marker-cluster-large div{background-color:rgba(229,57,53,.8);color:#fff;font-weight:700}
</style>
</head>
<body><div id="map"></div>
<script>
var map=L.map('map',{zoomControl:false,maxZoom:18}).setView([39.925,32.836],6);
var osm=L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,attribution:'© OSM'});var esri=L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxZoom:18,attribution:'© Esri'});esri.addTo(map);L.control.layers({'Uydu':esri,'Sokak':osm},null,{position:'topright'}).addTo(map);
var cluster=L.markerClusterGroup({maxClusterRadius:40,spiderfyOnMaxZoom:true,showCoverageOnHover:false});
map.addLayer(cluster);
var ms=${JSON.stringify(markers)};var bs=[];
ms.forEach(function(m){
  var icon=L.divIcon({html:'<div class="pm'+(m.tip==='Kiralık'?' k':'')+(m.acik?' acik':'')+'">₺'+m.fiyat+'</div>',className:'',iconSize:null,iconAnchor:[28,16]});
  var mk=L.marker([m.lat,m.lng],{icon:icon});
  mk.on('click',function(){window.ReactNativeWebView.postMessage(JSON.stringify({id:m.id}));});
  cluster.addLayer(mk);bs.push([m.lat,m.lng]);
});
if(bs.length>1){map.fitBounds(bs,{padding:[40,40]});}else if(bs.length){map.setView(bs[0],14);}
</script></body></html>`;
}

// Müşteriye son gönderilen ilan/listeden sonra eklenen aktif ilanları haritada gösterir.
export default function YeniIlanlarHaritaModal({ musteriId, visible, onClose }: { musteriId: string; visible: boolean; onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [sonTarih, setSonTarih] = useState<string | null>(null);
  const [ilanlar, setIlanlar] = useState<YeniIlan[]>([]);
  const [secili, setSecili] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setLoading(true); setSecili(null);
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setLoading(false); return; }
      const { data: son } = await supabase.from('musteri_paylasim_gecmisi')
        .select('paylasildigi_tarih').eq('musteri_id', musteriId)
        .order('paylasildigi_tarih', { ascending: false }).limit(1).maybeSingle();
      if (!son?.paylasildigi_tarih) { setSonTarih(null); setIlanlar([]); setLoading(false); return; }
      setSonTarih(son.paylasildigi_tarih);
      const { data } = await supabase.from('ilanlar')
        .select('id, baslik, fiyat, tip, ilce, mahalle, fotograflar, portfoy_no, olusturma_tarihi, lat, lng, musteri_gizle')
        .eq('user_id', session.user.id).eq('durum', 'Aktif')
        .gt('olusturma_tarihi', son.paylasildigi_tarih)
        .order('olusturma_tarihi', { ascending: false });
      setIlanlar((data ?? []) as YeniIlan[]);
      setLoading(false);
    })();
  }, [visible, musteriId]);

  const markers = useMemo(() => ilanlar
    .map(i => ({ id: i.id, lat: parseFloat(String(i.lat)), lng: parseFloat(String(i.lng)), fiyat: kisaFiyat(Number(i.fiyat)), tip: i.tip, acik: !i.musteri_gizle }))
    .filter(m => isFinite(m.lat) && isFinite(m.lng)), [ilanlar]);
  const mapHtml = useMemo(() => markers.length ? buildMap(markers) : '', [markers]);

  const ilanAc = (id: string) => { onClose(); router.push(`/ilan/${id}` as any); };
  const tarihStr = sonTarih ? new Date(sonTarih).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
  const konumsuz = ilanlar.length - markers.length;
  // Seçili ilan listenin en üstüne alınır.
  const liste = secili ? [...ilanlar.filter(i => i.id === secili), ...ilanlar.filter(i => i.id !== secili)] : ilanlar;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={s.container} edges={['top', 'bottom']}>
        <View style={s.header}>
          <TouchableOpacity onPress={onClose}><Text style={s.kapat}>✕</Text></TouchableOpacity>
          <View style={{ flex: 1, marginLeft: Spacing.md }}>
            <Text style={s.baslik}>🆕 Son Paylaşımdan Sonra Eklenenler</Text>
            {!!sonTarih && <Text style={s.alt}>Son paylaşım: {tarihStr} · {ilanlar.length} yeni ilan{konumsuz > 0 ? ` (${konumsuz} konumsuz)` : ''}</Text>}
          </View>
        </View>
        {loading ? (
          <View style={s.center}><ActivityIndicator size="large" color={Colors.primary} /></View>
        ) : !sonTarih ? (
          <View style={s.center}><Text style={s.bos}>Bu müşteriye henüz ilan gönderilmemiş.</Text></View>
        ) : ilanlar.length === 0 ? (
          <View style={s.center}><Text style={s.bos}>Son paylaşımdan ({tarihStr}) sonra yeni ilan eklenmemiş.</Text></View>
        ) : (
          <>
            {markers.length > 0 && (
              <View style={{ flex: 1.3 }}>
                <WebView
                  source={{ html: mapHtml }}
                  style={{ flex: 1 }}
                  onMessage={e => { try { const d = JSON.parse(e.nativeEvent.data); if (d.id) setSecili(d.id); } catch {} }}
                  javaScriptEnabled
                  domStorageEnabled
                  originWhitelist={['*']}
                  mixedContentMode="always"
                />
              </View>
            )}
            <FlatList
              style={{ flex: 1 }}
              data={liste}
              keyExtractor={i => i.id}
              renderItem={({ item: i }) => (
                <TouchableOpacity onPress={() => ilanAc(i.id)} style={[s.satir, i.id === secili && s.satirSecili]}>
                  {i.fotograflar?.[0]
                    ? <R2Image source={i.fotograflar[0]} size="sm" style={s.foto} />
                    : <View style={s.foto} />}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={s.ilanBaslik} numberOfLines={1}>{i.baslik}</Text>
                    <Text style={[s.fiyat, i.tip === 'Kiralık' && { color: '#7c8be0' }]}>₺{Number(i.fiyat).toLocaleString('tr-TR')}</Text>
                    <Text style={s.konum} numberOfLines={1}>
                      {[i.ilce, i.mahalle].filter(Boolean).join(' / ')}{i.portfoy_no ? ` · #${i.portfoy_no}` : ''}{(i.lat == null || i.lng == null) ? ' · 📍yok' : ''}
                    </Text>
                    <Text style={s.tarih}>{new Date(i.olusturma_tarihi).toLocaleDateString('tr-TR')}</Text>
                  </View>
                </TouchableOpacity>
              )}
            />
          </>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.surfaceContainerHigh },
  kapat: { fontSize: 20, color: Colors.onSurface },
  baslik: { fontSize: 15, fontWeight: '700', color: Colors.onSurface },
  alt: { fontSize: 11, color: Colors.onSurfaceVariant, marginTop: 2 },
  bos: { fontSize: 14, color: Colors.onSurfaceVariant, textAlign: 'center' },
  satir: { flexDirection: 'row', gap: Spacing.md, alignItems: 'center', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.surfaceContainerHigh },
  satirSecili: { backgroundColor: Colors.primaryFixed },
  foto: { width: 60, height: 60, borderRadius: Radius.sm, backgroundColor: Colors.surfaceContainerHigh },
  ilanBaslik: { fontSize: 13, fontWeight: '700', color: Colors.onSurface },
  fiyat: { fontSize: 13, fontWeight: '700', color: Colors.primary },
  konum: { fontSize: 11, color: Colors.onSurfaceVariant },
  tarih: { fontSize: 10, color: Colors.outline },
});
