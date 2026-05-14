import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Modal, Linking, FlatList, SafeAreaView,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import R2Image from '../../../components/R2Image';
import { Colors, Spacing } from '../../../constants/theme';

const ODALAR_ORDER = ['Stüdyo', '1+0', '1+1', '2+1', '3+1', '3+2', '4+1', '5+'];

function istekEslesiyor(istek: any, ilan: any): boolean {
  const istekOzellikIds: string[] = (istek.musteri_istek_ozellikler ?? []).map((o: any) => o.ozellik_id);
  if (!istek.butce_min && !istek.butce_max && !istek.tip && !istek.tercih_konum && !istek.min_oda && !istek.bina_yasi && !istek.kat_sayisi && !istek.bulundugu_kat && !istekOzellikIds.length) return false;
  const f = Number(ilan.fiyat);
  if (istek.butce_min != null && f < Number(istek.butce_min)) return false;
  if (istek.butce_max != null && f > Number(istek.butce_max)) return false;
  if (istek.tip) {
    const tipler = istek.tip.split(',').map((t: string) => t.trim());
    const cats = (ilan.kategori ?? '').split(',').map((s: string) => s.trim()).filter(Boolean);
    if (!cats.some((c: string) => tipler.includes(c))) return false;
  }
  if (istek.tercih_konum) {
    const konumlar = istek.tercih_konum.split('|').map((s: string) => s.trim()).filter(Boolean);
    const eslesti = konumlar.some((konum: string) => {
      const [il, ilce, mah] = konum.split(' / ').map((p: string) => p.trim());
      if (mah) { if (il && ilan.konum?.toLowerCase() !== il.toLowerCase()) return false; if (ilce && ilan.ilce?.toLowerCase() !== ilce.toLowerCase()) return false; return !!ilan.mahalle?.toLowerCase().includes(mah.toLowerCase()); }
      if (ilce) { if (il && ilan.konum?.toLowerCase() !== il.toLowerCase()) return false; return ilan.ilce?.toLowerCase() === ilce.toLowerCase(); }
      if (il) return ilan.konum?.toLowerCase() === il.toLowerCase();
      return false;
    });
    if (!eslesti) return false;
  }
  if (istek.min_oda && ilan.oda_sayisi) {
    const minIdx = ODALAR_ORDER.indexOf(istek.min_oda);
    const ilanIdx = ODALAR_ORDER.indexOf(ilan.oda_sayisi);
    if (minIdx >= 0 && ilanIdx >= 0 && ilanIdx < minIdx) return false;
  }
  if (istek.bina_yasi && ilan.bina_yasi) {
    const list = istek.bina_yasi.split(',').map((s: string) => s.trim());
    if (list.length && !list.includes(ilan.bina_yasi)) return false;
  }
  return true;
}

function tarihGoster(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}

