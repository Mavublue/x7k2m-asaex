import { useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, Image, Animated, Alert, StyleSheet,
} from 'react-native';
import { Colors, Radius, Spacing } from '../constants/theme';

type Pending = { tempId: string; uri: string; percent: number };

type Props = {
  fotograflar: string[];
  gizliFotograflar: string[];
  pending: Pending[];
  renderImage: (key: string, index: number) => React.ReactNode;
  onReorder: (fromIdx: number, toIdx: number) => void;
  onSilTekli: (key: string, index: number) => void;
  onTopluSil: (keys: string[]) => void;
  onGizleToggle: (key: string) => void;
  onEkle: () => void;
  onCancelUpload: (tempId: string) => void;
};

export default function FotoGridSortable({
  fotograflar, gizliFotograflar, pending, renderImage,
  onReorder, onSilTekli, onTopluSil, onGizleToggle, onEkle, onCancelUpload,
}: Props) {
  const [secimModu, setSecimModu] = useState(false);
  const [secilen, setSecilen] = useState<string[]>([]);
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);

  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const startPos = useRef({ x: 0, y: 0 });
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cellLayouts = useRef<{ x: number; y: number; w: number; h: number }[]>([]).current;
  const dragIdxRef = useRef<number | null>(null);
  const fotoListRef = useRef(fotograflar);
  fotoListRef.current = fotograflar;

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

  function startDrag(idx: number) {
    dragIdxRef.current = idx;
    setDraggingIdx(idx);
    pan.setValue({ x: 0, y: 0 });
  }

  function finishDrag(dx: number, dy: number) {
    const idx = dragIdxRef.current;
    if (idx == null) return;
    const cell = cellLayouts[idx];
    let target = -1;
    if (cell) {
      const cx = cell.x + cell.w / 2 + dx;
      const cy = cell.y + cell.h / 2 + dy;
      for (let i = 0; i < cellLayouts.length; i++) {
        const c = cellLayouts[i];
        if (!c) continue;
        if (cx >= c.x && cx <= c.x + c.w && cy >= c.y && cy <= c.y + c.h) {
          target = i; break;
        }
      }
    }
    if (target >= 0 && target !== idx) {
      onReorder(idx, target);
    }
    dragIdxRef.current = null;
    setDraggingIdx(null);
    pan.setValue({ x: 0, y: 0 });
  }

  function cellHandlers(key: string) {
    return {
      onStartShouldSetResponder: () => !secimModu,
      onMoveShouldSetResponder: () => dragIdxRef.current != null,
      onMoveShouldSetResponderCapture: () => dragIdxRef.current != null,
      onResponderGrant: (e: any) => {
        const { pageX, pageY } = e.nativeEvent;
        startPos.current = { x: pageX, y: pageY };
        clearLongPress();
        const idx = fotoListRef.current.indexOf(key);
        if (idx < 0) return;
        longPressTimer.current = setTimeout(() => {
          startDrag(idx);
        }, 350);
      },
      onResponderMove: (e: any) => {
        const { pageX, pageY } = e.nativeEvent;
        const dx = pageX - startPos.current.x;
        const dy = pageY - startPos.current.y;
        if (dragIdxRef.current != null) {
          pan.setValue({ x: dx, y: dy });
        } else if (Math.abs(dx) > 6 || Math.abs(dy) > 6) {
          clearLongPress();
        }
      },
      onResponderRelease: (e: any) => {
        clearLongPress();
        if (dragIdxRef.current != null) {
          const dx = e.nativeEvent.pageX - startPos.current.x;
          const dy = e.nativeEvent.pageY - startPos.current.y;
          finishDrag(dx, dy);
        }
      },
      onResponderTerminate: () => {
        clearLongPress();
        if (dragIdxRef.current != null) {
          dragIdxRef.current = null;
          setDraggingIdx(null);
          pan.setValue({ x: 0, y: 0 });
        }
      },
      onResponderTerminationRequest: () => dragIdxRef.current == null,
    };
  }

  const showToolbar = fotograflar.length > 0 || pending.length > 0;

  return (
    <View>
      {showToolbar && (
        <View style={styles.toolbar}>
          {!secimModu && fotograflar.length > 0 && (
            <Text style={styles.ipucu}>Sıralamak için fotoğrafa basılı tutup sürükle</Text>
          )}
          <View style={{ flex: 1 }} />
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

      <View style={styles.fotoGrid}>
        {fotograflar.map((key, i) => {
          const gizli = gizliFotograflar.includes(key);
          const sec = secilen.includes(key);
          const isDragging = draggingIdx === i;

          return (
            <Animated.View
              key={key}
              onLayout={(e) => {
                const { x, y, width, height } = e.nativeEvent.layout;
                const idx = fotoListRef.current.indexOf(key);
                if (idx >= 0) cellLayouts[idx] = { x, y, w: width, h: height };
              }}
              style={[
                styles.fotoKutu,
                sec && styles.fotoKutuSec,
                isDragging && {
                  zIndex: 999,
                  opacity: 0.9,
                  transform: [
                    { translateX: pan.x },
                    { translateY: pan.y },
                    { scale: 1.1 },
                  ],
                  elevation: 10,
                  shadowColor: '#000',
                  shadowOpacity: 0.35,
                  shadowRadius: 8,
                  shadowOffset: { width: 0, height: 4 },
                },
              ]}
              {...cellHandlers(key)}
            >
              {renderImage(key, i)}
              {i === 0 && !secimModu && (
                <View style={styles.kapakBadge}>
                  <Text style={styles.kapakText}>Kapak</Text>
                </View>
              )}
              {gizli && (
                <View style={styles.gizliOverlay} pointerEvents="none">
                  <Text style={styles.gizliOverlayText}>🚫</Text>
                </View>
              )}
              {secimModu ? (
                <TouchableOpacity
                  style={StyleSheet.absoluteFill}
                  onPress={() => toggleSec(key)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.secCheck, sec && styles.secCheckAktif]}>
                    {sec && <Text style={styles.secCheckTik}>✓</Text>}
                  </View>
                </TouchableOpacity>
              ) : (
                <>
                  <TouchableOpacity style={styles.fotoGoz} onPress={() => onGizleToggle(key)}>
                    <Text style={styles.fotoGozText}>{gizli ? '🚫' : '👁'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.fotoSil} onPress={() => onSilTekli(key, i)}>
                    <Text style={styles.fotoSilText}>✕</Text>
                  </TouchableOpacity>
                </>
              )}
            </Animated.View>
          );
        })}

        {pending.map(item => (
          <View key={item.tempId} style={[styles.fotoKutu, { backgroundColor: '#fff', borderWidth: 1, borderColor: Colors.outlineVariant }]}>
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
  );
}

const styles = StyleSheet.create({
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  ipucu: { fontSize: 11, color: Colors.onSurfaceVariant, fontStyle: 'italic' },
  toolbarBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.full, backgroundColor: Colors.surfaceContainerLow },
  toolbarBtnText: { fontSize: 12, fontWeight: '600', color: Colors.onSurface },
  toolbarSilBtn: { backgroundColor: '#E53935' },
  toolbarSilBtnText: { fontSize: 12, fontWeight: '700', color: '#fff' },
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
