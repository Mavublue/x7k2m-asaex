import { useCallback, useEffect, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View, Text, TextInput, Pressable, ScrollView, StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { router, useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { yerelBildirimleriYenile } from '../../lib/yerelBildirim';
import { Colors, Radius, Spacing } from '../../constants/theme';

// Jarvis (5a): komut yaz → Jarvis okur ve ONAY KARTI hazırlar → onaylayınca kaydı BU oturum yapar (RLS).
// Web karşılığı: ilan-web/app/panel/jarvis/page.tsx
type Kart = {
  id: string; tur: 'not' | 'gorev' | 'ilan_gonder' | 'soru'; musteri_id: string | null;
  veri: any; durum: 'bekliyor' | 'onaylandi' | 'reddedildi'; duzenlendi: boolean;
};
type Komut = {
  id: string; metin: string; durum: 'bekliyor' | 'isleniyor' | 'hazir' | 'hata';
  cevap: string | null; hata: string | null; sure_ms: number | null; created_at: string;
  jarvis_kartlar: Kart[];
};
type IlanMini = { id: string; portfoy_no: string | null; fiyat: number | null; oda_sayisi: string | null; ilce: string | null; mahalle: string | null };

const ROZET: Record<Kart['tur'], string> = { not: '📝 Not', gorev: '📋 Görev', ilan_gonder: '🏠 İlan gönder', soru: '❓ Soru' };

const fiyatYaz = (f: number | null) => (f == null ? '—' : '₺' + Math.round(f).toLocaleString('tr-TR'));
function tarihYaz(iso: string, saatli: boolean) {
  const d = new Date(iso);
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'short' })
    + (saatli ? ' ' + d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '');
}

