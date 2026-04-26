import { useEffect, useState, useCallback, useRef } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, Linking, Modal, FlatList, Image, Keyboard, Share,
} from 'react-native';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { Colors, Radius, Spacing } from '../../constants/theme';
import { Musteri, Ilan } from '../../types';
import R2Image from '../../components/R2Image';
import { TURKIYE, IL_LISTESI, MAHALLELER } from '../../constants/turkiye';

const ILLER = TURKIYE;
const ILLER_LISTESI = IL_LISTESI;

const durumlar: ('Aktif' | 'Beklemede' | 'İptal')[] = ['Aktif', 'Beklemede', 'İptal'];
const EMLAK_TIPLERI = ['Daire', 'Villa', 'Arsa', 'İşyeri', 'Müstakil Ev', 'Rezidans'];
const ODALAR = ['Stüdyo', '1+0', '1+1', '2+1', '3+1', '3+2', '4+1', '5+'];
const BINA_YASLARI = ['0', '1', '2', '3', '4', '5', '6-10', '11-15', '16-20', '21-25', '+30'];

function tarihFormat(iso: string) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}
function isoFormat(tr: string) {
  const parts = tr.split('.');
  if (parts.length !== 3) return '';
  return `${parts[2]}-${parts[1]}-${parts[0]}`;
}

