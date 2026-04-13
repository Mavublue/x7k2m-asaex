import { useRef, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, SafeAreaView } from 'react-native';
import { WebView } from 'react-native-webview';
import { Colors, Radius, Spacing } from '../constants/theme';

function buildPickerHtml(initLat?: number, initLng?: number) {
  const center = initLat && initLng ? `[${initLat}, ${initLng}]` : '[39.925, 32.836]';
  const zoom = initLat && initLng ? 9 : 6;
  const initMarker = initLat && initLng
    ? `var marker = L.marker([${initLat}, ${initLng}], { icon: pinIcon }).addTo(map);`
    : 'var marker = null;';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"/>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { width: 100vw; height: 100vh; overflow: hidden; }
    #map { width: 100%; height: 100%; }
    .crosshair {
      position: absolute;
      top: 50%; left: 50%;
      transform: translate(-50%, -50%);
      width: 24px; height: 24px;
      pointer-events: none;
      z-index: 1000;
    }
    .crosshair::before, .crosshair::after {
      content: '';
      position: absolute;
      background: #6750A4;
    }
    .crosshair::before { width: 2px; height: 100%; left: 50%; transform: translateX(-50%); }
    .crosshair::after { height: 2px; width: 100%; top: 50%; transform: translateY(-50%); }
    .hint {
      position: absolute;
      top: 12px; left: 50%;
      transform: translateX(-50%);
      background: rgba(0,0,0,0.65);
      color: #fff;
      padding: 6px 14px;
      border-radius: 20px;
      font-size: 13px;
      white-space: nowrap;
      z-index: 1000;
      pointer-events: none;
    }
    .leaflet-control-attribution { font-size: 9px; }
  </style>
</head>
<body>
  <div id="map"></div>
  <div class="crosshair"></div>
  <div class="hint">Konumu seçmek için haritaya dokunun</div>
  <script>
    var pinIcon = L.divIcon({
      html: '<div style="width:20px;height:20px;background:#6750A4;border:3px solid #fff;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 2px 8px rgba(0,0,0,0.4)"></div>',
      className: '',
      iconSize: [20, 20],
      iconAnchor: [10, 20]
    });

    var map = L.map('map', { zoomControl: true }).setView(${center}, ${zoom});
    L.tileLayer('https://tiles.stadiamaps.com/tiles/alidade_satellite/{z}/{x}/{y}{r}.jpg', {
      attribution: '&copy; Stadia Maps &copy; CNES/Airbus &copy; OpenStreetMap',
      maxZoom: 20
    }).addTo(map);

    ${initMarker}

    map.on('click', function(e) {
      var lat = e.latlng.lat;
      var lng = e.latlng.lng;
      if (marker) {
        marker.setLatLng([lat, lng]);
      } else {
        marker = L.marker([lat, lng], { icon: pinIcon }).addTo(map);
      }
      window.ReactNativeWebView.postMessage(JSON.stringify({ lat: lat, lng: lng }));
    });
  </script>
</body>
</html>`;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  onConfirm: (lat: number, lng: number) => void;
  initLat?: number;
  initLng?: number;
}

export default function MapPickerModal({ visible, onClose, onConfirm, initLat, initLng }: Props) {
  const [selected, setSelected] = useState<{ lat: number; lng: number } | null>(
    initLat && initLng ? { lat: initLat, lng: initLng } : null
  );
  const html = buildPickerHtml(initLat, initLng);

  function handleMessage(event: any) {
    try {
      const { lat, lng } = JSON.parse(event.nativeEvent.data);
      setSelected({ lat, lng });
    } catch {}
  }

  function handleConfirm() {
    if (selected) {
      onConfirm(selected.lat, selected.lng);
      onClose();
    }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.headerBtn}>
            <Text style={styles.headerBtnText}>İptal</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Konum Seç</Text>
          <TouchableOpacity
            onPress={handleConfirm}
            style={[styles.headerBtn, !selected && styles.headerBtnDisabled]}
            disabled={!selected}
          >
            <Text style={[styles.headerBtnTextPrimary, !selected && styles.headerBtnDisabled]}>Seç</Text>
          </TouchableOpacity>
        </View>

        {/* Map */}
        <WebView
          source={{ html }}
          style={styles.map}
          onMessage={handleMessage}
          javaScriptEnabled
          domStorageEnabled
          originWhitelist={['*']}
          mixedContentMode="always"
        />

        {/* Bottom info */}
        <View style={styles.bottom}>
          {selected ? (
            <Text style={styles.coordText}>
              📍 {selected.lat.toFixed(6)}, {selected.lng.toFixed(6)}
            </Text>
          ) : (
            <Text style={styles.hintText}>Haritaya dokunarak konum seçin</Text>
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceContainerLow,
  },
  headerTitle: { fontSize: 16, fontWeight: '700', color: Colors.onSurface },
  headerBtn: { paddingHorizontal: 4, paddingVertical: 4 },
  headerBtnText: { fontSize: 15, color: Colors.onSurfaceVariant },
  headerBtnTextPrimary: { fontSize: 15, color: Colors.primary, fontWeight: '700' },
  headerBtnDisabled: { opacity: 0.35 },
  map: { flex: 1 },
  bottom: {
    paddingVertical: 14,
    paddingHorizontal: Spacing.xl,
    alignItems: 'center',
    backgroundColor: Colors.surfaceContainerLowest,
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceContainerLow,
  },
  coordText: { fontSize: 13, color: Colors.onSurface, fontWeight: '600' },
  hintText: { fontSize: 13, color: Colors.onSurfaceVariant },
});
