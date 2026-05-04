import { useEffect, useState, useCallback, useRef } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, ActivityIndicator, Image, Modal, FlatList, RefreshControl,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { Colors, Radius, Spacing } from '../../constants/theme';
import { Eslesme } from '../../types';

export default function DashboardScreen() {
  const [userName, setUserName] = useState('');
  const [ilanSayisi, setIlanSayisi] = useState(0);
  const [musteriSayisi, setMusteriSayisi] = useState(0);
  const [eslesmeSayisi, setEslesmeSayisi] = useState(0);
  const [yeniEslesmeler, setYeniEslesmeler] = useState<Eslesme[]>([]);
  const [takipMusteriler, setTakipMusteriler] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [bildirimModal, setBildirimModal] = useState(false);
  const [bildirimler, setBildirimler] = useState<{id:string;tip:string;baslik:string;alt:string;hedefId:string;tarih:string}[]>([]);
  const [okundu, setOkundu] = useState<Set<string>>(new Set());
  const [silindi, setSilindi] = useState<Set<string>>(new Set());
  const [detayBildirim, setDetayBildirim] = useState<{id:string;tip:string;baslik:string;alt:string;hedefId:string;tarih:string}|null>(null);
  const [detayListe, setDetayListe] = useState<any[]>([]);
  const [detayYukleniyor, setDetayYukleniyor] = useState(false);
  const [menuAcikId, setMenuAcikId] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const takipY = useRef(0);
  const ilkFocus = useRef(true);

  useEffect(() => {
    fetchDurum();
    fetchBildirimler();
    fetchData();
  }, []);

  useFocusEffect(useCallback(() => {
    fetchData();
    if (ilkFocus.current) { ilkFocus.current = false; return; }
    fetchDurum();
    fetchBildirimler();
  }, []));

  async function fetchDurum() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from('bildirim_okundu').select('bildirim_id, silindi').eq('user_id', user.id);
    if (data) {
      const o = new Set<string>();
      const s = new Set<string>();
      data.forEach((r: any) => {
        if (r.silindi) s.add(r.bildirim_id);
        else o.add(r.bildirim_id);
      });
      setOkundu(o);
      setSilindi(s);
    }
  }

  function eslesenMi(m: any, i: any): boolean {
    if (!m.butce_min && !m.butce_max && !m.tercih_tip && !m.tercih_konum) return false;
    const f = Number(i.fiyat);
    if (m.butce_min != null && f < Number(m.butce_min)) return false;
    if (m.butce_max != null && f > Number(m.butce_max)) return false;
    if (m.tercih_tip) {
      const tipler = m.tercih_tip.split(',').map((t: string) => t.trim());
      if (tipler.length > 0) {
        const ilanCats = (i.kategori ?? '').split(',').map((s: string) => s.trim()).filter(Boolean);
        if (!ilanCats.some((c: string) => tipler.includes(c))) return false;
      }
    }
    if (m.tercih_konum) {
      const [il, ilce, mah] = m.tercih_konum.split(' / ').map((p: string) => p.trim());
      if (mah) {
        if (il && i.konum?.toLowerCase() !== il.toLowerCase()) return false;
        if (ilce && i.ilce?.toLowerCase() !== ilce.toLowerCase()) return false;
        if (!i.mahalle?.toLowerCase().includes(mah.toLowerCase())) return false;
      } else {
        if (il && i.konum?.toLowerCase() !== il.toLowerCase()) return false;
        if (ilce && i.ilce?.toLowerCase() !== ilce.toLowerCase()) return false;
      }
    }
    return true;
  }

  async function fetchBildirimler() {
    const liste: {id:string;tip:string;baslik:string;alt:string;hedefId:string;tarih:string}[] = [];
    const bugun = new Date().toISOString().split('T')[0];

    const { data: tumMusteriler, error: mErr } = await supabase.from('musteriler').select('id, ad, soyad, butce_min, butce_max, takip_tarihi, tercih_konum, tercih_tip, olusturma_tarihi');
    const { data: tumIlanlar, error: iErr } = await supabase.from('ilanlar').select('id, baslik, fiyat, konum, ilce, mahalle, kategori, olusturma_tarihi');

    if (mErr || iErr) {
      console.log('Bildirim hata:', mErr?.message, iErr?.message);
      return;
    }

    const ilanlar = tumIlanlar ?? [];
    const musteriler = tumMusteriler ?? [];

    console.log('Bildirim - musteriler:', musteriler.length, 'ilanlar:', ilanlar.length);

    // Takip
    for (const m of musteriler) {
      if (m.takip_tarihi && m.takip_tarihi <= bugun) {
        const [y, mo, d] = m.takip_tarihi.split('-');
        liste.push({ id: `takip-${m.id}`, tip: 'takip', baslik: `${m.ad} ${m.soyad}`, alt: `Takip tarihi: ${d}.${mo}.${y}`, hedefId: m.id, tarih: m.olusturma_tarihi ?? m.takip_tarihi });
      }
    }

    // Müşteri → ilan eşleşmesi
    for (const m of musteriler) {
      const eslesen = ilanlar.filter(i => eslesenMi(m, i));
      if (eslesen.length > 0) liste.push({ id: `musteri-${m.id}`, tip: 'musteri', baslik: `${m.ad} ${m.soyad}`, alt: `${eslesen.length} uygun ilan eşleşiyor`, hedefId: m.id, tarih: m.olusturma_tarihi ?? '' });
    }

    // İlan → müşteri eşleşmesi
    for (const i of ilanlar) {
      const eslesen = musteriler.filter(m => eslesenMi(m, i));
      if (eslesen.length > 0) liste.push({ id: `ilan-${i.id}`, tip: 'ilan', baslik: i.baslik, alt: `${eslesen.length} uygun müşteri eşleşiyor`, hedefId: i.id, tarih: i.olusturma_tarihi ?? '' });
    }

    setBildirimler(liste);
  }

  async function bildirimDetayAc(b: {id:string;tip:string;baslik:string;alt:string;hedefId:string;tarih:string}) {
    setDetayBildirim(b);
    setDetayListe([]);
    setDetayYukleniyor(true);
    if (!okundu.has(b.id)) {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setOkundu(prev => new Set([...prev, b.id]));
        supabase.from('bildirim_okundu').upsert({ user_id: session.user.id, bildirim_id: b.id, silindi: false }, { onConflict: 'user_id,bildirim_id' }).then(() => {});
      }
    }
    if (b.tip === 'musteri') {
      const { data: m } = await supabase.from('musteriler').select('butce_min, butce_max, tercih_tip, tercih_konum').eq('id', b.hedefId).single();
      if (m) {
        let q = supabase.from('ilanlar').select('id, baslik, fiyat, konum, ilce, mahalle, kategori, fotograflar, tip');
        if (m.butce_min != null) q = q.gte('fiyat', m.butce_min);
        if (m.butce_max != null) q = q.lte('fiyat', m.butce_max);
        if (m.tercih_tip) {
          const tipler = m.tercih_tip.split(',').map((t: string) => t.trim()).filter(Boolean);
          if (tipler.length) q = q.or(tipler.map((t: string) => `kategori.ilike.%${t}%`).join(','));
        }
        if (m.tercih_konum) {
          const [il, ilce, mah] = m.tercih_konum.split(' / ').map((p: string) => p.trim());
          if (il) q = q.ilike('konum', il);
          if (ilce) q = q.ilike('ilce', ilce);
          if (mah) q = q.ilike('mahalle', `%${mah}%`);
        }
        const { data } = await q;
        setDetayListe(data ?? []);
      }
    } else if (b.tip === 'ilan') {
      const { data: ilan } = await supabase.from('ilanlar').select('fiyat, konum, ilce, mahalle, kategori').eq('id', b.hedefId).single();
      if (ilan) {
        const { data: tum } = await supabase.from('musteriler').select('id, ad, soyad, telefon, butce_min, butce_max, tercih_tip, tercih_konum, durum');
        setDetayListe((tum ?? []).filter(m => eslesenMi(m, ilan)));
      }
    } else if (b.tip === 'takip') {
      const { data } = await supabase.from('musteriler').select('id, ad, soyad, telefon, takip_tarihi, durum').eq('id', b.hedefId).single();
      if (data) setDetayListe([data]);
    }
    setDetayYukleniyor(false);
  }

  async function toggleOkundu(id: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const isOkundu = okundu.has(id);
    setOkundu(prev => {
      const next = new Set(prev);
      if (isOkundu) next.delete(id); else next.add(id);
      return next;
    });
    if (isOkundu) {
      await supabase.from('bildirim_okundu').delete().eq('user_id', user.id).eq('bildirim_id', id);
    } else {
      await supabase.from('bildirim_okundu').upsert({ user_id: user.id, bildirim_id: id, silindi: false }, { onConflict: 'user_id,bildirim_id' });
    }
  }

  async function bildirimSil(id: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setSilindi(prev => new Set([...prev, id]));
    setOkundu(prev => { const n = new Set(prev); n.delete(id); return n; });
    await supabase.from('bildirim_okundu').upsert({ user_id: user.id, bildirim_id: id, silindi: true }, { onConflict: 'user_id,bildirim_id' });
  }

  async function tumunuOkunmadiYap() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setOkundu(new Set());
    await supabase.from('bildirim_okundu').delete().eq('user_id', user.id).eq('silindi', false);
  }

  async function onRefresh() {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }

  async function fetchData() {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profil } = await supabase.from('profiller').select('ad, soyad').eq('id', user.id).single();
      if (profil?.ad) {
        setUserName([profil.ad, profil.soyad].filter(Boolean).join(' '));
      } else {
        setUserName(user.email?.split('@')[0] ?? '');
      }
    }

    const [ilanRes, musteriRes, eslesmeRes] = await Promise.all([
      supabase.from('ilanlar').select('id', { count: 'exact' }),
      supabase.from('musteriler').select('id', { count: 'exact' }),
      supabase.from('eslesmeler').select('id', { count: 'exact' }),
    ]);

    setIlanSayisi(ilanRes.count ?? 0);
    setMusteriSayisi(musteriRes.count ?? 0);
    setEslesmeSayisi(eslesmeRes.count ?? 0);

    const { data: eslesmeler } = await supabase
      .from('eslesmeler')
      .select('*, musteri:musteriler(ad, soyad), ilan:ilanlar(baslik, fiyat, fotograflar)')
      .order('olusturma_tarihi', { ascending: false })
      .limit(5);

    if (eslesmeler) setYeniEslesmeler(eslesmeler as Eslesme[]);

    const bugun = new Date().toISOString().split('T')[0];
    const { data: takip } = await supabase
      .from('musteriler')
      .select('id, ad, soyad, telefon, takip_tarihi')
      .lte('takip_tarihi', bugun)
      .not('takip_tarihi', 'is', null)
      .order('takip_tarihi', { ascending: true })
      .limit(10);
    if (takip) setTakipMusteriler(takip);

    setLoading(false);
  }

  const hizliAksiyonlar = [
    { label: 'İlan Ekle', icon: '＋', route: '/ilan/ekle', color: Colors.primary },
    { label: 'Müşteri', icon: '👤', route: '/(tabs)/musteriler', color: Colors.secondaryContainer },
    { label: 'Tur Planla', icon: '📅', route: '/(tabs)/ayarlar', color: '#1e3a8a' },
    { label: 'Rapor Al', icon: '📊', route: '/(tabs)/ayarlar', color: '#4b1c00' },
  ];

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} colors={[Colors.primary]} />}
      >

        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Merhaba, {userName} 👋</Text>
            <Text style={styles.subGreeting}>Portföyünüzde güncel veriler</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <TouchableOpacity style={styles.bildirimWrap} onPress={() => setBildirimModal(true)}>
              <Text style={styles.bildirimIcon}>🔔</Text>
              {bildirimler.filter(b => !silindi.has(b.id) && !okundu.has(b.id)).length > 0 && (
                <View style={styles.bildirimBadge}>
                  <Text style={styles.bildirimBadgeText}>{bildirimler.filter(b => !silindi.has(b.id) && !okundu.has(b.id)).length}</Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={styles.avatar} onPress={() => router.push('/profil/duzenle' as any)}>
              <Text style={styles.avatarText}>{userName[0]?.toUpperCase()}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Hızlı Aksiyonlar */}
        <View style={styles.section}>
          <View style={styles.aksiyonRow}>
            {hizliAksiyonlar.map((a) => (
              <TouchableOpacity key={a.label} style={styles.aksiyon} onPress={() => router.push(a.route as any)}>
                <View style={[styles.aksiyonIcon, { backgroundColor: a.color }]}>
                  <Text style={styles.aksiyonEmoji}>{a.icon}</Text>
                </View>
                <Text style={styles.aksiyonLabel}>{a.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Takip Bildirimleri */}
        {takipMusteriler.length > 0 && (
          <View style={styles.section} onLayout={e => { takipY.current = e.nativeEvent.layout.y; }}>
            <View style={styles.sectionHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={styles.bildirimDot} />
                <Text style={styles.sectionTitle}>Takip Gerekiyor</Text>
              </View>
              <TouchableOpacity onPress={() => router.push('/(tabs)/musteriler')}>
                <Text style={styles.tümünüGör}>Tümü</Text>
              </TouchableOpacity>
            </View>
            {takipMusteriler.map(m => {
              const bugun = new Date().toISOString().split('T')[0];
              const gecmis = m.takip_tarihi < bugun;
              const [y, mo, d] = m.takip_tarihi.split('-');
              const tarih = `${d}.${mo}.${y}`;
              return (
                <TouchableOpacity
                  key={m.id}
                  style={[styles.takipKart, gecmis && styles.takipKartGecmis]}
                  onPress={() => router.push(`/musteri/${m.id}` as any)}
                >
                  <View style={[styles.takipAvatar, { backgroundColor: gecmis ? '#fee2e2' : Colors.primaryFixed }]}>
                    <Text style={[styles.takipAvatarText, { color: gecmis ? '#991b1b' : Colors.primary }]}>
                      {m.ad?.[0]?.toUpperCase() ?? '?'}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.takipAd}>{m.ad} {m.soyad}</Text>
                    <Text style={[styles.takipTarih, { color: gecmis ? '#991b1b' : Colors.primary }]}>
                      {gecmis ? '⚠️ Gecikmiş — ' : '📅 '}{tarih}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* İstatistikler */}
        <View style={styles.statsRow}>
          <StatKart baslik="Aktif İlanlar" deger={ilanSayisi} renk={Colors.primary} route="/(tabs)/ilanlar" altText="Portföy" />
          <StatKart baslik="Müşteriler" deger={musteriSayisi} renk={Colors.secondaryContainer} route="/(tabs)/musteriler" altText="Aktif Takip" />
          <StatKart baslik="Eşleşmeler" deger={eslesmeSayisi} renk="#1e3a8a" route="/(tabs)/musteriler" altText="Toplam" />
        </View>

        {/* Yeni Eşleşmeler */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Yeni Eşleşmeler</Text>
            <TouchableOpacity onPress={() => router.push('/(tabs)/musteriler')}>
              <Text style={styles.tümünüGör}>Tümünü Gör</Text>
            </TouchableOpacity>
          </View>

          {yeniEslesmeler.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>Henüz eşleşme yok</Text>
            </View>
          ) : (
            yeniEslesmeler.map((e) => (
              <EslesmeKart key={e.id} eslesme={e} />
            ))
          )}
        </View>

      </ScrollView>

      {/* Bildirim Modalı */}
      <Modal visible={bildirimModal} animationType="slide" transparent onRequestClose={() => { setDetayBildirim(null); setBildirimModal(false); }}>
        <View style={styles.bdModalOverlay}>
          <TouchableOpacity style={styles.bdModalDimmer} onPress={() => { setDetayBildirim(null); setBildirimModal(false); }} />
          <View style={styles.bdModalPanel}>
            <View style={styles.bdModalHeader}>
              {detayBildirim ? (
                <TouchableOpacity onPress={() => setDetayBildirim(null)}>
                  <Text style={styles.bdKapat}>←</Text>
                </TouchableOpacity>
              ) : <View style={{ width: 32 }} />}
              <Text style={styles.bdModalBaslik}>
                {detayBildirim ? detayBildirim.baslik : 'Bildirimler'}
              </Text>
              <TouchableOpacity onPress={() => { setDetayBildirim(null); setBildirimModal(false); }}>
                <Text style={styles.bdKapat}>✕</Text>
              </TouchableOpacity>
            </View>

            {!detayBildirim ? (
              // Bildirim listesi
              (() => {
                const gorunenler = bildirimler.filter(b => !silindi.has(b.id));
                const sirali = [...gorunenler].sort((a, b) => (b.tarih || '').localeCompare(a.tarih || ''));
                return sirali.length === 0 ? (
                  <View style={styles.bdBos}>
                    <Text style={styles.bdBosText}>Bildirim yok</Text>
                  </View>
                ) : (
                  <FlatList
                    data={sirali}
                    keyExtractor={b => b.id}
                    contentContainerStyle={{ padding: Spacing.md, gap: 8 }}
                    ListHeaderComponent={(
                      <TouchableOpacity onPress={tumunuOkunmadiYap} style={styles.bdTumuBtn}>
                        <Text style={styles.bdTumuText}>Tümünü okunmadı yap</Text>
                      </TouchableOpacity>
                    )}
                    renderItem={({ item }) => {
                      const isOkundu = okundu.has(item.id);
                      return (
                        <View style={[styles.bdItem, !isOkundu && styles.bdItemYeni]}>
                          <TouchableOpacity style={[styles.bdIcon, {
                            backgroundColor: item.tip === 'takip' ? '#fee2e2' : item.tip === 'musteri' ? Colors.primaryFixed : '#f0fdf4'
                          }]} onPress={() => bildirimDetayAc(item)}>
                            <Text style={{ fontSize: 16 }}>
                              {item.tip === 'takip' ? '⚠️' : item.tip === 'musteri' ? '👤' : '🏠'}
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={{ flex: 1 }} onPress={() => bildirimDetayAc(item)}>
                            <Text style={[styles.bdBaslik, !isOkundu && { fontWeight: '700' }]} numberOfLines={1}>{item.baslik}</Text>
                            <Text style={styles.bdAlt}>{item.alt}</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.bdMenuBtn}
                            onPress={() => setMenuAcikId(menuAcikId === item.id ? null : item.id)}>
                            <Text style={styles.bdMenuText}>⋯</Text>
                          </TouchableOpacity>
                        </View>
                      );
                    }}
                  />
                );
              })()
            ) : (
              // Detay: eşleşen liste
              detayYukleniyor ? (
                <View style={styles.bdBos}><ActivityIndicator color={Colors.primary} /></View>
              ) : detayListe.length === 0 ? (
                <View style={styles.bdBos}><Text style={styles.bdBosText}>Eşleşen bulunamadı</Text></View>
              ) : (
                <FlatList
                  data={detayListe}
                  keyExtractor={d => d.id}
                  contentContainerStyle={{ padding: Spacing.md, gap: 8 }}
                  renderItem={({ item }) => (
                    <TouchableOpacity style={styles.bdDetayItem} onPress={() => {
                      setDetayBildirim(null);
                      setBildirimModal(false);
                      if (detayBildirim.tip === 'musteri') router.push(`/ilan/${item.id}` as any);
                      else router.push(`/musteri/${item.id}` as any);
                    }}>
                      {detayBildirim.tip === 'musteri' ? (
                        <>
                          {item.fotograflar?.[0]
                            ? <Image source={{ uri: item.fotograflar[0] }} style={styles.bdDetayFoto} resizeMode="cover" />
                            : <View style={[styles.bdDetayFoto, { backgroundColor: Colors.surfaceContainerHigh, alignItems: 'center', justifyContent: 'center' }]}><Text>🏠</Text></View>
                          }
                          <View style={{ flex: 1 }}>
                            <Text style={styles.bdBaslik} numberOfLines={1}>{item.baslik}</Text>
                            <Text style={styles.bdAlt}>₺{Number(item.fiyat).toLocaleString('tr-TR')} · {item.konum}{item.ilce ? `, ${item.ilce}` : ''}</Text>
                          </View>
                        </>
                      ) : (
                        <>
                          <View style={[styles.bdIcon, { backgroundColor: Colors.primaryFixed }]}>
                            <Text style={{ fontWeight: '700', color: Colors.primary }}>{item.ad?.[0]?.toUpperCase()}</Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.bdBaslik}>{item.ad} {item.soyad}</Text>
                            <Text style={styles.bdAlt}>
                              {item.butce_min ? `₺${Number(item.butce_min).toLocaleString('tr-TR')}` : ''}{item.butce_max ? ` – ₺${Number(item.butce_max).toLocaleString('tr-TR')}` : ''}
                            </Text>
                          </View>
                        </>
                      )}
                      <Text style={{ color: Colors.onSurfaceVariant, fontSize: 18 }}>›</Text>
                    </TouchableOpacity>
                  )}
                />
              )
            )}
          </View>
        </View>
      </Modal>

      <Modal visible={menuAcikId !== null} transparent animationType="fade" onRequestClose={() => setMenuAcikId(null)}>
        <TouchableOpacity style={styles.bdMenuOverlay} activeOpacity={1} onPress={() => setMenuAcikId(null)}>
          <View style={styles.bdMenuPopup}>
            {menuAcikId && okundu.has(menuAcikId) && (
              <>
                <TouchableOpacity style={styles.bdMenuItem} onPress={() => { if (menuAcikId) toggleOkundu(menuAcikId); setMenuAcikId(null); }}>
                  <Text style={styles.bdMenuItemText}>Okunmadı yap</Text>
                </TouchableOpacity>
                <View style={styles.bdMenuSep} />
              </>
            )}
            <TouchableOpacity style={styles.bdMenuItem} onPress={() => { if (menuAcikId) bildirimSil(menuAcikId); setMenuAcikId(null); }}>
              <Text style={[styles.bdMenuItemText, { color: '#E53935' }]}>Sil</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

    </SafeAreaView>
  );
}

function StatKart({ baslik, deger, renk, route, altText }: { baslik: string; deger: number; renk: string; route: string; altText?: string }) {
  return (
    <TouchableOpacity style={[styles.statKart, { borderTopColor: renk, borderTopWidth: 3 }]} onPress={() => router.push(route as any)}>
      <Text style={[styles.statDeger, { color: renk }]}>{deger}</Text>
      <Text style={styles.statBaslik}>{baslik}</Text>
      {altText && <Text style={[styles.statAlt, { color: renk }]}>{altText}</Text>}
    </TouchableOpacity>
  );
}

function EslesmeKart({ eslesme }: { eslesme: Eslesme }) {
  const musteri = eslesme.musteri as any;
  const ilan = eslesme.ilan as any;
  const ilanFoto = (ilan as any)?.fotograflar?.[0];
  return (
    <TouchableOpacity style={styles.eslesmeKart} onPress={() => eslesme.ilan_id && router.push(`/ilan/${eslesme.ilan_id}` as any)}>
      {ilanFoto ? (
        <Image source={{ uri: ilanFoto }} style={styles.eslesmeIlanFoto} resizeMode="cover" />
      ) : (
        <View style={styles.eslesmeAvatar}>
          <Text style={styles.eslesmeAvatarText}>
            {musteri?.ad?.[0]?.toUpperCase() ?? '?'}
          </Text>
        </View>
      )}
      <View style={styles.eslesmeInfo}>
        <Text style={styles.eslesmeMusteriAd}>{musteri?.ad} {musteri?.soyad}</Text>
        <Text style={styles.eslesmeIlanBaslik} numberOfLines={1}>{ilan?.baslik}</Text>
        {ilan?.fiyat && <Text style={styles.eslesmeIlanFiyat}>₺{ilan.fiyat.toLocaleString('tr-TR')}</Text>}
      </View>
      <View style={[styles.eslesmeDurum, {
        backgroundColor: eslesme.durum === 'Yeni' ? Colors.primaryFixed : Colors.surfaceContainerHigh
      }]}>
        <Text style={[styles.eslesmeDurumText, {
          color: eslesme.durum === 'Yeni' ? Colors.primary : Colors.onSurfaceVariant
        }]}>{eslesme.durum}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  scroll: { paddingBottom: 32 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.lg,
  },
  greeting: { fontSize: 22, fontWeight: '700', color: Colors.onSurface },
  subGreeting: { fontSize: 13, color: Colors.onSurfaceVariant, marginTop: 2 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: Radius.full,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: 16 },

  bildirimWrap: { width: 44, height: 44, borderRadius: Radius.full, backgroundColor: Colors.surfaceContainerLow, alignItems: 'center', justifyContent: 'center' },
  bildirimIcon: { fontSize: 20 },
  bildirimBadge: { position: 'absolute', top: 4, right: 4, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: '#ef4444', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  bildirimBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },

  section: { paddingHorizontal: Spacing.xl, marginTop: Spacing.lg },

  aksiyonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  aksiyon: { alignItems: 'center', gap: 8 },
  aksiyonIcon: {
    width: 60,
    height: 60,
    borderRadius: Radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aksiyonEmoji: { fontSize: 24 },
  aksiyonLabel: { fontSize: 12, color: Colors.onSurfaceVariant, fontWeight: '500' },

  statsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.xl,
    marginTop: Spacing.lg,
  },
  statKart: {
    flex: 1,
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    shadowColor: Colors.primary,
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  statDeger: { fontSize: 28, fontWeight: '700' },
  statBaslik: { fontSize: 11, color: Colors.onSurfaceVariant, marginTop: 4, fontWeight: '500' },
  statAlt: { fontSize: 9, fontWeight: '700', marginTop: 2, opacity: 0.6, textTransform: 'uppercase', letterSpacing: 0.3 },

  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: Colors.onSurface },
  tümünüGör: { fontSize: 13, color: Colors.primary, fontWeight: '600' },

  eslesmeKart: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  eslesmeAvatar: {
    width: 52,
    height: 52,
    borderRadius: Radius.md,
    backgroundColor: Colors.primaryFixed,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eslesmeAvatarText: { color: Colors.primary, fontWeight: '700', fontSize: 16 },
  eslesmeIlanFoto: { width: 52, height: 52, borderRadius: Radius.md },
  eslesmeInfo: { flex: 1, paddingHorizontal: Spacing.md },
  eslesmeMusteriAd: { fontSize: 14, fontWeight: '600', color: Colors.onSurface },
  eslesmeIlanBaslik: { fontSize: 12, color: Colors.onSurfaceVariant, marginTop: 2 },
  eslesmeIlanFiyat: { fontSize: 12, fontWeight: '700', color: Colors.primary, marginTop: 3 },
  eslesmeDurum: { borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 4 },
  eslesmeDurumText: { fontSize: 11, fontWeight: '600' },

  emptyBox: {
    backgroundColor: Colors.surfaceContainerLow,
    borderRadius: Radius.lg,
    padding: Spacing.xl,
    alignItems: 'center',
  },
  emptyText: { color: Colors.onSurfaceVariant, fontSize: 14 },

  bildirimDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#ef4444' },
  takipKart: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: Radius.lg, padding: Spacing.md, marginBottom: Spacing.sm,
    borderLeftWidth: 3, borderLeftColor: Colors.primary,
  },
  takipKartGecmis: { borderLeftColor: '#ef4444', backgroundColor: '#fff5f5' },
  takipAvatar: { width: 40, height: 40, borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center' },
  takipAvatarText: { fontWeight: '700', fontSize: 16 },
  takipAd: { fontSize: 14, fontWeight: '600', color: Colors.onSurface },
  takipTarih: { fontSize: 12, marginTop: 2 },

  bdModalOverlay: { flex: 1, justifyContent: 'flex-end' },
  bdModalDimmer: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  bdModalPanel: { backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '75%' },
  bdModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.lg, borderBottomWidth: 1, borderBottomColor: Colors.surfaceContainerLow },
  bdModalBaslik: { fontSize: 17, fontWeight: '700', color: Colors.onSurface },
  bdKapat: { fontSize: 20, color: Colors.onSurfaceVariant, width: 32, textAlign: 'right' },
  bdBos: { padding: Spacing.xl * 2, alignItems: 'center' },
  bdBosText: { color: Colors.onSurfaceVariant, fontSize: 14 },
  bdItem: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderRadius: Radius.lg, padding: Spacing.md },
  bdItemYeni: { backgroundColor: 'rgba(229,57,53,0.06)' },
  bdIcon: { width: 44, height: 44, borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center' },
  bdBaslik: { fontSize: 14, fontWeight: '600', color: Colors.onSurface },
  bdAlt: { fontSize: 12, color: Colors.onSurfaceVariant, marginTop: 2 },
  bdMenuBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  bdMenuText: { fontSize: 22, color: '#6b7280', fontWeight: '700', lineHeight: 24 },
  bdMenuOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.25)', justifyContent: 'center', alignItems: 'center' },
  bdMenuPopup: { backgroundColor: '#fff', borderRadius: 12, minWidth: 220, overflow: 'hidden', elevation: 8, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
  bdMenuItem: { paddingVertical: 14, paddingHorizontal: 18 },
  bdMenuItemText: { fontSize: 15, color: Colors.onSurface, fontWeight: '500' },
  bdMenuSep: { height: 1, backgroundColor: '#f3f4f6' },
  bdTumuBtn: { alignSelf: 'flex-end', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 14, backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb', marginBottom: 8 },
  bdTumuText: { fontSize: 12, color: Colors.onSurface, fontWeight: '500' },
  bdDetayItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.surfaceContainerLowest, borderRadius: Radius.lg, padding: Spacing.md, overflow: 'hidden' },
  bdDetayFoto: { width: 52, height: 52, borderRadius: Radius.md },
});
