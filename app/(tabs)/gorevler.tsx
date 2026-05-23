import { useEffect, useState, useCallback } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, TextInput, Modal, Alert, Platform, RefreshControl, Keyboard,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { router, useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { Colors, Radius, Spacing } from '../../constants/theme';

type GorevFiltre = 'gecmis' | 'bugun' | 'yarin' | '7gun' | 'tumu' | 'yapilan';

export default function GorevlerScreen() {
  const [gorevler, setGorevler] = useState<any[]>([]);
  const [gecmisCount, setGecmisCount] = useState(0);
  const [gorevFiltre, setGorevFiltre] = useState<GorevFiltre>('bugun');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [editGorev, setEditGorev] = useState<any | null>(null);
  const [editBaslik, setEditBaslik] = useState('');
  const [editTarihDate, setEditTarihDate] = useState<Date>(new Date());
  const [editSaatDate, setEditSaatDate] = useState<Date | null>(null);
  const [showEditTarihPicker, setShowEditTarihPicker] = useState(false);
  const [showEditSaatPicker, setShowEditSaatPicker] = useState(false);

  const [ekleModal, setEkleModal] = useState(false);
  const [ekleBaslik, setEkleBaslik] = useState('');
  const [ekleTarihDate, setEkleTarihDate] = useState<Date>(new Date());
  const [ekleSaatDate, setEkleSaatDate] = useState<Date | null>(null);
  const [showEkleTarihPicker, setShowEkleTarihPicker] = useState(false);
  const [showEkleSaatPicker, setShowEkleSaatPicker] = useState(false);
  const [ekleMusteriIds, setEkleMusteriIds] = useState<string[]>([]);
  const [ekleMusteriArama, setEkleMusteriArama] = useState('');
  const [musteriListesi, setMusteriListesi] = useState<{id:string;ad:string;soyad:string|null;telefon:string|null;durum:string|null;etiketler:string|null;musteri_iletisim:{ad:string|null;telefon:string|null;tip:string|null}[];musteri_istekler:{butce_min:number|null;butce_max:number|null}[]}[]>([]);

  useEffect(() => {
    init();
  }, []);

  useFocusEffect(useCallback(() => {
    fetchGorevler(gorevFiltre);
  }, [gorevFiltre]));

  async function init() {
    const { data: mListe } = await supabase.from('musteriler').select('id, ad, soyad, telefon, durum, etiketler, musteri_iletisim(ad, telefon, tip), musteri_istekler(butce_min, butce_max)').order('ad');
    if (mListe) setMusteriListesi(mListe);
    await fetchGorevler('bugun');
    setLoading(false);
  }

  async function fetchGorevler(filtre: GorevFiltre) {
    const baslangic = new Date();
    baslangic.setHours(0, 0, 0, 0);

    let q = supabase
      .from('musteri_gorevler')
      .select('id, baslik, hedef_tarih, musteri_id, musteriler(ad, soyad, etiketler)')
      .eq('tamamlandi', filtre === 'yapilan')
      .not('hedef_tarih', 'is', null)
      .order('hedef_tarih', { ascending: filtre !== 'yapilan' });

    if (filtre === 'gecmis') {
      q = q.lt('hedef_tarih', baslangic.toISOString());
    } else if (filtre === 'bugun') {
      const bitis = new Date(baslangic); bitis.setDate(bitis.getDate() + 1);
      q = q.gte('hedef_tarih', baslangic.toISOString()).lt('hedef_tarih', bitis.toISOString());
    } else if (filtre === 'yarin') {
      const yB = new Date(baslangic); yB.setDate(yB.getDate() + 1);
      const yBitis = new Date(yB); yBitis.setDate(yBitis.getDate() + 1);
      q = q.gte('hedef_tarih', yB.toISOString()).lt('hedef_tarih', yBitis.toISOString());
    } else if (filtre === '7gun') {
      const bitis = new Date(baslangic); bitis.setDate(bitis.getDate() + 7);
      q = q.gte('hedef_tarih', baslangic.toISOString()).lt('hedef_tarih', bitis.toISOString());
    }

    const { data } = await q;
    setGorevler(data ?? []);

    const { count } = await supabase.from('musteri_gorevler')
      .select('id', { count: 'exact', head: true })
      .eq('tamamlandi', false)
      .not('hedef_tarih', 'is', null)
      .lt('hedef_tarih', baslangic.toISOString());
    setGecmisCount(count ?? 0);
  }

  async function gorevTamamla(id: string) {
    await supabase.from('musteri_gorevler').update({ tamamlandi: true }).eq('id', id);
    setGorevler(prev => prev.filter(g => g.id !== id));
  }

  async function gorevGeriAl(id: string) {
    await supabase.from('musteri_gorevler').update({ tamamlandi: false }).eq('id', id);
    setGorevler(prev => prev.filter(g => g.id !== id));
  }

  async function gorevSil(id: string) {
    await supabase.from('musteri_gorevler').delete().eq('id', id);
    setGorevler(prev => prev.filter(g => g.id !== id));
  }

  async function gorevDuzenleKaydet() {
    if (!editGorev || !editBaslik.trim()) return;
    const dt = new Date(editTarihDate);
    if (editSaatDate) { dt.setHours(editSaatDate.getHours(), editSaatDate.getMinutes(), 0, 0); }
    else { dt.setUTCHours(0, 0, 0, 0); }
    await supabase.from('musteri_gorevler').update({ baslik: editBaslik.trim(), hedef_tarih: dt.toISOString() }).eq('id', editGorev.id);
    setGorevler(prev => prev.map(g => g.id === editGorev.id ? { ...g, baslik: editBaslik.trim(), hedef_tarih: dt.toISOString() } : g));
    setEditGorev(null);
  }

  async function gorevEkle() {
    if (!ekleBaslik.trim()) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const dt = new Date(ekleTarihDate);
    if (ekleSaatDate) { dt.setHours(ekleSaatDate.getHours(), ekleSaatDate.getMinutes(), 0, 0); }
    else { dt.setUTCHours(0, 0, 0, 0); }
    if (ekleMusteriIds.length > 0) {
      await supabase.from('musteri_gorevler').insert(
        ekleMusteriIds.map(mid => ({ baslik: ekleBaslik.trim(), hedef_tarih: dt.toISOString(), user_id: user.id, tamamlandi: false, musteri_id: mid }))
      );
    } else {
      await supabase.from('musteri_gorevler').insert({ baslik: ekleBaslik.trim(), hedef_tarih: dt.toISOString(), user_id: user.id, tamamlandi: false });
    }
    setEkleBaslik(''); setEkleTarihDate(new Date()); setEkleSaatDate(null); setEkleMusteriIds([]); setEkleMusteriArama(''); setEkleModal(false);
    fetchGorevler(gorevFiltre);
  }

  async function onRefresh() {
    setRefreshing(true);
    await fetchGorevler(gorevFiltre);
    setRefreshing(false);
  }

  const pad = (n: number) => String(n).padStart(2, '0');

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}><ActivityIndicator size="large" color={Colors.primary} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#16a34a' }} />
          <Text style={styles.headerTitle}>Görevler</Text>
          {gecmisCount > 0 && (
            <View style={{ backgroundColor: '#ef4444', borderRadius: 9, minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 }}>
              <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>{gecmisCount}</Text>
            </View>
          )}
        </View>
        <TouchableOpacity onPress={() => setEkleModal(true)} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 99, backgroundColor: '#dbeafe' }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: '#1d4ed8' }}>＋ Ekle</Text>
        </TouchableOpacity>
      </View>

      {/* Filtre chips */}
      <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', paddingHorizontal: Spacing.xl, paddingBottom: Spacing.md }}>
        {([['gecmis','Gecikmiş'],['bugun','Bugün'],['yarin','Yarın'],['7gun','7 Gün'],['tumu','Tümü'],['yapilan','Yapılanlar']] as [GorevFiltre, string][]).map(([f, label]) => (
          <TouchableOpacity key={f} onPress={() => { setGorevFiltre(f); fetchGorevler(f); }}
            style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 99, backgroundColor: gorevFiltre === f ? (f === 'gecmis' ? '#ef4444' : f === 'yapilan' ? '#6b7280' : '#16a34a') : Colors.surfaceContainerHigh }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: gorevFiltre === f ? '#fff' : (f === 'gecmis' && gecmisCount > 0 ? '#ef4444' : Colors.onSurfaceVariant) }}>
              {label}{f === 'gecmis' && gecmisCount > 0 && gorevFiltre !== 'gecmis' ? ` (${gecmisCount})` : ''}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={gorevler}
        keyExtractor={g => g.id}
        contentContainerStyle={{ paddingHorizontal: Spacing.xl, paddingBottom: 32, gap: 8 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} colors={[Colors.primary]} />}
        ListEmptyComponent={
          <View style={{ padding: 20, backgroundColor: gorevFiltre === 'gecmis' ? '#fff5f5' : gorevFiltre === 'yapilan' ? '#f3f4f6' : '#f0fdf4', borderRadius: 12, alignItems: 'center' }}>
            <Text style={{ fontSize: 14, color: gorevFiltre === 'gecmis' ? '#ef4444' : gorevFiltre === 'yapilan' ? '#6b7280' : '#16a34a', fontWeight: '500' }}>
              {gorevFiltre === 'gecmis' ? 'Gecikmiş görev yok 🎉' : gorevFiltre === 'bugun' ? 'Bugün için görev yok 🎉' : gorevFiltre === 'yarin' ? 'Yarın için görev yok 🎉' : gorevFiltre === '7gun' ? '7 günlük görev yok 🎉' : gorevFiltre === 'yapilan' ? 'Henüz tamamlanmış görev yok' : 'Aktif görev yok 🎉'}
            </Text>
          </View>
        }
        renderItem={({ item: g }) => {
          const d = g.hedef_tarih ? new Date(g.hedef_tarih) : null;
          const hasTime = d && (d.getUTCHours() !== 0 || d.getUTCMinutes() !== 0);
          const tarihStr = d ? `${pad(d.getDate())}.${pad(d.getMonth()+1)}.${d.getFullYear()}${hasTime ? ` ⏰ ${pad(d.getHours())}:${pad(d.getMinutes())}` : ''}` : '';
          const gecmis = gorevFiltre === 'gecmis';
          const yapilan = gorevFiltre === 'yapilan';
          const m = g.musteriler;
          const musteriLabel = [m?.etiketler ? `#${m.etiketler}` : null, m?.ad, m?.soyad].filter(Boolean).join(' ');
          return (
            <TouchableOpacity onPress={() => g.musteri_id && router.push(`/musteri/${g.musteri_id}` as any)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, backgroundColor: gecmis ? '#fff5f5' : yapilan ? '#f9fafb' : Colors.surface, borderRadius: 12, borderWidth: 1, borderColor: gecmis ? '#fecaca' : '#e5e7eb', borderLeftWidth: 3, borderLeftColor: gecmis ? '#ef4444' : yapilan ? '#9ca3af' : '#16a34a' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: yapilan ? '#6b7280' : Colors.onSurface, textDecorationLine: yapilan ? 'line-through' : 'none' }}>{g.baslik}</Text>
                <Text style={{ fontSize: 12, color: gecmis ? '#ef4444' : Colors.onSurfaceVariant, marginTop: 3 }}>
                  {musteriLabel || '—'}{tarihStr ? ` · 📅 ${tarihStr}` : ''}
                </Text>
              </View>
              {yapilan ? (
                <TouchableOpacity onPress={() => gorevGeriAl(g.id)}
                  style={{ paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#f3f4f6', borderRadius: 6, borderWidth: 1, borderColor: '#d1d5db' }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#6b7280' }}>↺</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity onPress={() => gorevTamamla(g.id)}
                  style={{ paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#f0fdf4', borderRadius: 6, borderWidth: 1, borderColor: '#86efac' }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#16a34a' }}>✓</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={() => Alert.alert('Görev', g.baslik, [
                { text: 'Düzenle', onPress: () => { const dt = g.hedef_tarih ? new Date(g.hedef_tarih) : new Date(); setEditGorev(g); setEditBaslik(g.baslik); setEditTarihDate(dt); setEditSaatDate(g.hedef_tarih && (new Date(g.hedef_tarih).getUTCHours()!==0||new Date(g.hedef_tarih).getUTCMinutes()!==0) ? dt : null); } },
                { text: 'Sil', style: 'destructive', onPress: () => gorevSil(g.id) },
                { text: 'İptal', style: 'cancel' },
              ])} style={{ paddingHorizontal: 8, paddingVertical: 6, backgroundColor: Colors.surfaceContainerHigh, borderRadius: 6 }}>
                <Text style={{ fontSize: 18, color: Colors.onSurfaceVariant, fontWeight: '700' }}>⋯</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          );
        }}
      />

      {/* Görev Düzenle Modal */}
      <Modal visible={!!editGorev} transparent animationType="fade" onRequestClose={() => { if (showEditTarihPicker) { setShowEditTarihPicker(false); return; } if (showEditSaatPicker) { setShowEditSaatPicker(false); return; } setEditGorev(null); }}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 22, width: '100%', maxWidth: 360 }}>
            <Text style={{ fontWeight: '700', fontSize: 15, marginBottom: 10 }}>✏️ Görevi Düzenle</Text>
            <TextInput value={editBaslik} onChangeText={setEditBaslik} placeholder="Görev başlığı"
              style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, padding: 10, fontSize: 13, marginBottom: 8 }} />
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
              <TouchableOpacity onPress={() => { Keyboard.dismiss(); setShowEditTarihPicker(true); }} style={{ flex: 1, padding: 10, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8 }}>
                <Text style={{ fontSize: 13, color: '#374151' }}>📅 {editTarihDate.toLocaleDateString('tr-TR')}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { Keyboard.dismiss(); setShowEditSaatPicker(true); }} style={{ width: 90, padding: 10, borderWidth: 1, borderColor: editSaatDate ? '#86efac' : '#e5e7eb', borderRadius: 8, alignItems: 'center' }}>
                <Text style={{ fontSize: 13, color: editSaatDate ? '#16a34a' : '#9ca3af' }}>
                  {editSaatDate ? `⏰ ${pad(editSaatDate.getHours())}:${pad(editSaatDate.getMinutes())}` : '⏰ Saat'}
                </Text>
              </TouchableOpacity>
            </View>
            {editSaatDate && (
              <TouchableOpacity onPress={() => setEditSaatDate(null)} style={{ marginBottom: 12, alignItems: 'center' }}>
                <Text style={{ fontSize: 11, color: '#6b7280' }}>Saati kaldır ✕</Text>
              </TouchableOpacity>
            )}
            {showEditTarihPicker && <>
              <DateTimePicker value={editTarihDate} mode="date" display="spinner" locale="tr-TR" onChange={(_, d) => { if (d) setEditTarihDate(d); }} />
              <TouchableOpacity onPress={() => setShowEditTarihPicker(false)} style={{ alignSelf: 'center', paddingVertical: 6, paddingHorizontal: 24, marginTop: 4 }}>
                <Text style={{ color: '#3b82f6', fontWeight: '700', fontSize: 14 }}>Tamam</Text>
              </TouchableOpacity>
            </>}
            {showEditSaatPicker && <>
              <DateTimePicker value={editSaatDate ?? new Date()} mode="time" is24Hour display="spinner" onChange={(_, d) => { if (d) setEditSaatDate(d); }} />
              <TouchableOpacity onPress={() => setShowEditSaatPicker(false)} style={{ alignSelf: 'center', paddingVertical: 6, paddingHorizontal: 24, marginTop: 4 }}>
                <Text style={{ color: '#3b82f6', fontWeight: '700', fontSize: 14 }}>Tamam</Text>
              </TouchableOpacity>
            </>}
            {!showEditTarihPicker && !showEditSaatPicker && (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity onPress={() => setEditGorev(null)} style={{ flex: 1, padding: 12, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, alignItems: 'center' }}>
                  <Text style={{ fontSize: 13, color: '#6b7280', fontWeight: '500' }}>İptal</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={gorevDuzenleKaydet} style={{ flex: 1, padding: 12, backgroundColor: '#3b82f6', borderRadius: 8, alignItems: 'center' }}>
                  <Text style={{ fontSize: 13, color: '#fff', fontWeight: '700' }}>Kaydet</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* Görev Ekle Modal */}
      <Modal visible={ekleModal} transparent animationType="fade" onRequestClose={() => setEkleModal(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 22, width: '100%', maxWidth: 360 }}>
            <Text style={{ fontWeight: '700', fontSize: 15, marginBottom: 12 }}>＋ Görev Ekle</Text>
            <TextInput value={ekleBaslik} onChangeText={setEkleBaslik} placeholder="Görev başlığı"
              style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, padding: 10, fontSize: 13, marginBottom: 8 }} />
            {/* Seçili müşteriler chips */}
            {ekleMusteriIds.length > 0 && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {musteriListesi.filter(m => ekleMusteriIds.includes(m.id)).map(m => (
                  <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: 'rgba(22,163,74,0.08)', borderWidth: 1, borderColor: '#86efac', borderRadius: 99 }}>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: '#166534' }}>{[m.etiketler ? `#${m.etiketler.split(',')[0].trim()}` : null, m.ad, m.soyad].filter(Boolean).join(' ')}</Text>
                    <TouchableOpacity onPress={() => setEkleMusteriIds(prev => prev.filter(id => id !== m.id))}>
                      <Text style={{ color: '#6b7280', fontSize: 13, marginLeft: 2 }}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
            {/* Müşteri arama */}
            <View style={{ marginBottom: 8 }}>
              <TextInput value={ekleMusteriArama} onChangeText={setEkleMusteriArama} onBlur={() => setTimeout(() => setEkleMusteriArama(''), 150)} placeholder="Müşteri ekle (opsiyonel, çoklu)"
                style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, padding: 10, fontSize: 13 }} />
              {ekleMusteriArama.trim().length > 0 && (
                <View onStartShouldSetResponder={() => true} style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, marginTop: 2, maxHeight: 260 }}>
                  {musteriListesi.filter(m => {
                    const q = ekleMusteriArama.toLowerCase();
                    return `${m.ad} ${m.soyad ?? ''} ${m.etiketler ?? ''}`.toLowerCase().includes(q) ||
                      m.telefon?.includes(ekleMusteriArama.trim()) ||
                      (m.musteri_iletisim ?? []).some((k: any) => k.ad?.toLowerCase().includes(q) || k.telefon?.includes(ekleMusteriArama.trim()));
                  }).slice(0, 5).map(m => {
                    const q = ekleMusteriArama.toLowerCase();
                    const secili = ekleMusteriIds.includes(m.id);
                    const eslesen = (m.musteri_iletisim ?? []).filter((k: any) => k.ad?.toLowerCase().includes(q) || k.telefon?.includes(ekleMusteriArama.trim()));
                    const istek = (m.musteri_istekler ?? [])[0];
                    const durumRenk = m.durum === 'Aktif' ? { bg: 'rgba(58,170,110,0.1)', color: '#3aaa6e' } : { bg: '#f3f4f6', color: '#6b7280' };
                    return (
                      <TouchableOpacity key={m.id} onPress={() => { setEkleMusteriIds(prev => secili ? prev.filter(id => id !== m.id) : [...prev, m.id]); }}
                        style={{ padding: 10, borderBottomWidth: 1, borderBottomColor: '#f3f4f6', flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: secili ? 'rgba(22,163,74,0.06)' : '#fff' }}>
                        {m.etiketler ? <Text style={{ fontSize: 10, fontWeight: '700', color: '#fff', backgroundColor: '#1a1b21', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginTop: 2 }}>#{m.etiketler.split(',')[0].trim()}</Text> : null}
                        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>{(m.ad?.[0] ?? '?').toUpperCase()}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2, flexWrap: 'wrap' }}>
                            <Text style={{ fontSize: 13, fontWeight: '700', color: secili ? '#16a34a' : Colors.onSurface }}>{m.ad}{m.soyad ? ` ${m.soyad}` : ''}</Text>
                            {m.durum ? <Text style={{ fontSize: 10, fontWeight: '700', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4, backgroundColor: durumRenk.bg, color: durumRenk.color }}>{m.durum}</Text> : null}
                            {secili ? <Text style={{ fontSize: 10, fontWeight: '700', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4, backgroundColor: 'rgba(22,163,74,0.1)', color: '#16a34a' }}>✓ Seçildi</Text> : null}
                          </View>
                          <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
                            {m.telefon ? <Text style={{ fontSize: 11, color: Colors.onSurfaceVariant }}>📞 {m.telefon}</Text> : null}
                            {istek && (istek.butce_min || istek.butce_max) ? <Text style={{ fontSize: 11, color: Colors.onSurfaceVariant }}>💰 {istek.butce_min ? `₺${Number(istek.butce_min).toLocaleString('tr-TR')}` : '?'} — {istek.butce_max ? `₺${Number(istek.butce_max).toLocaleString('tr-TR')}` : '?'}</Text> : null}
                          </View>
                          {eslesen.length > 0 && (
                            <View style={{ marginTop: 5, paddingTop: 5, borderTopWidth: 1, borderTopColor: '#e5e7eb', gap: 3 }}>
                              {eslesen.map((k: any, i: number) => (
                                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                  <Text style={{ fontSize: 10, fontWeight: '700', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4, backgroundColor: 'rgba(229,57,53,0.08)', color: Colors.primary }}>↳ {k.tip || 'Ek Kişi'}</Text>
                                  <Text style={{ fontSize: 11, fontWeight: '600', color: Colors.onSurface }}>{k.ad}</Text>
                                  {k.telefon ? <Text style={{ fontSize: 11, color: Colors.onSurfaceVariant }}>📞 {k.telefon}</Text> : null}
                                </View>
                              ))}
                            </View>
                          )}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
              <TouchableOpacity onPress={() => { Keyboard.dismiss(); setShowEkleTarihPicker(true); }} style={{ flex: 1, padding: 10, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8 }}>
                <Text style={{ fontSize: 13, color: '#374151' }}>📅 {ekleTarihDate.toLocaleDateString('tr-TR')}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { Keyboard.dismiss(); setShowEkleSaatPicker(true); }} style={{ width: 90, padding: 10, borderWidth: 1, borderColor: ekleSaatDate ? '#86efac' : '#e5e7eb', borderRadius: 8, alignItems: 'center' }}>
                <Text style={{ fontSize: 13, color: ekleSaatDate ? '#16a34a' : '#9ca3af' }}>
                  {ekleSaatDate ? `⏰ ${pad(ekleSaatDate.getHours())}:${pad(ekleSaatDate.getMinutes())}` : '⏰ Saat'}
                </Text>
              </TouchableOpacity>
            </View>
            {ekleSaatDate && (
              <TouchableOpacity onPress={() => setEkleSaatDate(null)} style={{ marginBottom: 10, alignItems: 'center' }}>
                <Text style={{ fontSize: 11, color: '#6b7280' }}>Saati kaldır ✕</Text>
              </TouchableOpacity>
            )}
            {showEkleTarihPicker && <>
              <DateTimePicker value={ekleTarihDate} mode="date" display="spinner" locale="tr-TR" onChange={(_, d) => { if (d) setEkleTarihDate(d); }} />
              <TouchableOpacity onPress={() => setShowEkleTarihPicker(false)} style={{ alignSelf: 'center', paddingVertical: 6, paddingHorizontal: 24, marginTop: 4 }}>
                <Text style={{ color: '#3b82f6', fontWeight: '700', fontSize: 14 }}>Tamam</Text>
              </TouchableOpacity>
            </>}
            {showEkleSaatPicker && <>
              <DateTimePicker value={ekleSaatDate ?? new Date()} mode="time" is24Hour display="spinner" onChange={(_, d) => { if (d) setEkleSaatDate(d); }} />
              <TouchableOpacity onPress={() => setShowEkleSaatPicker(false)} style={{ alignSelf: 'center', paddingVertical: 6, paddingHorizontal: 24, marginTop: 4 }}>
                <Text style={{ color: '#3b82f6', fontWeight: '700', fontSize: 14 }}>Tamam</Text>
              </TouchableOpacity>
            </>}
            {!showEkleTarihPicker && !showEkleSaatPicker && (
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                <TouchableOpacity onPress={() => { setEkleModal(false); setEkleBaslik(''); setEkleTarihDate(new Date()); setEkleSaatDate(null); setEkleMusteriIds([]); setEkleMusteriArama(''); }}
                  style={{ flex: 1, padding: 12, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, alignItems: 'center' }}>
                  <Text style={{ fontSize: 13, color: '#6b7280', fontWeight: '500' }}>İptal</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={gorevEkle} style={{ flex: 1, padding: 12, backgroundColor: ekleBaslik.trim() ? '#16a34a' : '#e5e7eb', borderRadius: 8, alignItems: 'center' }}>
                  <Text style={{ fontSize: 13, color: ekleBaslik.trim() ? '#fff' : '#9ca3af', fontWeight: '700' }}>Ekle</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.xl, paddingTop: Spacing.xl, paddingBottom: Spacing.md,
  },
  headerTitle: { fontSize: 22, fontWeight: '700', color: Colors.onSurface },
});