export default function MusteriDetayScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [musteri, setMusteri] = useState<Musteri | null>(null);
  const [eslesen, setEslesen] = useState<Ilan[]>([]);
  const [elleEslesen, setElleEslesen] = useState<{id: string; ilan: Ilan}[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [duzenle, setDuzenle] = useState(false);

  // Editable fields
  const [ad, setAd] = useState('');
  const [soyad, setSoyad] = useState('');
  const [telefon, setTelefon] = useState('');
  const [butceMin, setButceMin] = useState('');
  const [butceMax, setButceMax] = useState('');
  const [konumlar, setKonumlar] = useState<string[]>([]);
  const [tempIl, setTempIl] = useState('');
  const [tempIlce, setTempIlce] = useState('');
  const [tempMahalle, setTempMahalle] = useState('');
  const [tercihTipler, setTercihTipler] = useState<string[]>([]);
  const [minOda, setMinOda] = useState('');
  const [ozelIstekler, setOzelIstekler] = useState<string[]>([]);
  const [takipTarihi, setTakipTarihi] = useState('');
  const [tumOzellikler, setTumOzellikler] = useState<{id: string; ad: string}[]>([]);
  const [binaYaslari, setBinaYaslari] = useState<string[]>([]);
  const [notlar, setNotlar] = useState('');
  const [etiket, setEtiket] = useState('');
  const [durum, setDurum] = useState<'Aktif' | 'Beklemede' | 'İptal'>('Aktif');
  const [konumModal, setKonumModal] = useState(false);
  const [konumAcik, setKonumAcik] = useState(false);
  const [konumSayfa, setKonumSayfa] = useState<'il' | 'ilce' | 'mahalle'>('il');
  const [konumSearch, setKonumSearch] = useState('');

  function konumEkle(il: string, ilce?: string, mahalle?: string) {
    const k = [il, ilce, mahalle].filter(Boolean).join(' / ');
    setKonumlar(prev => prev.includes(k) ? prev : [...prev, k]);
  }
  const [ilanModal, setIlanModal] = useState(false);
  const [tumIlanlar, setTumIlanlar] = useState<Ilan[]>([]);
  const [ilanSearch, setIlanSearch] = useState('');
  const [pendingIlanlar, setPendingIlanlar] = useState<Ilan[]>([]);
  const [eslesiyorBulk, setEslesiyorBulk] = useState(false);

  // Link paylaş
  const [linkModal, setLinkModal] = useState(false);
  const [linkTumIlanlar, setLinkTumIlanlar] = useState<Ilan[]>([]);
  const [linkSecimIds, setLinkSecimIds] = useState<string[]>([]);
  const [linkUrl, setLinkUrl] = useState<string | null>(null);
  const [linkYukleniyor, setLinkYukleniyor] = useState(false);
  const [linkSearch, setLinkSearch] = useState('');
  const [linkPortfoySearch, setLinkPortfoySearch] = useState('');
  const [linkSaat, setLinkSaat] = useState('24');


  const fetchMusteri = useCallback(async () => {
    const { data } = await supabase.from('musteriler').select('*').eq('id', id).single();
    if (data) {
      setMusteri(data);
      setAd(data.ad ?? '');
      setSoyad(data.soyad ?? '');
      setTelefon(data.telefon ?? '');
      setButceMin(data.butce_min ? formatButce(String(data.butce_min)) : '');
      setButceMax(data.butce_max ? formatButce(String(data.butce_max)) : '');
      setKonumlar((data.tercih_konum ?? '').split('|').filter(Boolean));
      setTercihTipler(data.tercih_tip ? data.tercih_tip.split(',') : []);
      setMinOda(data.min_oda ?? '');
      setOzelIstekler(data.ozel_istekler ? data.ozel_istekler.split(',') : []);
      setTakipTarihi(data.takip_tarihi ? tarihFormat(data.takip_tarihi) : '');
      setNotlar(data.notlar ?? '');
      setBinaYaslari(data.bina_yasi ? data.bina_yasi.split(',') : []);
      setEtiket(data.etiketler ?? '');
      setDurum(data.durum ?? 'Aktif');

      // Özellikler listesi
      const { data: ozData } = await supabase.from('ozellikler').select('*').order('olusturma_tarihi');
      if (ozData) setTumOzellikler(ozData);

      // Eşleşen ilanlar
      let query = supabase.from('ilanlar').select('*');
      if (data.butce_min) query = query.gte('fiyat', data.butce_min);
      if (data.butce_max) query = query.lte('fiyat', data.butce_max);
      if (data.tercih_tip) {
        const tipler = data.tercih_tip.split(',').map((t: string) => t.trim()).filter(Boolean);
        if (tipler.length > 0) query = query.or(tipler.map((t: string) => `kategori.ilike.%${t}%`).join(','));
      }
      if (data.tercih_konum) {
        const konumListesi = data.tercih_konum.split('|').filter(Boolean);
        if (konumListesi.length === 1) {
          const [il, ilce, mah] = konumListesi[0].split(' / ').map((p: string) => p.trim());
          if (il) query = query.ilike('konum', il);
          if (ilce) query = query.ilike('ilce', ilce);
          if (mah) query = query.ilike('mahalle', `%${mah}%`);
        } else if (konumListesi.length > 1) {
          const iller = konumListesi.map(k => k.split(' / ')[0].trim()).filter(Boolean);
          const orStr = iller.map(il => `konum.ilike.${il}`).join(',');
          query = query.or(orStr);
        }
      }
      if (!data.butce_min && !data.butce_max && !data.tercih_tip && !data.tercih_konum) {
        setEslesen([]);
      } else {
        const { data: ilanlar } = await query.limit(20);
        setEslesen(ilanlar ?? []);
      }

      // Elle eşleştirilenler
      const { data: eslesme } = await supabase
        .from('eslesmeler')
        .select('id, ilan_id, ilanlar(*)')
        .eq('musteri_id', id);
      setElleEslesen((eslesme ?? []).map((e: any) => ({ id: e.id, ilan: e.ilanlar })));
    }
    setLoading(false);
  }, [id]);

  useEffect(() => { fetchMusteri(); }, [id]);
  useFocusEffect(useCallback(() => { fetchMusteri(); }, [fetchMusteri]));

  function formatButce(val: string) {
    const digits = val.replace(/\D/g, '');
    return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  async function handleKaydet() {
    if (!ad) { Alert.alert('Hata', 'Ad zorunludur.'); return; }
    setSaving(true);
    const { error } = await supabase.from('musteriler').update({
      ad, soyad: soyad || null,
      telefon: telefon || null,
      butce_min: butceMin ? parseInt(butceMin.replace(/\./g, '')) : null,
      butce_max: butceMax ? parseInt(butceMax.replace(/\./g, '')) : null,
      tercih_konum: konumlar.length ? konumlar.join('|') : null,
      tercih_tip: tercihTipler.length ? tercihTipler.join(',') : null,
      min_oda: minOda || null,
      ozel_istekler: ozelIstekler.length ? ozelIstekler.join(',') : null,
      takip_tarihi: takipTarihi ? isoFormat(takipTarihi) : null,
      notlar: notlar || null,
      bina_yasi: binaYaslari.length ? binaYaslari.join(',') : null,
      etiketler: etiket.trim() || null,
      durum,
    }).eq('id', id);

    if (error) Alert.alert('Hata', error.message);
    else { setDuzenle(false); fetchMusteri(); }
    setSaving(false);
  }

  async function handleIlanModalAc() {
    const { data } = await supabase.from('ilanlar').select('*').eq('durum', 'Aktif').order('olusturma_tarihi', { ascending: false });
    setTumIlanlar(data ?? []);
    setIlanSearch('');
    setPendingIlanlar([]);
    setIlanModal(true);
  }

  function togglePendingIlan(ilan: Ilan) {
    const zaten = elleEslesen.some(e => e.ilan?.id === ilan.id);
    if (zaten) return;
    setPendingIlanlar(prev =>
      prev.some(i => i.id === ilan.id) ? prev.filter(i => i.id !== ilan.id) : [...prev, ilan]
    );
  }

  async function handleEslesBulk() {
    if (pendingIlanlar.length === 0) return;
    setEslesiyorBulk(true);
    for (const ilan of pendingIlanlar) {
      const zaten = elleEslesen.some(e => e.ilan?.id === ilan.id);
      if (!zaten) {
        await supabase.from('eslesmeler').insert({ musteri_id: id, ilan_id: ilan.id });
      }
    }
    setIlanModal(false);
    setPendingIlanlar([]);
    setEslesiyorBulk(false);
    fetchMusteri();
  }

  async function handleEslesIptal(eslesmeId: string) {
    Alert.alert('Eşleşmeyi İptal Et', 'Bu eşleştirmeyi kaldırmak istediğinize emin misiniz?', [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'İptal Et', style: 'destructive', onPress: async () => {
        await supabase.from('eslesmeler').delete().eq('id', eslesmeId);
        fetchMusteri();
      }},
    ]);
  }

  async function handleLinkModalAc() {
    setLinkModal(true);
    setLinkUrl(null);
    setLinkSecimIds([]);
    setLinkSearch('');
    setLinkPortfoySearch('');
    if (linkTumIlanlar.length === 0) {
      setLinkYukleniyor(true);
      const { data } = await supabase.from('ilanlar').select('*').eq('durum', 'Aktif').order('olusturma_tarihi', { ascending: false });
      setLinkTumIlanlar(data ?? []);
      setLinkYukleniyor(false);
    }
  }

  function toggleLinkIlan(ilanId: string) {
    setLinkSecimIds(prev => prev.includes(ilanId) ? prev.filter(x => x !== ilanId) : [...prev, ilanId]);
  }

  async function handleLinkOlustur() {
    if (linkSecimIds.length === 0) return;
    setLinkYukleniyor(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setLinkYukleniyor(false); return; }
    const expiresAt = new Date(Date.now() + parseInt(linkSaat) * 60 * 60 * 1000).toISOString();
    const { data: mevcutMt } = await supabase.from('musteri_tokenler').select('token').eq('user_id', session.user.id).eq('musteri_id', id).single();
    let musteriToken: string;
    if (mevcutMt) {
      musteriToken = mevcutMt.token;
      await supabase.from('musteri_tokenler').update({ expires_at: expiresAt }).eq('user_id', session.user.id).eq('musteri_id', id);
    } else {
      const arr = new Uint8Array(12);
      crypto.getRandomValues(arr);
      musteriToken = Array.from(arr).map(b => b.toString(36).padStart(2, '0')).join('').slice(0, 16);
      await supabase.from('musteri_tokenler').insert({ token: musteriToken, user_id: session.user.id, musteri_id: id, expires_at: expiresAt });
    }
    const trMap: Record<string, string> = { ğ:'g', ü:'u', ş:'s', ı:'i', ö:'o', ç:'c', İ:'i', Ğ:'g', Ü:'u', Ş:'s', Ö:'o', Ç:'c' };
    const adNorm = (musteri?.ad ?? '').toLowerCase().replace(/[ğüşıöçİĞÜŞÖÇ]/g, (c: string) => trMap[c] ?? c).replace(/[^a-z0-9]/g, '').slice(0, 10);
    const arr2 = new Uint8Array(3);
    crypto.getRandomValues(arr2);
    const suffix = Array.from(arr2).map(b => b.toString(36)).join('').slice(0, 4);
    const paketToken = `${adNorm || 'ilan'}-${suffix}`;
    const { error } = await supabase.from('paylasim_paketleri').insert({ token: paketToken, ilan_ids: linkSecimIds, emlakci_id: session.user.id, musteri_token: musteriToken, expires_at: expiresAt });
    if (error) { Alert.alert('Hata', error.message); setLinkYukleniyor(false); return; }
    const url = `https://www.emlak-otomasyon.com/ozel-ilanlar/${paketToken}/${musteriToken}`;
    setLinkUrl(url);
    setLinkYukleniyor(false);
  }

  async function handleSil() {
    Alert.alert('Müşteriyi Sil', 'Bu müşteriyi silmek istediğinize emin misiniz?', [
      { text: 'İptal', style: 'cancel' },
      { text: 'Sil', style: 'destructive', onPress: async () => {
        await supabase.from('musteriler').delete().eq('id', id);
        router.replace('/(tabs)/musteriler');
      }},
    ]);
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}><ActivityIndicator size="large" color={Colors.primary} /></View>
      </SafeAreaView>
    );
  }

  if (!musteri) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}><Text>Müşteri bulunamadı</Text></View>
      </SafeAreaView>
    );
  }

  const initials = `${ad[0] ?? '?'}${soyad[0] ?? ''}`.toUpperCase();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.geri}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{ad} {soyad}</Text>
        <View style={styles.headerActions}>
          {duzenle ? (
            <TouchableOpacity style={styles.kaydetBtn} onPress={handleKaydet} disabled={saving}>
              {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.kaydetText}>Kaydet</Text>}
            </TouchableOpacity>
          ) : (
            <>
              <TouchableOpacity style={styles.duzenleBtn} onPress={() => setDuzenle(true)}>
                <Text style={styles.duzenleBtnText}>✏️ Düzenle</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.linkBtn} onPress={handleLinkModalAc}>
                <Text style={styles.linkBtnText}>🔗</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.silBtn} onPress={handleSil}>
                <Text style={styles.silBtnText}>🗑️</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" automaticallyAdjustKeyboardInsets={true}>

          {/* Avatar + İletişim */}
          <View style={styles.profilBox}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={styles.profilAd}>{ad} {soyad}</Text>
              {telefon ? (
                <TouchableOpacity onPress={() => Linking.openURL(`tel:${telefon}`)}>
                  <Text style={styles.profilTelefon}>📞 {telefon}</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            <View style={{ alignItems: 'flex-end', gap: 6 }}>
              <View style={[styles.durumBadge, {
                backgroundColor: durum === 'Aktif' ? '#dcfce7' : durum === 'Beklemede' ? '#fef9c3' : '#fee2e2'
              }]}>
                <Text style={[styles.durumBadgeText, {
                  color: durum === 'Aktif' ? '#166534' : durum === 'Beklemede' ? '#854d0e' : '#991b1b'
                }]}>{durum}</Text>
              </View>
              {etiket ? <View style={styles.etiketBadge}><Text style={styles.etiketBadgeText}>#{etiket}</Text></View> : null}
            </View>
          </View>

          {duzenle ? (
            <>
              <View style={styles.satir}>
                <View style={{ flex: 1 }}>
                  <Field label="Ad *" value={ad} onChangeText={setAd} placeholder="Ahmet" />
                </View>
                <View style={{ flex: 1 }}>
                  <Field label="Soyad" value={soyad} onChangeText={setSoyad} placeholder="Yılmaz" />
                </View>
                <View style={[styles.inputContainer, { width: 80 }]}>
                  <Text style={styles.label}>Etiket</Text>
                  <View style={styles.etiketInputRow}>
                    <Text style={styles.etiketHash}>#</Text>
                    <TextInput
                      style={styles.etiketInput}
                      placeholder="12"
                      placeholderTextColor={Colors.outlineVariant}
                      value={etiket}
                      onChangeText={v => setEtiket(v.replace(/[#\s]/g, ''))}
                      autoCapitalize="none"
                      returnKeyType="done"
                    />
                  </View>
                </View>
              </View>
              <Field label="Telefon" value={telefon} onChangeText={setTelefon} placeholder="05xx xxx xx xx" keyboardType="phone-pad" />
              <View style={styles.satir}>
                <View style={{ flex: 1 }}>
                  <Field label="Bütçe Min (₺)" value={butceMin} onChangeText={v => setButceMin(formatButce(v))} placeholder="500.000" keyboardType="numeric" />
                </View>
                <View style={{ flex: 1 }}>
                  <Field label="Bütçe Max (₺)" value={butceMax} onChangeText={v => setButceMax(formatButce(v))} placeholder="2.000.000" keyboardType="numeric" />
                </View>
              </View>
              <View style={styles.inputContainer}>
                <Text style={styles.label}>Tercih Edilen Konum</Text>
                {konumlar.map((k, i) => (
                  <View key={i} style={styles.konumChip}>
                    <Text style={styles.konumChipText}>📍 {k}</Text>
                    <TouchableOpacity onPress={() => setKonumlar(prev => prev.filter((_, j) => j !== i))}>
                      <Text style={styles.konumChipSil}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ))}
                <TouchableOpacity style={styles.secimBtn} onPress={() => { setTempIl(''); setTempIlce(''); setTempMahalle(''); setKonumSearch(''); setKonumSayfa('il'); setKonumModal(true); }}>
                  <Text style={styles.secimBtnPlaceholder}>+ Konum Ekle</Text>
                  <Text style={styles.secimChevron}>›</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.inputContainer}>
                <Text style={styles.label}>Tercih Edilen Tip</Text>
                <View style={styles.chipRow}>
                  {EMLAK_TIPLERI.map(t => {
                    const secili = tercihTipler.includes(t);
                    return (
                      <TouchableOpacity
                        key={t}
                        style={[styles.chip, secili && styles.chipActive]}
                        onPress={() => setTercihTipler(prev =>
                          secili ? prev.filter(x => x !== t) : [...prev, t]
                        )}
                      >
                        <Text style={[styles.chipText, secili && styles.chipTextActive]}>{t}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
              <View style={styles.inputContainer}>
                <Text style={styles.label}>Minimum Oda Sayısı</Text>
                <View style={styles.chipRow}>
                  {ODALAR.map(o => {
                    const secili = minOda === o;
                    return (
                      <TouchableOpacity
                        key={o}
                        style={[styles.chip, secili && styles.chipActive]}
                        onPress={() => setMinOda(secili ? '' : o)}
                      >
                        <Text style={[styles.chipText, secili && styles.chipTextActive]}>{o}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
              <View style={styles.inputContainer}>
                <Text style={styles.label}>Bina Yaşı Tercihi</Text>
                <View style={styles.chipRow}>
                  {BINA_YASLARI.map(y => {
                    const secili = binaYaslari.includes(y);
                    return (
                      <TouchableOpacity key={y} style={[styles.chip, secili && styles.chipActive]}
                        onPress={() => setBinaYaslari(prev => secili ? prev.filter(x => x !== y) : [...prev, y])}>
                        <Text style={[styles.chipText, secili && styles.chipTextActive]}>{y}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
              {tumOzellikler.length > 0 && (
                <View style={styles.inputContainer}>
                  <Text style={styles.label}>Özel İstekler</Text>
                  <View style={styles.chipRow}>
                    {tumOzellikler.map(oz => {
                      const secili = ozelIstekler.includes(oz.ad);
                      return (
                        <TouchableOpacity
                          key={oz.id}
                          style={[styles.chip, secili && styles.chipActive]}
                          onPress={() => setOzelIstekler(prev =>
                            secili ? prev.filter(x => x !== oz.ad) : [...prev, oz.ad]
                          )}
                        >
                          <Text style={[styles.chipText, secili && styles.chipTextActive]}>{oz.ad}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}
              <View style={styles.inputContainer}>
                <Text style={styles.label}>Takip Tarihi</Text>
                <TextInput
                  style={styles.input}
                  placeholder="GG.AA.YYYY"
                  placeholderTextColor={Colors.outlineVariant}
                  value={takipTarihi}
                  onChangeText={setTakipTarihi}
                  keyboardType="numeric"
                  maxLength={10}
                />
              </View>
              <View style={styles.inputContainer}>
                <Text style={styles.label}>Notlar</Text>
                <TextInput
                  style={[styles.input, styles.textarea]}
                  placeholder="Müşteri hakkında notlar..."
                  placeholderTextColor={Colors.outlineVariant}
                  value={notlar}
                  onChangeText={setNotlar}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                />
              </View>
              <View style={styles.inputContainer}>
                <Text style={styles.label}>Durum</Text>
                <View style={styles.durumRow}>
                  {durumlar.map(d => (
                    <TouchableOpacity
                      key={d}
                      style={[styles.durumBtn, durum === d && styles.durumBtnAktif]}
                      onPress={() => setDurum(d)}
                    >
                      <Text style={[styles.durumBtnText, durum === d && styles.durumBtnTextAktif]}>{d}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </>
          ) : (
            <>
                {/* Bütçe & Konum Bilgisi */}
                  <View style={styles.infoBox}>
                    {(butceMin || butceMax) ? (
                      <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>Bütçe</Text>
                        <Text style={styles.infoDeger}>
                          ₺{butceMin || '?'} – ₺{butceMax || '?'}
                        </Text>
                      </View>
                    ) : null}
                    {konumlar.length > 0 ? (
                      <View style={[styles.infoRow, { alignItems: 'flex-start' }]}>
                        <Text style={[styles.infoLabel, { paddingTop: 2 }]}>Tercih Konum</Text>
                        <View style={{ flex: 1, alignItems: 'flex-end' }}>
                          {(konumAcik ? konumlar : konumlar.slice(0, 2)).map((k, i) => (
                            <Text key={i} style={[styles.infoDeger, { textAlign: 'right' }]}>📍 {k}</Text>
                          ))}
                          {konumlar.length > 2 && (
                            <TouchableOpacity onPress={() => setKonumAcik(p => !p)}>
                              <Text style={{ fontSize: 12, color: Colors.primary, marginTop: 2 }}>
                                {konumAcik ? 'Daha az göster' : `+${konumlar.length - 2} daha...`}
                              </Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      </View>
                    ) : null}
                    {tercihTipler.length > 0 ? (
                      <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>Tercih Tip</Text>
                        <Text style={styles.infoDeger}>{tercihTipler.join(', ')}</Text>
                      </View>
                    ) : null}
                    {minOda ? (
                      <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>Min. Oda</Text>
                        <Text style={styles.infoDeger}>{minOda}</Text>
                      </View>
                    ) : null}
                    {binaYaslari.length > 0 ? (
                      <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>Bina Yaşı</Text>
                        <Text style={[styles.infoDeger, { flex: 1, textAlign: 'right' }]}>{binaYaslari.join(', ')}</Text>
                      </View>
                    ) : null}
                    {ozelIstekler.length > 0 ? (
                      <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>Özel İstekler</Text>
                        <Text style={[styles.infoDeger, { flex: 1, textAlign: 'right' }]}>{ozelIstekler.join(', ')}</Text>
                      </View>
                    ) : null}
                    {takipTarihi ? (
                      <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>Takip Tarihi</Text>
                        <Text style={[styles.infoDeger, { color: Colors.primary }]}>📅 {takipTarihi}</Text>
                      </View>
                    ) : null}
                    {notlar ? (
                      <View style={[styles.infoRow, { borderBottomWidth: 0 }]}>
                        <Text style={styles.infoLabel}>Notlar</Text>
                        <Text style={[styles.infoDeger, { flex: 1, textAlign: 'right' }]}>{notlar}</Text>
                      </View>
                    ) : null}
                  </View>

                  {/* Elle Eşleştirilenler */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Spacing.sm }}>
                    <Text style={styles.sectionTitle}>Elle Eşleştirilenler</Text>
                    <TouchableOpacity style={styles.eslesBtn} onPress={handleIlanModalAc}>
                      <Text style={styles.eslesBtnText}>+ İlan Eşleştir</Text>
                    </TouchableOpacity>
                  </View>
                  {elleEslesen.length === 0 ? (
                    <View style={styles.emptyBox}>
                      <Text style={styles.emptyText}>Elle eşleştirilmiş ilan yok</Text>
                </View>
              ) : (
                elleEslesen.map(({ id: eslesmeId, ilan }) => ilan ? (
                  <View key={eslesmeId} style={styles.ilanKartWrap}>
                    <TouchableOpacity style={[styles.ilanKart, { flex: 1 }]} onPress={() => router.push(`/ilan/${ilan.id}` as any)}>
                      {ilan.fotograflar?.[0] ? (
                        <R2Image source={ilan.fotograflar[0]} style={styles.ilanFoto} resizeMode="cover" size="sm" />
                      ) : (
                        <View style={styles.ilanFotoPlaceholder}>
                          <Text style={{ fontSize: 20 }}>🏠</Text>
                        </View>
                      )}
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={styles.ilanBaslik} numberOfLines={1}>{ilan.baslik}</Text>
                          <View style={styles.elleBadge}><Text style={styles.elleBadgeText}>Elle</Text></View>
                        </View>
                        <Text style={styles.ilanKonum}>📍 {ilan.konum}{ilan.ilce ? `, ${ilan.ilce}` : ''}</Text>
                      </View>
                      <Text style={styles.ilanFiyat}>₺{ilan.fiyat?.toLocaleString('tr-TR')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.iptalBtn} onPress={() => handleEslesIptal(eslesmeId)}>
                      <Text style={styles.iptalBtnText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ) : null)
              )}

              {/* Otomatik Eşleşenler */}
              <Text style={[styles.sectionTitle, { marginTop: 12 }]}>Otomatik Eşleşenler</Text>
              {eslesen.filter(ilan => !elleEslesen.some(e => e.ilan?.id === ilan.id)).length === 0 ? (
                <View style={styles.emptyBox}>
                  <Text style={styles.emptyText}>Bütçeye uygun ilan bulunamadı</Text>
                </View>
              ) : (
                eslesen
                  .filter(ilan => !elleEslesen.some(e => e.ilan?.id === ilan.id))
                  .map(ilan => (
                    <TouchableOpacity key={ilan.id} style={styles.ilanKart} onPress={() => router.push(`/ilan/${ilan.id}` as any)}>
                      {ilan.fotograflar?.[0] ? (
                        <R2Image source={ilan.fotograflar[0]} style={styles.ilanFoto} resizeMode="cover" size="sm" />
                      ) : (
                        <View style={styles.ilanFotoPlaceholder}>
                          <Text style={{ fontSize: 20 }}>🏠</Text>
                        </View>
                      )}
                      <View style={{ flex: 1 }}>
                        <Text style={styles.ilanBaslik} numberOfLines={1}>{ilan.baslik}</Text>
                        <Text style={styles.ilanKonum}>📍 {ilan.konum}{ilan.ilce ? `, ${ilan.ilce}` : ''}</Text>
                      </View>
                      <Text style={styles.ilanFiyat}>₺{ilan.fiyat.toLocaleString('tr-TR')}</Text>
                    </TouchableOpacity>
                  ))
              )}
            </>
          )}

        </ScrollView>

      {/* İlan Seçim Modali (çoklu) */}
      <Modal visible={ilanModal} animationType="slide" transparent onRequestClose={() => setIlanModal(false)}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalDimmer} onPress={() => setIlanModal(false)} />
          <View style={[styles.modalPanel, { maxHeight: '85%' }]}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setIlanModal(false)}>
                <Text style={styles.modalKapat}>✕</Text>
              </TouchableOpacity>
              <Text style={styles.modalBaslik}>İlan Seç</Text>
              <View style={{ width: 32 }} />
            </View>
            <TextInput
              style={styles.modalSearch}
              placeholder="İlan ara..."
              placeholderTextColor={Colors.outlineVariant}
              value={ilanSearch}
              onChangeText={setIlanSearch}
            />
            <FlatList
              data={tumIlanlar.filter(i =>
                i.baslik?.toLowerCase().includes(ilanSearch.toLowerCase()) ||
                i.konum?.toLowerCase().includes(ilanSearch.toLowerCase())
              )}
              keyExtractor={item => item.id}
              renderItem={({ item }) => {
                const zaten = elleEslesen.some(e => e.ilan?.id === item.id);
                const secili = pendingIlanlar.some(i => i.id === item.id);
                return (
                  <TouchableOpacity
                    style={[styles.ilanKart, { marginHorizontal: Spacing.md, marginBottom: Spacing.sm, opacity: zaten ? 0.5 : 1, backgroundColor: secili ? Colors.primaryFixed : Colors.surfaceContainerLowest }]}
                    onPress={() => !zaten && togglePendingIlan(item)}
                    disabled={zaten}
                  >
                    <View style={[styles.secimKutucuk, { borderColor: secili ? Colors.primary : Colors.outline, backgroundColor: secili ? Colors.primary : 'transparent' }]}>
                      {secili && <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>✓</Text>}
                    </View>
                    {item.fotograflar?.[0] ? (
                      <R2Image source={item.fotograflar[0]} style={styles.ilanFoto} resizeMode="cover" size="sm" />
                    ) : (
                      <View style={styles.ilanFotoPlaceholder}>
                        <Text style={{ fontSize: 20 }}>🏠</Text>
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={styles.ilanBaslik} numberOfLines={1}>{item.baslik}</Text>
                        {zaten && <View style={styles.zatenBadge}><Text style={styles.zatenBadgeText}>Eklendi</Text></View>}
                      </View>
                      <Text style={styles.ilanKonum}>📍 {item.konum}{item.ilce ? `, ${item.ilce}` : ''}</Text>
                    </View>
                    <Text style={styles.ilanFiyat}>₺{item.fiyat?.toLocaleString('tr-TR')}</Text>
                  </TouchableOpacity>
                );
              }}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingTop: Spacing.sm, paddingBottom: 80 }}
            />
            {/* Footer */}
            <View style={styles.modalFooter}>
              <Text style={{ fontSize: 13, color: Colors.onSurfaceVariant }}>
                {pendingIlanlar.length > 0 ? `${pendingIlanlar.length} ilan seçildi` : 'İlan seçin'}
              </Text>
              <TouchableOpacity
                style={[styles.eslesBulkBtn, { opacity: pendingIlanlar.length === 0 || eslesiyorBulk ? 0.5 : 1 }]}
                onPress={handleEslesBulk}
                disabled={pendingIlanlar.length === 0 || eslesiyorBulk}
              >
                {eslesiyorBulk
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.eslesBulkBtnText}>Eşleştir{pendingIlanlar.length > 0 ? ` (${pendingIlanlar.length})` : ''}</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Konum Seçim Modali */}
      <Modal visible={konumModal} animationType="slide" transparent onRequestClose={() => {
        if (konumSayfa === 'mahalle') { setKonumSayfa('ilce'); setKonumSearch(''); }
        else if (konumSayfa === 'ilce') { setKonumSayfa('il'); setKonumSearch(''); }
        else setKonumModal(false);
      }}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior="padding">
          <TouchableOpacity style={styles.modalDimmer} onPress={() => setKonumModal(false)} />
          <View style={styles.modalPanel}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => {
                if (konumSayfa === 'mahalle') { setKonumSayfa('ilce'); setKonumSearch(''); }
                else if (konumSayfa === 'ilce') { setKonumSayfa('il'); setKonumSearch(''); }
                else setKonumModal(false);
              }}>
                <Text style={styles.modalKapat}>{konumSayfa !== 'il' ? '←' : '✕'}</Text>
              </TouchableOpacity>
              <Text style={styles.modalBaslik}>
                {konumSayfa === 'il' ? 'İl Seçin' : konumSayfa === 'ilce' ? 'İlçe Seçin' : 'Mahalle Seçin'}
              </Text>
              {konumSayfa !== 'il' ? (
                <TouchableOpacity onPress={() => { konumEkle(tempIl, tempIlce, tempMahalle); setKonumModal(false); }}>
                  <Text style={{ fontSize: 13, color: Colors.primary }}>Ekle</Text>
                </TouchableOpacity>
              ) : <View style={{ width: 32 }} />}
            </View>
            <TextInput
              style={styles.modalSearch}
              placeholder={konumSayfa === 'il' ? 'İl ara...' : konumSayfa === 'ilce' ? 'İlçe ara...' : 'Mahalle ara...'}
              placeholderTextColor={Colors.outlineVariant}
              value={konumSearch}
              onChangeText={setKonumSearch}
            />
            <FlatList
              data={
                konumSayfa === 'il'
                  ? ILLER_LISTESI.filter(i => i.toLowerCase().includes(konumSearch.toLowerCase()))
                  : konumSayfa === 'ilce'
                  ? (ILLER[tempIl] ?? []).slice().sort((a, b) => a.localeCompare(b, 'tr')).filter(i => i.toLowerCase().includes(konumSearch.toLowerCase()))
                  : ((MAHALLELER as any)[tempIl]?.[tempIlce] ?? []).slice().sort((a: string, b: string) => a.localeCompare(b, 'tr')).filter((m: string) => m.toLowerCase().includes(konumSearch.toLowerCase()))
              }
              keyExtractor={(item, index) => `${konumSayfa}-${index}-${item}`}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.modalItem} onPress={() => {
                  if (konumSayfa === 'il') {
                    setTempIl(item); setTempIlce(''); setTempMahalle(''); setKonumSearch('');
                    if (ILLER[item]?.length) setKonumSayfa('ilce');
                    else { konumEkle(item); setKonumModal(false); }
                  } else if (konumSayfa === 'ilce') {
                    setTempIlce(item); setTempMahalle(''); setKonumSearch('');
                    const mah = (MAHALLELER as any)[tempIl]?.[item] ?? [];
                    if (mah.length) setKonumSayfa('mahalle');
                    else { konumEkle(tempIl, item); setKonumModal(false); }
                  } else {
                    setTempMahalle(item);
                    konumEkle(tempIl, tempIlce, item);
                    setKonumModal(false);
                  }
                }}>
                  <Text style={styles.modalItemText}>{item}</Text>
                </TouchableOpacity>
              )}
              keyboardShouldPersistTaps="handled"
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Link Paylaş Modali */}
      <Modal visible={linkModal} animationType="slide" transparent onRequestClose={() => setLinkModal(false)}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalDimmer} onPress={() => setLinkModal(false)} />
          <View style={[styles.modalPanel, { maxHeight: '85%' }]}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setLinkModal(false)}>
                <Text style={styles.modalKapat}>✕</Text>
              </TouchableOpacity>
              <Text style={styles.modalBaslik}>🔗 Link Paylaş</Text>
              <View style={{ width: 32 }} />
            </View>
            {!linkUrl ? (
              <>
                <View style={{ flexDirection: 'row', gap: 8, margin: Spacing.md }}>
                  <TextInput
                    style={[styles.modalSearch, { flex: 1, margin: 0 }]}
                    placeholder="İlan ara..."
                    placeholderTextColor={Colors.outlineVariant}
                    value={linkSearch}
                    onChangeText={setLinkSearch}
                  />
                  <TextInput
                    style={[styles.modalSearch, { width: 120, margin: 0 }]}
                    placeholder="Portföy no..."
                    placeholderTextColor={Colors.outlineVariant}
                    value={linkPortfoySearch}
                    onChangeText={setLinkPortfoySearch}
                    keyboardType="numeric"
                  />
                </View>
                <FlatList
                  data={linkTumIlanlar.filter(i => {
                    const aramaOk = !linkSearch || i.baslik?.toLowerCase().includes(linkSearch.toLowerCase()) || i.konum?.toLowerCase().includes(linkSearch.toLowerCase());
                    const portfoyOk = !linkPortfoySearch || (i.portfoy_no ?? '').toLowerCase().includes(linkPortfoySearch.toLowerCase());
                    return aramaOk && portfoyOk;
                  })}
                  keyExtractor={item => item.id}
                  renderItem={({ item }) => {
                    const secili = linkSecimIds.includes(item.id);
                    return (
                      <TouchableOpacity onPress={() => toggleLinkIlan(item.id)} style={[styles.modalItem, secili && { backgroundColor: Colors.primaryFixed }]}>
                        <View style={[styles.secimKutucuk, { borderColor: secili ? Colors.primary : Colors.outline, backgroundColor: secili ? Colors.primary : Colors.surface }]}>
                          {secili && <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>✓</Text>}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.modalItemBaslik} numberOfLines={1}>{item.baslik}{item.portfoy_no ? <Text style={{ fontSize: 11, color: Colors.onSurfaceVariant }}> #{item.portfoy_no}</Text> : ''}</Text>
                          <Text style={styles.modalItemAlt}>₺{item.fiyat?.toLocaleString('tr-TR')} · {item.kategori}</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  }}
                  ListEmptyComponent={linkYukleniyor ? <ActivityIndicator style={{ margin: 24 }} color={Colors.primary} /> : <Text style={styles.modalBosTxt}>Aktif ilan bulunamadı</Text>}
                />
                <View style={{ paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.surfaceContainerLow, backgroundColor: Colors.surface }}>
                  <View style={{ flexDirection: 'row', gap: 6, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                    {([1, 24, 72, 168] as const).map(s => (
                      <TouchableOpacity key={s} onPress={() => setLinkSaat(String(s))} style={[styles.saatBtn, linkSaat === String(s) && styles.saatBtnAktif]}>
                        <Text style={[styles.saatBtnText, linkSaat === String(s) && styles.saatBtnTextAktif]}>
                          {s === 1 ? '1 saat' : s === 24 ? '1 gün' : s === 72 ? '3 gün' : '7 gün'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <TextInput
                        style={{ width: 50, borderWidth: 1, borderColor: Colors.outline, borderRadius: Radius.md, paddingHorizontal: 6, paddingVertical: 4, fontSize: 12, textAlign: 'center', color: Colors.onSurface }}
                        value={linkSaat}
                        onChangeText={v => setLinkSaat(v.replace(/\D/g, '') || '1')}
                        keyboardType="numeric"
                      />
                      <Text style={{ fontSize: 12, color: Colors.onSurfaceVariant }}>saat</Text>
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: 13, color: Colors.onSurfaceVariant }}>{linkSecimIds.length > 0 ? `${linkSecimIds.length} ilan seçildi` : 'İlan seçin'}</Text>
                    <TouchableOpacity onPress={handleLinkOlustur} disabled={linkSecimIds.length === 0 || linkYukleniyor}
                      style={[styles.eslesBulkBtn, { opacity: linkSecimIds.length === 0 ? 0.4 : 1 }]}>
                      {linkYukleniyor ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.eslesBulkBtnText}>Link Oluştur{linkSecimIds.length > 0 ? ` (${linkSecimIds.length})` : ''}</Text>}
                    </TouchableOpacity>
                  </View>
                </View>
              </>
            ) : (
              <View style={{ padding: Spacing.xl }}>
                <Text style={{ fontSize: 14, color: Colors.primary, fontWeight: '700', marginBottom: 12 }}>✓ Link oluşturuldu</Text>
                <View style={{ backgroundColor: Colors.surfaceContainerLow, borderRadius: Radius.md, padding: Spacing.md, marginBottom: 16 }}>
                  <Text style={{ fontSize: 12, color: Colors.onSurfaceVariant }} selectable>{linkUrl}</Text>
                </View>
                <TouchableOpacity onPress={() => Share.share({ message: linkUrl! })} style={[styles.eslesBulkBtn, { marginBottom: 10 }]}>
                  <Text style={styles.eslesBulkBtnText}>Paylaş / Kopyala</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { setLinkUrl(null); setLinkSecimIds([]); setLinkSaat('24'); }}
                  style={{ padding: Spacing.md, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.outline, alignItems: 'center' }}>
                  <Text style={{ fontSize: 13, color: Colors.onSurfaceVariant }}>Yeni Link Oluştur</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Field({ label, value, onChangeText, placeholder, keyboardType, autoCapitalize }: {
  label: string; value: string; onChangeText: (v: string) => void;
  placeholder?: string; keyboardType?: any; autoCapitalize?: any;
}) {
  return (
    <View style={styles.inputContainer}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        placeholder={placeholder}
        placeholderTextColor={Colors.outlineVariant}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize ?? 'words'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: Spacing.xl, gap: Spacing.md, paddingBottom: 48 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.surfaceContainerLow,
  },
  geri: { fontSize: 22, color: Colors.onSurface },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 15, fontWeight: '600', color: Colors.onSurface },
  headerActions: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'center' },
  kaydetBtn: { backgroundColor: Colors.primary, borderRadius: Radius.full, paddingHorizontal: 16, paddingVertical: 8 },
  kaydetText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  duzenleBtn: { backgroundColor: Colors.primaryFixed, borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 6 },
  duzenleBtnText: { fontSize: 12, color: Colors.primary, fontWeight: '600' },
  silBtn: { backgroundColor: '#fee2e2', borderRadius: Radius.full, width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  silBtnText: { fontSize: 14 },
  linkBtn: { backgroundColor: Colors.primaryFixed, borderRadius: Radius.full, width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  linkBtnText: { fontSize: 14 },
  saatBtn: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: Radius.full, borderWidth: 1.5, borderColor: Colors.outline, backgroundColor: Colors.surface },
  saatBtnAktif: { borderColor: Colors.primary, backgroundColor: Colors.primaryFixed },
  saatBtnText: { fontSize: 12, fontWeight: '600', color: Colors.onSurfaceVariant },
  saatBtnTextAktif: { color: Colors.primary },

  profilBox: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: Radius.xl, padding: Spacing.lg,
  },
  avatar: { width: 56, height: 56, borderRadius: Radius.full, backgroundColor: Colors.primaryFixed, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: Colors.primary, fontWeight: '700', fontSize: 20 },
  profilAd: { fontSize: 16, fontWeight: '700', color: Colors.onSurface },
  profilTelefon: { fontSize: 13, color: Colors.primary },
  profilEmail: { fontSize: 13, color: Colors.onSurfaceVariant },
  durumBadge: { borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 4 },
  durumBadgeText: { fontSize: 11, fontWeight: '700' },

  infoBox: { backgroundColor: Colors.surfaceContainerLowest, borderRadius: Radius.xl, overflow: 'hidden' },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.surfaceContainerLow },
  infoLabel: { fontSize: 13, color: Colors.onSurfaceVariant },
  infoDeger: { fontSize: 13, fontWeight: '600', color: Colors.onSurface },

  sectionTitle: { fontSize: 16, fontWeight: '700', color: Colors.onSurface },
  eslesBtn: { backgroundColor: Colors.primaryFixed, borderRadius: Radius.full, paddingHorizontal: 12, paddingVertical: 6 },
  eslesBtnText: { fontSize: 12, color: Colors.primary, fontWeight: '700' },

  ilanKartWrap: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  ilanKart: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surfaceContainerLowest, borderRadius: Radius.lg,
    overflow: 'hidden', gap: Spacing.sm,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 1 }, elevation: 1,
  },
  elleBadge: { backgroundColor: Colors.primaryFixed, borderRadius: Radius.full, paddingHorizontal: 6, paddingVertical: 2 },
  elleBadgeText: { fontSize: 10, color: Colors.primary, fontWeight: '700' },
  zatenBadge: { backgroundColor: '#fef3c7', borderRadius: Radius.full, paddingHorizontal: 6, paddingVertical: 2 },
  zatenBadgeText: { fontSize: 10, color: '#d97706', fontWeight: '700' },
  iptalBtn: { width: 32, height: 32, borderRadius: Radius.full, backgroundColor: '#fee2e2', alignItems: 'center', justifyContent: 'center' },
  iptalBtnText: { fontSize: 14, color: '#ef4444' },
  ilanFoto: { width: 64, height: 64 },
  ilanFotoPlaceholder: { width: 64, height: 64, backgroundColor: Colors.surfaceContainerHigh, alignItems: 'center', justifyContent: 'center' },
  ilanBaslik: { fontSize: 14, fontWeight: '600', color: Colors.onSurface },
  ilanKonum: { fontSize: 12, color: Colors.onSurfaceVariant, marginTop: 2 },
  ilanFiyat: { fontSize: 14, fontWeight: '700', color: Colors.primary, paddingRight: Spacing.md },

  satir: { flexDirection: 'row', gap: Spacing.sm },
  inputContainer: { gap: 6 },
  label: { fontSize: 12, fontWeight: '600', color: Colors.onSurfaceVariant },
  input: { backgroundColor: Colors.surfaceContainerLow, borderRadius: Radius.lg, paddingHorizontal: Spacing.lg, paddingVertical: 12, fontSize: 15, color: Colors.onSurface },
  textarea: { minHeight: 80, paddingTop: 12 },
  durumRow: { flexDirection: 'row', gap: Spacing.sm },
  durumBtn: { flex: 1, backgroundColor: Colors.surfaceContainerLow, borderRadius: Radius.full, paddingVertical: 10, alignItems: 'center' },
  durumBtnAktif: { backgroundColor: Colors.primary },
  durumBtnText: { fontSize: 13, fontWeight: '600', color: Colors.onSurfaceVariant },
  durumBtnTextAktif: { color: '#fff' },

  emptyBox: { backgroundColor: Colors.surfaceContainerLow, borderRadius: Radius.lg, padding: Spacing.xl, alignItems: 'center' },
  emptyText: { color: Colors.onSurfaceVariant, fontSize: 14 },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: Radius.full, backgroundColor: Colors.surfaceContainerLow, borderWidth: 1, borderColor: Colors.outline },
  chipActive: { backgroundColor: Colors.primaryFixed, borderColor: Colors.primary },
  chipText: { fontSize: 13, color: Colors.onSurfaceVariant, fontWeight: '500' },
  chipTextActive: { color: Colors.primary, fontWeight: '700' },

  secimBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.surfaceContainerLow, borderRadius: Radius.lg, paddingHorizontal: Spacing.lg, paddingVertical: 12 },
  secimBtnText: { fontSize: 15, color: Colors.onSurface },
  secimBtnPlaceholder: { fontSize: 15, color: Colors.outlineVariant },
  secimChevron: { fontSize: 20, color: Colors.onSurfaceVariant },
  mahalleSatir: { flexDirection: 'row', gap: Spacing.sm, marginTop: 6, alignItems: 'center' },
  temizleBtn: { alignSelf: 'flex-start', marginTop: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.full, backgroundColor: Colors.surfaceContainerLow },
  temizleBtnText: { fontSize: 13, color: Colors.onSurfaceVariant },
  konumChip: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.primaryFixed, borderRadius: Radius.lg, paddingHorizontal: Spacing.lg, paddingVertical: 10, marginBottom: 6 },
  konumChipText: { fontSize: 14, color: Colors.primary, flex: 1 },
  konumChipSil: { fontSize: 14, color: Colors.primary, paddingLeft: 8 },

  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalDimmer: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  modalPanel: { backgroundColor: Colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '75%' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.surfaceContainerLow },
  modalKapat: { fontSize: 20, color: Colors.onSurface, width: 32 },
  modalBaslik: { fontSize: 16, fontWeight: '700', color: Colors.onSurface },
  modalSearch: { margin: Spacing.md, backgroundColor: Colors.surfaceContainerLow, borderRadius: Radius.lg, paddingHorizontal: Spacing.lg, paddingVertical: 10, fontSize: 14, color: Colors.onSurface },
  modalItem: { paddingHorizontal: Spacing.xl, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.surfaceContainerLow, flexDirection: 'row', alignItems: 'center', gap: 10 },
  modalItemText: { fontSize: 15, color: Colors.onSurface },
  modalItemBaslik: { fontSize: 14, fontWeight: '600', color: Colors.onSurface },
  modalItemAlt: { fontSize: 12, color: Colors.onSurfaceVariant, marginTop: 2 },
  modalBosTxt: { textAlign: 'center', color: Colors.onSurfaceVariant, fontSize: 13, padding: Spacing.xl },
  modalFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.surfaceContainerLow, backgroundColor: Colors.surface },

  secimKutucuk: { width: 20, height: 20, borderRadius: 4, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  eslesBulkBtn: { backgroundColor: Colors.primary, borderRadius: Radius.full, paddingHorizontal: 16, paddingVertical: 9 },
  eslesBulkBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  etiketInputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surfaceContainerLow, borderRadius: Radius.lg, paddingHorizontal: Spacing.md, width: 80 },
  etiketHash: { fontSize: 16, fontWeight: '700', color: Colors.primary, marginRight: 1 },
  etiketInput: { flex: 1, paddingVertical: 12, fontSize: 14, color: Colors.onSurface },
  etiketBadge: { backgroundColor: Colors.primaryFixed, borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 4 },
  etiketBadgeText: { fontSize: 11, fontWeight: '700', color: Colors.primary },
});
