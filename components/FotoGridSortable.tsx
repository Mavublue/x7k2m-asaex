import { useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, Image, Animated, Alert, StyleSheet,
} from 'react-native';
import { Colors, Radius, Spacing } from '../constants/theme';

type Pending = { tempId: string; uri: string; percent: number };
type Box = 'sol' | 'sag';
type Rect = { x: number; y: number; w: number; h: number };

type Props = {
  fotograflar: string[];        // sol kutu = görünür (müşteri görür), sıralı
  gizliFotograflar: string[];   // gizli set: sol'da butonla gizli + sağ kutu
  pending: Pending[];
  renderImage: (key: string, index: number) => React.ReactNode;
  onReorder: (fromIdx: number, toIdx: number) => void;   // sol kutu içi
  onSilTekli: (key: string, index: number) => void;
  onTopluSil: (keys: string[]) => void;
  onGizleToggle: (key: string) => void;                  // sol foto: yerinde gizle/göster
  onMoveToGizli: (key: string) => void;                  // sol → sağ kutu
  onMoveToNormal: (key: string) => void;                 // sağ → sol kutu
  onEkle: () => void;
  onCancelUpload: (tempId: string) => void;
  onDragActiveChange?: (active: boolean) => void;
};

export default function FotoGridSortable({
  fotograflar, gizliFotograflar, pending, renderImage,
  onReorder, onSilTekli, onTopluSil, onGizleToggle, onMoveToGizli, onMoveToNormal, onEkle, onCancelUpload, onDragActiveChange,
}: Props) {
  const [secimModu, setSecimModu] = useState(false);
  const [secilen, setSecilen] = useState<string[]>([]);
  const [draggingKey, setDraggingKey] = useState<string | null>(null);

  const solList = fotograflar;
  const sagList = gizliFotograflar.filter(k => !fotograflar.includes(k));
  const kapakKey = fotograflar.find(k => !gizliFotograflar.includes(k));

  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const startPos = useRef({ x: 0, y: 0 });
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Koordinat zinciri: root → box (gridRect) → fotoGrid (gridInner) → hücre (cellLocal)
  const cellLocal = useRef<Record<string, Rect & { box: Box }>>({}).current;
  const gridInner = useRef<Record<Box, { x: number; y: number }>>({ sol: { x: 0, y: 0 }, sag: { x: 0, y: 0 } }).current;
  const gridRect = useRef<Record<Box, Rect>>({ sol: { x: 0, y: 0, w: 0, h: 0 }, sag: { x: 0, y: 0, w: 0, h: 0 } }).current;
  const dragKeyRef = useRef<string | null>(null);
  const dragBoxRef = useRef<Box>('sol');

  function clearLongPress() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }

  function handleSecimToggle() {
    if (secimModu) { setSecimModu(false); setSecilen([]); }
    else setSecimModu(true);
  }

  function toggleSec(key: string) {
    setSecilen(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  }

  function handleTopluSil() {
    if (secilen.length === 0) return;
    Alert.alert('Toplu Sil', `${secilen.length} fotoğraf silinsin mi?`, [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'Sil', style: 'destructive', onPress: () => {
          onTopluSil(secilen);
          setSecilen([]);
          setSecimModu(false);
        },
      },
    ]);
  }

  function wrapperRect(key: string): Rect | null {
    const c = cellLocal[key];
    if (!c) return null;
    const g = gridRect[c.box];
    const inner = gridInner[c.box];
    return { x: g.x + inner.x + c.x, y: g.y + inner.y + c.y, w: c.w, h: c.h };
  }

  function startDrag(key: string, box: Box) {
    dragKeyRef.current = key;
    dragBoxRef.current = box;
    setDraggingKey(key);
    pan.setValue({ x: 0, y: 0 });
    onDragActiveChange?.(true);
  }

  function pointInRect(px: number, py: number, r: Rect) {
    return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
  }

  function finishDrag(dx: number, dy: number) {
    const key = dragKeyRef.current;
    const srcBox = dragBoxRef.current;
    if (!key) { resetDrag(); return; }
    const start = wrapperRect(key);
    if (!start) { resetDrag(); return; }
    const cx = start.x + start.w / 2 + dx;
    const cy = start.y + start.h / 2 + dy;

    // Hedef hücre ara (iki kutudaki tüm hücreler)
    let targetKey: string | null = null;
    let targetBox: Box | null = null;
    const allKeys = [...solList, ...sagList];
    for (const k2 of allKeys) {
      if (k2 === key) continue;
      const r = wrapperRect(k2);
      if (r && pointInRect(cx, cy, r)) { targetKey = k2; targetBox = cellLocal[k2].box; break; }
    }
    // Hücre yoksa hangi kutu bölgesine düştüğüne bak
    if (!targetBox) {
      if (pointInRect(cx, cy, gridRect.sag)) targetBox = 'sag';
      else if (pointInRect(cx, cy, gridRect.sol)) targetBox = 'sol';
    }

    if (targetBox) {
      if (srcBox === 'sol' && targetBox === 'sol') {
        const from = solList.indexOf(key);
        const to = targetKey ? solList.indexOf(targetKey) : solList.length - 1;
        if (from >= 0 && to >= 0 && from !== to) onReorder(from, to);
      } else if (srcBox === 'sol' && targetBox === 'sag') {
        onMoveToGizli(key);
      } else if (srcBox === 'sag' && targetBox === 'sol') {
        onMoveToNormal(key);
      }
      // sag → sag: sıralama önemsiz, no-op
    }
    resetDrag();
  }

  function resetDrag() {
    dragKeyRef.current = null;
    setDraggingKey(null);
    pan.setValue({ x: 0, y: 0 });
    onDragActiveChange?.(false);
  }

  function cellHandlers(key: string, box: Box) {
    return {
      onStartShouldSetResponder: () => !secimModu,
      onMoveShouldSetResponder: () => dragKeyRef.current != null,
      onMoveShouldSetResponderCapture: () => dragKeyRef.current != null,
      onResponderGrant: (e: any) => {
        const { pageX, pageY } = e.nativeEvent;
        startPos.current = { x: pageX, y: pageY };
        clearLongPress();
        longPressTimer.current = setTimeout(() => {
          startDrag(key, box);
        }, 350);
      },
      onResponderMove: (e: any) => {
        const { pageX, pageY } = e.nativeEvent;
        const dx = pageX - startPos.current.x;
        const dy = pageY - startPos.current.y;
        if (dragKeyRef.current != null) {
          pan.setValue({ x: dx, y: dy });
        } else if (Math.abs(dx) > 6 || Math.abs(dy) > 6) {
          clearLongPress();
        }
      },
      onResponderRelease: (e: any) => {
        clearLongPress();
        if (dragKeyRef.current != null) {
          const dx = e.nativeEvent.pageX - startPos.current.x;
          const dy = e.nativeEvent.pageY - startPos.current.y;
          finishDrag(dx, dy);
        }
      },
      onResponderTerminate: () => {
        clearLongPress();
        if (dragKeyRef.current != null) resetDrag();
      },
      onResponderTerminationRequest: () => dragKeyRef.current == null,
    };
  }

  function renderCell(key: string, box: Box, i: number) {
    const gizli = box === 'sag' || gizliFotograflar.includes(key);
    const sec = box === 'sol' && secilen.includes(key);
    const isDragging = draggingKey === key;
    const showSecim = box === 'sol' && secimModu;
    const kapak = box === 'sol' && key === kapakKey && !secimModu;

    return (
      <Animated.View
        key={key}
        onLayout={(e) => {
          const { x, y, width, height } = e.nativeEvent.layout;
          cellLocal[key] = { x, y, w: width, h: height, box };
        }}
        style={[
          styles.fotoKutu,
          sec && styles.fotoKutuSec,
          isDragging && {
            zIndex: 999, opacity: 0.9,
            transform: [{ translateX: pan.x }, { translateY: pan.y }, { scale: 1.1 }],
            elevation: 10, shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
          },
        ]}
        {...(showSecim ? {} : cellHandlers(key, box))}
      >
        {renderImage(key, i)}
        {kapak && (
          <View style={styles.kapakBadge}>
            <Text style={styles.kapakText}>Kapak</Text>
          </View>
        )}
        {gizli && (
          <View style={styles.gizliOverlay} pointerEvents="none">
            <Text style={styles.gizliOverlayText}>🚫</Text>
          </View>
        )}
        {showSecim ? (
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => toggleSec(key)} activeOpacity={0.7}>
            <View style={[styles.secCheck, sec && styles.secCheckAktif]}>
              {sec && <Text style={styles.secCheckTik}>✓</Text>}
            </View>
          </TouchableOpacity>
        ) : (
          <>
            <TouchableOpacity
              style={styles.fotoGoz}
              onPress={() => box === 'sol' ? onGizleToggle(key) : onMoveToNormal(key)}
            >
              <Text style={styles.fotoGozText}>{box === 'sag' ? '👁' : (gizliFotograflar.includes(key) ? '🚫' : '👁')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.fotoSil} onPress={() => onSilTekli(key, i)}>
              <Text style={styles.fotoSilText}>✕</Text>
            </TouchableOpacity>
          </>
        )}
      </Animated.View>
    );
  }

  const showToolbar = fotograflar.length > 0 || pending.length > 0;

  return (
    <View>
      {showToolbar && (
        <View style={styles.toolbar}>
          {!secimModu && fotograflar.length > 0 && (
            <Text style={styles.ipucu}>Basılı tutup sürükle · sağ kutu müşteriye kapalı</Text>
          )}
          <View style={{ flex: 1 }} />
          {secimModu && fotograflar.length > 0 && (
            <TouchableOpacity
              onPress={() => setSecilen(secilen.length === fotograflar.length ? [] : [...fotograflar])}
              style={styles.toolbarBtn}
            >
              <Text style={styles.toolbarBtnText}>{secilen.length === fotograflar.length ? 'Kaldır' : 'Tümü'}</Text>
            </TouchableOpacity>
          )}
          {secimModu && (
            <TouchableOpacity
              onPress={handleTopluSil}
              style={[styles.toolbarBtn, styles.toolbarSilBtn, secilen.length === 0 && { opacity: 0.4 }]}
              disabled={secilen.length === 0}
            >
              <Text style={styles.toolbarSilBtnText}>{secilen.length} Sil</Text>
            </TouchableOpacity>
          )}
          {fotograflar.length > 0 && (
            <TouchableOpacity onPress={handleSecimToggle} style={styles.toolbarBtn}>
              <Text style={styles.toolbarBtnText}>{secimModu ? 'İptal' : 'Seç'}</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* SOL: Görünür */}
      <View
        style={styles.box}
        onLayout={(e) => { const { x, y, width, height } = e.nativeEvent.layout; gridRect.sol = { x, y, w: width, h: height }; }}
      >
        <Text style={styles.boxBaslikSol}>👁 Görünür · müşteri görür</Text>
        <View
          style={styles.fotoGrid}
          onLayout={(e) => { const { x, y } = e.nativeEvent.layout; gridInner.sol = { x, y }; }}
        >
          {solList.map((key, i) => renderCell(key, 'sol', i))}

          {pending.map(item => (
            <View key={item.tempId} style={[styles.fotoKutu, { backgroundColor: Colors.surfaceContainerLow, borderWidth: 1, borderColor: Colors.outlineVariant }]}>
              <Image source={{ uri: item.uri }} style={[styles.fotoImage, { opacity: 0.25 }]} />
              <View style={styles.fotoPendingOverlay}>
                <Text style={styles.fotoPendingPct}>%{item.percent}</Text>
              </View>
              <TouchableOpacity style={styles.fotoSil} onPress={() => onCancelUpload(item.tempId)}>
                <Text style={styles.fotoSilText}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}

          {!secimModu && (
            <TouchableOpacity style={styles.fotoEkle} onPress={onEkle}>
              <Text style={styles.fotoEkleIcon}>＋</Text>
              <Text style={styles.fotoEkleText}>Ekle</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* SAĞ: Gizli */}
      <View
        style={[styles.box, styles.boxGizli]}
        onLayout={(e) => { const { x, y, width, height } = e.nativeEvent.layout; gridRect.sag = { x, y, w: width, h: height }; }}
      >
        <Text style={styles.boxBaslikSag}>🚫 Gizli · müşteri görmez</Text>
        {sagList.length > 0 ? (
          <View
            style={styles.fotoGrid}
            onLayout={(e) => { const { x, y } = e.nativeEvent.layout; gridInner.sag = { x, y }; }}
          >
            {sagList.map((key, i) => renderCell(key, 'sag', i))}
          </View>
        ) : (
          <Text style={styles.bosSag}>Müşteriden gizlemek istediğin fotoğrafı basılı tutup buraya sürükle</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  ipucu: { fontSize: 11, color: Colors.onSurfaceVariant, fontStyle: 'italic' },
  toolbarBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.full, backgroundColor: Colors.surfaceContainerLow },
  toolbarBtnText: { fontSize: 12, fontWeight: '600', color: Colors.onSurface },
  toolbarSilBtn: { backgroundColor: '#E53935' },
  toolbarSilBtnText: { fontSize: 12, fontWeight: '700', color: '#fff' },
  box: { borderRadius: Radius.lg, paddingVertical: Spacing.sm },
  boxGizli: {
    marginTop: Spacing.sm, borderWidth: 1, borderColor: Colors.outlineVariant, borderStyle: 'dashed',
    backgroundColor: Colors.surfaceContainerLowest, paddingHorizontal: Spacing.sm,
  },
  boxBaslikSol: { fontSize: 11, fontWeight: '700', color: '#3aaa6e', marginBottom: 6 },
  boxBaslikSag: { fontSize: 11, fontWeight: '700', color: '#E53935', marginBottom: 6 },
  bosSag: { fontSize: 12, color: Colors.onSurfaceVariant, paddingVertical: 14, textAlign: 'center', lineHeight: 18 },
  fotoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  fotoKutu: { width: 80, height: 80, borderRadius: Radius.lg, overflow: 'hidden' },
  fotoKutuSec: { borderWidth: 2, borderColor: Colors.primary },
  fotoImage: { width: '100%', height: '100%' },
  fotoSil: {
    position: 'absolute', top: 4, right: 4,
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: Radius.full,
    width: 20, height: 20, alignItems: 'center', justifyContent: 'center',
  },
  fotoSilText: { color: '#fff', fontSize: 10 },
  fotoGoz: {
    position: 'absolute', top: 4, left: 4,
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: Radius.full,
    width: 22, height: 22, alignItems: 'center', justifyContent: 'center',
  },
  fotoGozText: { fontSize: 11 },
  gizliOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center', justifyContent: 'center',
  },
  gizliOverlayText: { fontSize: 28 },
  kapakBadge: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', paddingVertical: 2,
  },
  kapakText: { color: '#fff', fontSize: 9, fontWeight: '700' },
  secCheck: {
    position: 'absolute', top: 4, right: 4,
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 2, borderColor: '#fff',
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center', justifyContent: 'center',
  },
  secCheckAktif: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  secCheckTik: { color: '#fff', fontSize: 12, fontWeight: '700' },
  fotoEkle: {
    width: 80, height: 80, borderRadius: Radius.lg,
    backgroundColor: Colors.surfaceContainerLow,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.outlineVariant, borderStyle: 'dashed',
  },
  fotoEkleIcon: { fontSize: 22, color: Colors.primary },
  fotoEkleText: { fontSize: 10, color: Colors.onSurfaceVariant, marginTop: 2 },
  fotoPendingOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  fotoPendingPct: { fontSize: 14, color: Colors.onSurface, fontWeight: '700' },
});