export default function JarvisEkran() {
  const [komutlar, setKomutlar] = useState<Komut[]>([]);
  const [musteriler, setMusteriler] = useState<Record<string, string>>({});
  const [ilanlar, setIlanlar] = useState<Record<string, IlanMini>>({});
  const [metin, setMetin] = useState('');
  const [gonderiyor, setGonderiyor] = useState(false);
  const [duzenle, setDuzenle] = useState<Record<string, any>>({});
  const [mesgul, setMesgul] = useState<string | null>(null);
  const [yuklendi, setYuklendi] = useState(false);

  const yukle = useCallback(async () => {
    const { data } = await supabase.from('jarvis_komutlar')
      .select('id, metin, durum, cevap, hata, sure_ms, created_at, jarvis_kartlar(id, tur, musteri_id, veri, durum, duzenlendi)')
      .order('created_at', { ascending: false }).limit(30);
    setYuklendi(true);
    if (!data) return;
    const liste = data as unknown as Komut[];
    setKomutlar(liste);
    const kartlar = liste.flatMap(k => k.jarvis_kartlar ?? []);
    const mIds = [...new Set(kartlar.map(k => k.musteri_id).filter(Boolean) as string[])];
    const iIds = [...new Set(kartlar.filter(k => k.tur === 'ilan_gonder').flatMap(k => k.veri?.ilan_ids ?? []))] as string[];
    if (mIds.length) {
      const { data: m } = await supabase.from('musteriler').select('id, ad, soyad').in('id', mIds);
      if (m) setMusteriler(Object.fromEntries(m.map(x => [x.id, [x.ad, x.soyad].filter(Boolean).join(' ')])));
    }
    if (iIds.length) {
      const { data: il } = await supabase.from('ilanlar').select('id, portfoy_no, fiyat, oda_sayisi, ilce, mahalle').in('id', iIds);
      if (il) setIlanlar(Object.fromEntries(il.map(x => [x.id, x])));
    }
  }, []);

  useFocusEffect(useCallback(() => { yukle(); }, [yukle]));

  const calisiyor = komutlar.some(k => k.durum === 'bekliyor' || k.durum === 'isleniyor');
  useEffect(() => {
    if (!calisiyor) return;
    const t = setInterval(yukle, 1500);
    return () => clearInterval(t);
  }, [calisiyor, yukle]);

  async function komutGonder(yazi: string) {
    const t = yazi.trim();
    if (!t) return;
    setGonderiyor(true);
    const { error } = await supabase.from('jarvis_komutlar').insert({ metin: t });
    setGonderiyor(false);
    if (error) { Alert.alert('Gönderilemedi', error.message); return; }
    setMetin('');
    yukle();
  }

  async function kartKarar(kart: Kart, durum: 'onaylandi' | 'reddedildi', duzenlendi = false) {
    await supabase.from('jarvis_kartlar').update({ durum, duzenlendi, karar_at: new Date().toISOString() }).eq('id', kart.id);
  }

  async function onayla(kart: Kart) {
    if (kart.tur === 'ilan_gonder') {
      // Mevcut paylaş penceresi kartın ilanları + müşterisiyle açılır; link oluşunca kart onaylanır
      router.navigate({ pathname: '/(tabs)/ilanlar', params: { jarvisKart: kart.id } });
      return;
    }
    setMesgul(kart.id);
    try {
      const d = duzenle[kart.id];
      if (kart.tur === 'not') {
        const icerik = (d?.metin ?? kart.veri.metin ?? '').trim();
        if (!icerik || !kart.musteri_id) return;
        const { error } = await supabase.from('musteri_notlar').insert({ musteri_id: kart.musteri_id, icerik, tarih: new Date().toISOString() });
        if (error) { Alert.alert('Not eklenemedi', error.message); return; }
      } else if (kart.tur === 'gorev') {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const baslik = (d?.baslik ?? kart.veri.baslik ?? '').trim();
        if (!baslik) return;
        const { error } = await supabase.from('musteri_gorevler').insert({
          baslik, hedef_tarih: d?.hedef_tarih ?? kart.veri.hedef_tarih, user_id: session.user.id, tamamlandi: false, kaynak: 'jarvis',
          ...(kart.musteri_id ? { musteri_id: kart.musteri_id } : {}),
        });
        if (error) { Alert.alert('Görev eklenemedi', error.message); return; }
        yerelBildirimleriYenile();
      }
      await kartKarar(kart, 'onaylandi', !!d);
      setDuzenle(p => { const n = { ...p }; delete n[kart.id]; return n; });
      await yukle();
    } finally {
      setMesgul(null);
    }
  }

  async function reddet(kart: Kart) {
    setMesgul(kart.id);
    await kartKarar(kart, 'reddedildi');
    await yukle();
    setMesgul(null);
  }

  async function secenekSec(kart: Kart, komut: string) {
    setMesgul(kart.id);
    await kartKarar(kart, 'onaylandi');
    await komutGonder(komut);
    setMesgul(null);
  }

  function kartGovde(kart: Kart) {
    const d = duzenle[kart.id];
    if (kart.tur === 'not') {
      return d ? (
        <TextInput value={d.metin} onChangeText={t => setDuzenle(p => ({ ...p, [kart.id]: { metin: t } }))}
          multiline style={styles.input} placeholderTextColor={Colors.outline} />
      ) : <Text style={styles.govde}>“{kart.veri.metin}”</Text>;
    }
    if (kart.tur === 'gorev') {
      if (d) {
        return (
          <View style={{ gap: 6 }}>
            <TextInput value={d.baslik} onChangeText={t => setDuzenle(p => ({ ...p, [kart.id]: { ...d, baslik: t } }))} style={styles.input} />
            <DateTimePicker value={new Date(d.hedef_tarih)} mode="datetime" locale="tr-TR" themeVariant="dark"
              onChange={(_, t) => { if (t) setDuzenle(p => ({ ...p, [kart.id]: { ...d, hedef_tarih: t.toISOString() } })); }} />
          </View>
        );
      }
      return (
        <View>
          <Text style={[styles.govde, { fontWeight: '700' }]}>{kart.veri.baslik}</Text>
          <Text style={styles.soluk}>🗓 {tarihYaz(kart.veri.hedef_tarih, !!kart.veri.saatli)}</Text>
        </View>
      );
    }
    if (kart.tur === 'ilan_gonder') {
      const ids: string[] = kart.veri.ilan_ids ?? [];
      return (
        <View>
          {!!kart.veri.aciklama && <Text style={styles.soluk}>{kart.veri.aciklama}</Text>}
          {ids.map(id => {
            const il = ilanlar[id];
            return (
              <Text key={id} style={[styles.govde, { fontSize: 13, paddingVertical: 3 }]}>
                {il ? `#${il.portfoy_no ?? '—'} · ${il.oda_sayisi ?? ''} · ${[il.ilce, il.mahalle].filter(Boolean).join(' / ')} · ${fiyatYaz(il.fiyat)}` : '…'}
              </Text>
            );
          })}
        </View>
      );
    }
    return (
      <View>
        <Text style={[styles.govde, { marginBottom: 8 }]}>{kart.veri.soru}</Text>
        {kart.durum === 'bekliyor' && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {(kart.veri.secenekler ?? []).map((s: any, i: number) => (
              <Pressable key={i} disabled={mesgul === kart.id} onPress={() => secenekSec(kart, s.komut)} style={[styles.btn, { borderColor: '#2563eb' }]}>
                <Text style={[styles.btnYazi, { color: '#60a5fa' }]}>{s.etiket}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.ekran} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <Text style={styles.baslik}>🤖 Jarvis</Text>
          <Text style={[styles.soluk, { marginBottom: 12 }]}>Yaz, Jarvis hazırlasın; sen onaylamadan hiçbir şey kaydedilmez.</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
            <TextInput value={metin} onChangeText={setMetin} placeholder="Komut yaz…" placeholderTextColor={Colors.outline}
              multiline style={[styles.input, { flex: 1, minHeight: 48 }]} />
            <Pressable onPress={() => komutGonder(metin)} disabled={gonderiyor || !metin.trim()}
              style={[styles.btn, { backgroundColor: Colors.primary, borderColor: Colors.primary, justifyContent: 'center', opacity: gonderiyor || !metin.trim() ? 0.5 : 1 }]}>
              {gonderiyor ? <ActivityIndicator color="#fff" /> : <Text style={[styles.btnYazi, { color: '#fff' }]}>Gönder</Text>}
            </Pressable>
          </View>

          {yuklendi && !komutlar.length && <Text style={styles.soluk}>Henüz komut yok.</Text>}

          {komutlar.map(k => (
            <View key={k.id} style={styles.komut}>
              <Text style={[styles.govde, { fontWeight: '600' }]}>🗣 {k.metin}</Text>
              <Text style={[styles.govde, { marginTop: 6, fontSize: 13 }]}>
                {k.durum === 'bekliyor' || k.durum === 'isleniyor' ? '⏳ Jarvis hazırlıyor…'
                  : k.durum === 'hata' ? `⚠️ Yapamadım: ${k.hata ?? ''}` : `🤖 ${k.cevap ?? ''}`}
                {k.sure_ms != null ? `  · ${(k.sure_ms / 1000).toFixed(1)} sn` : ''}
              </Text>
              {(k.jarvis_kartlar ?? []).map(kart => (
                <View key={kart.id} style={[styles.kart,
                  kart.durum === 'onaylandi' ? { borderColor: '#166534', backgroundColor: '#052e16' }
                    : kart.durum === 'reddedildi' ? { opacity: 0.5 } : { borderColor: '#854d0e', backgroundColor: '#1c1404' }]}>
                  <Text style={[styles.soluk, { fontWeight: '700', marginBottom: 6 }]}>
                    {ROZET[kart.tur]}{kart.musteri_id ? ` — ${musteriler[kart.musteri_id] ?? '…'}` : ''}
                    {kart.durum === 'onaylandi' ? ' · ✓ yapıldı' : kart.durum === 'reddedildi' ? ' · reddedildi' : ''}
                  </Text>
                  {kartGovde(kart)}
                  {kart.durum === 'bekliyor' && kart.tur !== 'soru' && (
                    <View style={{ flexDirection: 'row', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                      <Pressable disabled={mesgul === kart.id} onPress={() => onayla(kart)} style={[styles.btn, { backgroundColor: '#16a34a', borderColor: '#16a34a' }]}>
                        <Text style={[styles.btnYazi, { color: '#fff' }]}>{kart.tur === 'ilan_gonder' ? 'Gönder…' : 'Onayla'}</Text>
                      </Pressable>
                      {(kart.tur === 'not' || kart.tur === 'gorev') && !duzenle[kart.id] && (
                        <Pressable disabled={mesgul === kart.id} style={[styles.btn, { borderColor: '#2563eb' }]}
                          onPress={() => setDuzenle(p => ({ ...p, [kart.id]: kart.tur === 'not' ? { metin: kart.veri.metin } : { baslik: kart.veri.baslik, hedef_tarih: kart.veri.hedef_tarih } }))}>
                          <Text style={[styles.btnYazi, { color: '#60a5fa' }]}>Düzenle</Text>
                        </Pressable>
                      )}
                      <Pressable disabled={mesgul === kart.id} onPress={() => reddet(kart)} style={[styles.btn, { borderColor: Colors.outline }]}>
                        <Text style={[styles.btnYazi, { color: Colors.onSurfaceVariant }]}>Reddet</Text>
                      </Pressable>
                    </View>
                  )}
                  {kart.durum === 'bekliyor' && kart.tur === 'soru' && (
                    <Pressable disabled={mesgul === kart.id} onPress={() => reddet(kart)} style={[styles.btn, { borderColor: Colors.outline, marginTop: 8, alignSelf: 'flex-start' }]}>
                      <Text style={[styles.btnYazi, { color: Colors.onSurfaceVariant }]}>Vazgeç</Text>
                    </Pressable>
                  )}
                </View>
              ))}
            </View>
          ))}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  ekran: { flex: 1, backgroundColor: Colors.background },
  baslik: { fontSize: 22, fontWeight: '800', color: Colors.onSurface, marginBottom: 4 },
  soluk: { fontSize: 13, color: Colors.onSurfaceVariant },
  govde: { fontSize: 14, color: Colors.onSurface },
  input: {
    borderWidth: 1, borderColor: Colors.outlineVariant, borderRadius: Radius.md, padding: 10,
    color: Colors.onSurface, backgroundColor: Colors.surfaceContainer, fontSize: 15,
  },
  komut: {
    backgroundColor: Colors.surfaceContainerLow, borderWidth: 1, borderColor: Colors.outlineVariant,
    borderRadius: Radius.md, padding: 12, marginBottom: 12,
  },
  kart: { marginTop: 10, padding: 10, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.outlineVariant },
  btn: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: Radius.sm, borderWidth: 1 },
  btnYazi: { fontSize: 13, fontWeight: '700' },
});