export default function EslesenMusterilerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [ilan, setIlan] = useState<any>(null);
  const [musteriler, setMusteriler] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [secili, setSecili] = useState<any>(null);
  const [detay, setDetay] = useState<{ notlar: any[]; iletisim: any[]; istekler: any[] } | null>(null);
  const [detayYukleniyor, setDetayYukleniyor] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setLoading(false); return; }
      const [{ data: ilanData }, { data: tumMusteriler }] = await Promise.all([
        supabase.from('ilanlar').select('*, ilan_ozellikler(ozellik_id)').eq('id', id).single(),
        supabase.from('musteriler')
          .select('id, ad, soyad, telefon, durum, etiketler, musteri_tipi, musteri_istekler(tip, butce_min, butce_max, tercih_konum, min_oda, bina_yasi, kat_sayisi, bulundugu_kat, musteri_istek_ozellikler(ozellik_id))')
          .eq('user_id', session.user.id),
      ]);
      setIlan(ilanData);
      setMusteriler(
        (tumMusteriler ?? []).filter(m =>
          (m.musteri_istekler ?? []).length > 0 &&
          (m.musteri_istekler ?? []).some((istek: any) => istekEslesiyor(istek, ilanData))
        )
      );
      setLoading(false);
    })();
  }, [id]);

  async function musteriSec(m: any) {
    setSecili(m);
    setDetayYukleniyor(true);
    setDetay(null);
    const [{ data: rpc }, { data: istekler }] = await Promise.all([
      supabase.rpc('get_musteri_detay', { mid: m.id }),
      supabase.from('musteri_istekler').select('*, musteri_istek_ozellikler(ozellik_id)').eq('musteri_id', m.id),
    ]);
    setDetay({
      notlar: ((rpc?.notlar ?? []) as any[]).slice(0, 5),
      iletisim: (rpc?.iletisim ?? []) as any[],
      istekler: (istekler ?? []) as any[],
    });
    setDetayYukleniyor(false);
  }

  if (loading) return (
    <View style={styles.center}><ActivityIndicator color={Colors.secondary} /></View>
  );
  if (!ilan) return (
    <View style={styles.center}><Text style={{ color: Colors.error }}>İlan bulunamadı.</Text></View>
  );

  const ilk = ilan.fotograflar?.[0];
  const konum = [ilan.mahalle, ilan.ilce, ilan.konum].filter(Boolean).join(', ');

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f9fafb' }}>
      <FlatList
        data={musteriler}
        keyExtractor={m => m.id}
        contentContainerStyle={{ padding: Spacing.md }}
        ListHeaderComponent={
          <View>
            {/* Geri Butonu */}
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
              <Text style={styles.backBtnText}>← Geri</Text>
            </TouchableOpacity>

            {/* İlan Özet Kartı */}
            <View style={styles.ilanKart}>
              {ilk && (
                <R2Image source={ilk} style={styles.ilanFoto} resizeMode="cover" size="md" />
              )}
              <View style={styles.ilanBody}>
                <Text style={styles.ilanTip}>{ilan.tip} · {ilan.kategori}</Text>
                <Text style={styles.ilanBaslik} numberOfLines={2}>{ilan.baslik}</Text>
                <Text style={styles.ilanFiyat}>₺{ilan.fiyat?.toLocaleString('tr-TR')}</Text>
                {konum ? <Text style={styles.ilanKonum}>📍 {konum}</Text> : null}
                <View style={styles.tagRow}>
                  {ilan.oda_sayisi ? <View style={styles.tag}><Text style={styles.tagText}>{ilan.oda_sayisi}</Text></View> : null}
                  {ilan.metrekare ? <View style={styles.tag}><Text style={styles.tagText}>{ilan.metrekare} m²</Text></View> : null}
                  {ilan.bina_yasi ? <View style={styles.tag}><Text style={styles.tagText}>{ilan.bina_yasi}</Text></View> : null}
                </View>
              </View>
            </View>

            {/* Başlık */}
            <View style={styles.listHeader}>
              <Text style={styles.listHeaderText}>Eşleşen Müşteriler</Text>
              <View style={styles.badge}><Text style={styles.badgeText}>{musteriler.length}</Text></View>
            </View>
          </View>
        }
        ListEmptyComponent={
          <Text style={styles.empty}>Eşleşen müşteri bulunamadı.</Text>
        }
        renderItem={({ item: m }) => {
          const initials = `${(m.ad ?? '').charAt(0)}${(m.soyad ?? '').charAt(0)}`.toUpperCase() || '?';
          const istekler: any[] = m.musteri_istekler ?? [];
          const tipler = [...new Set(istekler.flatMap((i: any) => i.tip ? i.tip.split(',').map((t: string) => t.trim()) : []))];
          const konumlar = [...new Set(istekler.flatMap((i: any) => i.tercih_konum ? i.tercih_konum.split('|').map((k: string) => k.trim()) : []))];
          const butceler = istekler.flatMap((i: any) => [
            i.butce_min ? `min ₺${Number(i.butce_min).toLocaleString('tr-TR')}` : null,
            i.butce_max ? `max ₺${Number(i.butce_max).toLocaleString('tr-TR')}` : null,
          ]).filter(Boolean) as string[];

          return (
            <TouchableOpacity style={styles.musteriKart} onPress={() => musteriSec(m)} activeOpacity={0.7}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initials}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
                  <Text style={styles.musteriAd}>{m.ad} {m.soyad}</Text>
                  {m.etiketler ? <Text style={styles.etiket}>#{m.etiketler}</Text> : null}
                  <View style={[styles.durumBadge, { backgroundColor: m.durum === 'Aktif' ? 'rgba(58,170,110,0.12)' : '#f3f4f6' }]}>
                    <Text style={[styles.durumText, { color: m.durum === 'Aktif' ? '#3aaa6e' : '#6b7280' }]}>{m.durum}</Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                  {tipler.slice(0, 2).map(t => <View key={t} style={styles.tipTag}><Text style={styles.tipTagText}>{t}</Text></View>)}
                  {konumlar.slice(0, 1).map(k => <View key={k} style={styles.konumTag}><Text style={styles.konumTagText}>{k}</Text></View>)}
                  {butceler.slice(0, 1).map((b, i) => <View key={i} style={styles.butceTag}><Text style={styles.butceTagText}>{b}</Text></View>)}
                </View>
              </View>
              <Text style={{ color: '#d1d5db', fontSize: 20 }}>›</Text>
            </TouchableOpacity>
          );
        }}
      />

      {/* Müşteri Detay Modal */}
      <Modal
        visible={!!secili}
        animationType="slide"
        transparent
        onRequestClose={() => { setSecili(null); setDetay(null); }}
      >
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => { setSecili(null); setDetay(null); }} />
        <View style={styles.modalSheet}>
          {/* Sheet Handle */}
          <View style={styles.sheetHandle} />

          {/* Başlık */}
          {secili && (
            <View style={styles.sheetHeader}>
              <View style={styles.sheetAvatar}>
                <Text style={styles.sheetAvatarText}>
                  {`${(secili.ad ?? '').charAt(0)}${(secili.soyad ?? '').charAt(0)}`.toUpperCase() || '?'}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetAd}>{secili.ad} {secili.soyad}</Text>
                <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
                  <View style={[styles.durumBadge, { backgroundColor: secili.durum === 'Aktif' ? 'rgba(58,170,110,0.12)' : '#f3f4f6' }]}>
                    <Text style={[styles.durumText, { color: secili.durum === 'Aktif' ? '#3aaa6e' : '#6b7280' }]}>{secili.durum}</Text>
                  </View>
                  {secili.musteri_tipi && secili.musteri_tipi !== 'Bireysel' && (
                    <View style={styles.durumBadge}><Text style={styles.durumText}>{secili.musteri_tipi}</Text></View>
                  )}
                </View>
              </View>
              <View style={{ gap: 8 }}>
                {secili.telefon && (
                  <TouchableOpacity style={styles.telBtn} onPress={() => Linking.openURL(`tel:${secili.telefon}`)}>
                    <Text style={styles.telBtnText}>📞</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={styles.detayBtn} onPress={() => { setSecili(null); setDetay(null); router.push(`/musteri/${secili.id}` as any); }}>
                  <Text style={styles.detayBtnText}>Detay</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {detayYukleniyor ? (
            <View style={styles.center}><ActivityIndicator color={Colors.secondary} /></View>
          ) : (
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: Spacing.md, gap: 20 }}>

              {/* Telefon */}
              {secili?.telefon && (
                <TouchableOpacity onPress={() => Linking.openURL(`tel:${secili.telefon}`)}>
                  <Text style={{ fontSize: 14, color: '#374151', fontWeight: '600' }}>📞 {secili.telefon}</Text>
                </TouchableOpacity>
              )}

              {/* Ek Kişiler */}
              {(detay?.iletisim ?? []).length > 0 && (
                <View>
                  <Text style={styles.sectionTitle}>Ek Kişiler</Text>
                  {(detay?.iletisim ?? []).map((k: any) => (
                    <View key={k.id} style={styles.ekKisiRow}>
                      <Text style={{ fontSize: 14, fontWeight: '600', color: '#374151', flex: 1 }}>{k.ad}</Text>
                      {k.tip ? <Text style={{ fontSize: 12, color: '#9ca3af' }}>{k.tip}</Text> : null}
                      {k.telefon ? (
                        <TouchableOpacity onPress={() => Linking.openURL(`tel:${k.telefon}`)}>
                          <Text style={{ fontSize: 12, color: '#6b7280' }}>📞 {k.telefon}</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  ))}
                </View>
              )}

              {/* İstekler */}
              {(detay?.istekler ?? []).length > 0 && (
                <View>
                  <Text style={styles.sectionTitle}>İstekler</Text>
                  {(detay?.istekler ?? []).map((istek: any, idx: number) => (
                    <View key={istek.id} style={styles.istekKart}>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginBottom: 6 }}>
                        <View style={styles.istekNo}><Text style={{ fontSize: 10, color: '#fff', fontWeight: '700' }}>#{idx + 1}</Text></View>
                        {(istek.butce_min || istek.butce_max) && (
                          <Text style={{ fontSize: 14, fontWeight: '800', color: '#1a1b21' }}>
                            {istek.butce_min ? `₺${Number(istek.butce_min).toLocaleString('tr-TR')}` : '—'}
                            {' – '}
                            {istek.butce_max ? `₺${Number(istek.butce_max).toLocaleString('tr-TR')}` : '—'}
                          </Text>
                        )}
                        {istek.tip && istek.tip.split(',').map((t: string) => (
                          <View key={t} style={styles.tipTag}><Text style={styles.tipTagText}>{t.trim()}</Text></View>
                        ))}
                      </View>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
                        {istek.tercih_konum && istek.tercih_konum.split('|').map((k: string) => (
                          <View key={k} style={styles.konumTag}><Text style={styles.konumTagText}>{k.trim()}</Text></View>
                        ))}
                        {istek.min_oda ? <View style={styles.odaTag}><Text style={styles.odaTagText}>Min {istek.min_oda}</Text></View> : null}
                        {istek.bina_yasi && istek.bina_yasi.split(',').map((b: string) => (
                          <View key={b} style={styles.yasTag}><Text style={styles.yasTagText}>{b.trim()}</Text></View>
                        ))}
                      </View>
                    </View>
                  ))}
                </View>
              )}

              {/* Notlar */}
              {(detay?.notlar ?? []).length > 0 && (
                <View>
                  <Text style={styles.sectionTitle}>Son Notlar</Text>
                  {(detay?.notlar ?? []).map((n: any) => (
                    <View key={n.id} style={styles.notKart}>
                      <Text style={styles.notTarih}>{tarihGoster(n.tarih)}</Text>
                      <Text style={styles.notIcerik}>{n.icerik}</Text>
                    </View>
                  ))}
                </View>
              )}

            </ScrollView>
          )}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  backBtn: { marginBottom: 12 },
  backBtnText: { fontSize: 14, color: Colors.secondary, fontWeight: '600' },

  ilanKart: { backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden', marginBottom: 20, borderWidth: 1, borderColor: '#e5e7eb' },
  ilanFoto: { width: '100%', height: 180 },
  ilanBody: { padding: 16 },
  ilanTip: { fontSize: 11, fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 },
  ilanBaslik: { fontSize: 17, fontWeight: '800', color: '#1a1b21', marginBottom: 4 },
  ilanFiyat: { fontSize: 20, fontWeight: '800', color: '#E53935', marginBottom: 4 },
  ilanKonum: { fontSize: 13, color: '#6b7280', marginBottom: 8 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: { paddingHorizontal: 10, paddingVertical: 3, backgroundColor: '#f3f4f6', borderRadius: 999 },
  tagText: { fontSize: 12, fontWeight: '600', color: '#374151' },

  listHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  listHeaderText: { fontSize: 15, fontWeight: '700', color: '#1a1b21' },
  badge: { backgroundColor: '#E53935', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { fontSize: 11, fontWeight: '700', color: '#fff' },
  empty: { textAlign: 'center', color: '#9ca3af', fontSize: 14, paddingVertical: 32 },

  musteriKart: { backgroundColor: '#fff', borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8, borderWidth: 1, borderColor: '#e5e7eb' },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#6b7280', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  avatarText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  musteriAd: { fontSize: 14, fontWeight: '700', color: '#1a1b21' },
  etiket: { fontSize: 11, color: '#9ca3af', fontWeight: '600' },
  durumBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, backgroundColor: '#f3f4f6' },
  durumText: { fontSize: 11, fontWeight: '600', color: '#6b7280' },
  tipTag: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, backgroundColor: 'rgba(59,130,246,0.08)' },
  tipTagText: { fontSize: 11, fontWeight: '600', color: '#2563eb' },
  konumTag: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, backgroundColor: '#f0fdf4' },
  konumTagText: { fontSize: 11, fontWeight: '600', color: '#16a34a' },
  butceTag: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, backgroundColor: '#fff7ed' },
  butceTagText: { fontSize: 11, fontWeight: '600', color: '#c2410c' },
  odaTag: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, backgroundColor: 'rgba(124,58,237,0.08)' },
  odaTagText: { fontSize: 11, fontWeight: '600', color: '#7c3aed' },
  yasTag: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, backgroundColor: 'rgba(245,158,11,0.1)' },
  yasTagText: { fontSize: 11, fontWeight: '600', color: '#d97706' },

  modalOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)' },
  modalSheet: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '80%', minHeight: '50%' },
  sheetHandle: { width: 40, height: 4, backgroundColor: '#e5e7eb', borderRadius: 2, alignSelf: 'center', marginTop: 12, marginBottom: 4 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  sheetAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#E53935', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  sheetAvatarText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  sheetAd: { fontSize: 16, fontWeight: '800', color: '#1a1b21' },
  telBtn: { width: 36, height: 36, borderRadius: 8, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center' },
  telBtnText: { fontSize: 16 },
  detayBtn: { paddingHorizontal: 12, paddingVertical: 7, backgroundColor: '#E53935', borderRadius: 8 },
  detayBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },

  sectionTitle: { fontSize: 11, fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 },
  ekKisiRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, backgroundColor: '#f9fafb', borderRadius: 8, marginBottom: 6 },
  istekKart: { backgroundColor: '#fafafa', borderWidth: 1, borderColor: '#e5e7eb', borderLeftWidth: 3, borderLeftColor: '#E53935', borderRadius: 10, padding: 12, marginBottom: 8 },
  istekNo: { paddingHorizontal: 6, paddingVertical: 1, backgroundColor: '#E53935', borderRadius: 999 },
  notKart: { backgroundColor: 'rgba(254,243,199,0.7)', borderWidth: 1, borderColor: '#fde68a', borderRadius: 8, padding: 12, marginBottom: 6 },
  notTarih: { fontSize: 11, fontWeight: '600', color: '#92400e', marginBottom: 4 },
  notIcerik: { fontSize: 13, color: '#78350f', lineHeight: 20 },
});
