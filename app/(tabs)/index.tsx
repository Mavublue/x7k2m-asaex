import { useEffect, useState, useCallback, useRef } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, ActivityIndicator, Image, Modal, FlatList, RefreshControl, TextInput, AppState,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import R2Image from '../../components/R2Image';
import DateTimePicker from '@react-native-community/datetimepicker';
import { supabase } from '../../lib/supabase';
import { Colors, Radius, Spacing } from '../../constants/theme';
import { Eslesme } from '../../types';

function goreciZaman(iso: string): string {
  if (!iso) return '';
  const fark = Date.now() - new Date(iso).getTime();
  const dk = Math.floor(fark / 60000);
  if (dk < 1) return 'Az önce';
  if (dk < 60) return `${dk} dk önce`;
  const saat = Math.floor(dk / 60);
  if (saat < 24) return `${saat} saat önce`;
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function DashboardScreen() {
  const [userName, setUserName] = useState('');
  const [ilanSayisi, setIlanSayisi] = useState(0);
  const [musteriSayisi, setMusteriSayisi] = useState(0);
  const [eslesmeSayisi, setEslesmeSayisi] = useState(0);
  const [yeniEslesmeler, setYeniEslesmeler] = useState<Eslesme[]>([]);
  const [takipMusteriler, setTakipMusteriler] = useState<any[]>([]);
  const [gorevDashboard, setGorevDashboard] = useState<any[]>([]);
  const [gorevFiltre, setGorevFiltre] = useState<'gecmis' | 'bugun' | 'yarin' | '7gun' | 'tumu'>('bugun');
  const [gecmisCount, setGecmisCount] = useState(0);
  const [silOnayId, setSilOnayId] = useState<string | null>(null);
  const [editGorev, setEditGorev] = useState<any | null>(null);
  const [editBaslik, setEditBaslik] = useState('');
  const [editTarihDate, setEditTarihDate] = useState<Date>(new Date());
  const [editSaatDate, setEditSaatDate] = useState<Date | null>(null);
  const [showEditTarihPicker, setShowEditTarihPicker] = useState(false);
  const [showEditSaatPicker, setShowEditSaatPicker] = useState(false);
  const [genelGorevModal, setGenelGorevModal] = useState(false);
  const [genelBaslik, setGenelBaslik] = useState('');
  const [genelTarihDate, setGenelTarihDate] = useState<Date>(new Date());
  const [genelSaatDate, setGenelSaatDate] = useState<Date | null>(null);
  const [showGenelTarihPicker, setShowGenelTarihPicker] = useState(false);
  const [showGenelSaatPicker, setShowGenelSaatPicker] = useState(false);
  const [genelMusteriId, setGenelMusteriId] = useState<string | null>(null);
  const [genelMusteriArama, setGenelMusteriArama] = useState('');
  const [musteriListesi, setMusteriListesi] = useState<{id:string;ad:string;soyad:string|null;etiketler:string|null}[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [bildirimModal, setBildirimModal] = useState(false);
  const [bildirimler, setBildirimler] = useState<{id:string;tip:string;baslik:string;alt:string;hedefId:string;tarih:string;foto?:string|null}[]>([]);
  const [okundu, setOkundu] = useState<Set<string>>(new Set());
  const [silindi, setSilindi] = useState<Set<string>>(new Set());
  const [detayBildirim, setDetayBildirim] = useState<{id:string;tip:string;baslik:string;alt:string;hedefId:string;tarih:string;foto?:string|null}|null>(null);
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
    fetchGorevDashboard('bugun');

    const channel = supabase.channel('bildirim-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'asistan_oneriler' }, () => fetchBildirimler())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'musteri_gorevler' }, () => { fetchBildirimler(); fetchGorevDashboard(gorevFiltre); })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'musteriler' }, () => fetchBildirimler())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ilanlar' }, () => fetchBildirimler())
      .subscribe();

    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') fetchBildirimler();
    });

    return () => { supabase.removeChannel(channel); appStateSub.remove(); };
  }, []);

  useFocusEffect(useCallback(() => {
    fetchData();
    fetchGorevDashboard(gorevFiltre);
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

  const ODALAR_ORDER = ['Stüdyo', '1+0', '1+1', '2+1', '3+1', '3+2', '4+1', '5+'];
  function istekEslesiyor(istek: any, ilan: any): boolean {
    if (!istek.butce_min && !istek.butce_max && !istek.tip && !istek.tercih_konum && !istek.min_oda && !istek.bina_yasi) return false;
    const f = Number(ilan.fiyat);
    if (istek.butce_min != null && f < Number(istek.butce_min)) return false;
    if (istek.butce_max != null && f > Number(istek.butce_max)) return false;
    if (istek.tip) {
      const tipler = istek.tip.split(',').map((t: string) => t.trim());
      const cats = (ilan.kategori ?? '').split(',').map((s: string) => s.trim()).filter(Boolean);
      if (!cats.some((c: string) => tipler.includes(c))) return false;
    }
    if (istek.tercih_konum) {
      const konumlar = istek.tercih_konum.split(/\s*\|\s*/).map((s: string) => s.trim()).filter(Boolean);
      const eslesti = konumlar.some((konum: string) => {
        const [il, ilce, mah] = konum.split(' / ').map((p: string) => p.trim());
        if (mah) {
          if (il && ilan.konum?.toLowerCase() !== il.toLowerCase()) return false;
          if (ilce && ilan.ilce?.toLowerCase() !== ilce.toLowerCase()) return false;
          if (!ilan.mahalle?.toLowerCase().includes(mah.toLowerCase())) return false;
          return true;
        }
        if (ilce) {
          if (il && ilan.konum?.toLowerCase() !== il.toLowerCase()) return false;
          if (ilan.ilce?.toLowerCase() !== ilce.toLowerCase()) return false;
          return true;
        }
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

  function eslesenMi(m: any, ilan: any): boolean {
    const istekler: any[] = m.musteri_istekler ?? [];
    if (!istekler.length) return false;
    return istekler.some(istek => istekEslesiyor(istek, ilan));
  }

  async function fetchBildirimler() {
    const liste: {id:string;tip:string;baslik:string;alt:string;hedefId:string;tarih:string;foto?:string|null}[] = [];
    const bugun = new Date().toISOString().split('T')[0];

    const yediGunOnce = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const yediGunOnceTarih = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const [
      { data: tumMusteriler, error: mErr },
      { data: tumIlanlar, error: iErr },
      { data: tumGorevler },
      { data: uzunSuredir },
      { data: aiOneriler },
    ] = await Promise.all([
      supabase.from('musteriler').select('id, ad, soyad, etiketler, takip_tarihi, olusturma_tarihi, musteri_istekler(tip, butce_min, butce_max, tercih_konum)'),
      supabase.from('ilanlar').select('id, baslik, fiyat, konum, ilce, mahalle, kategori, fotograflar, olusturma_tarihi'),
      supabase.from('musteri_gorevler').select('id, baslik, hedef_tarih, musteri_id, musteriler(id, ad, soyad, etiketler)').eq('tamamlandi', false).not('hedef_tarih', 'is', null).lte('hedef_tarih', new Date().toISOString()),
      supabase.from('musteriler').select('id, ad, soyad, etiketler, guncelleme_tarihi, olusturma_tarihi').eq('durum', 'Aktif').lt('guncelleme_tarihi', yediGunOnce),
      supabase.from('asistan_oneriler').select('id, musteri_id, mesaj, tip, created_at').gte('created_at', yediGunOnceTarih).order('created_at', { ascending: false }),
    ]);

    if (mErr || iErr) {
      console.log('Bildirim hata:', mErr?.message, iErr?.message);
      return;
    }

    const ilanlar = tumIlanlar ?? [];
    const musteriler = tumMusteriler ?? [];

    // AI asistan önerileri
    for (const a of aiOneriler ?? []) {
      const temizMesaj = a.mesaj.replace(/[#*_`]/g, '').trim();
      if (a.musteri_id) {
        const m = musteriler.find((x: any) => x.id === a.musteri_id);
        const musteriLabel = m ? [m.etiketler ? `#${m.etiketler}` : null, m.ad, m.soyad].filter(Boolean).join(' ') : '?';
        liste.push({ id: `ai-${a.id}`, tip: 'asistan', baslik: musteriLabel, alt: temizMesaj, hedefId: a.musteri_id, tarih: a.created_at });
      } else {
        const slotBaslik = a.tip === 'sabah' ? '🌅 Sabah Özeti' : a.tip === 'oglen' ? '☀️ Öğlen Hatırlatması' : '🌙 Akşam Özeti';
        liste.push({ id: `ai-${a.id}`, tip: 'asistan', baslik: slotBaslik, alt: temizMesaj, hedefId: '', tarih: a.created_at });
      }
    }

    // Gecikmiş görevler
    for (const g of tumGorevler ?? []) {
      const m = (g as any).musteriler;
      const isim = [m?.etiketler ? `#${m.etiketler}` : null, m?.ad, m?.soyad].filter(Boolean).join(' ');
      liste.push({ id: `gorev-${g.id}`, tip: 'gorev', baslik: isim, alt: `Gecikmiş görev: "${g.baslik}"`, hedefId: g.musteri_id, tarih: g.hedef_tarih });
    }

    // 7+ gün iletişim yok
    for (const m of uzunSuredir ?? []) {
      const isim = [m.etiketler ? `#${m.etiketler}` : null, m.ad, m.soyad].filter(Boolean).join(' ');
      liste.push({ id: `sessiz-${m.id}`, tip: 'sessiz', baslik: isim, alt: '7+ gündür iletişim yok', hedefId: m.id, tarih: m.olusturma_tarihi ?? '' });
    }

    // Takip
    for (const m of musteriler) {
      if (m.takip_tarihi && m.takip_tarihi <= bugun) {
        const [y, mo, d] = m.takip_tarihi.split('-');
        liste.push({ id: `takip-${m.id}`, tip: 'takip', baslik: [m.etiketler ? `#${m.etiketler}` : null, m.ad, m.soyad].filter(Boolean).join(' '), alt: `Takip tarihi: ${d}.${mo}.${y}`, hedefId: m.id, tarih: m.olusturma_tarihi ?? m.takip_tarihi });
      }
    }

    // Müşteri → ilan eşleşmesi
    for (const m of musteriler) {
      const eslesen = ilanlar.filter(i => eslesenMi(m, i));
      if (eslesen.length > 0) liste.push({ id: `musteri-${m.id}`, tip: 'musteri', baslik: [m.etiketler ? `#${m.etiketler}` : null, m.ad, m.soyad].filter(Boolean).join(' '), alt: `${eslesen.length} uygun ilan eşleşiyor`, hedefId: m.id, tarih: m.olusturma_tarihi ?? '', foto: (eslesen[0] as any)?.fotograflar?.[0] ?? null });
    }

    // İlan → müşteri eşleşmesi
    for (const i of ilanlar) {
      const eslesen = musteriler.filter(m => eslesenMi(m, i));
      if (eslesen.length > 0) liste.push({ id: `ilan-${i.id}`, tip: 'ilan', baslik: i.baslik, alt: `${eslesen.length} uygun müşteri eşleşiyor`, hedefId: i.id, tarih: i.olusturma_tarihi ?? '', foto: (i as any).fotograflar?.[0] ?? null });
    }

    setBildirimler(liste);
  }

  async function bildirimDetayAc(b: {id:string;tip:string;baslik:string;alt:string;hedefId:string;tarih:string;foto?:string|null}) {
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
      const { data: istekler } = await supabase.from('musteri_istekler').select('*').eq('musteri_id', b.hedefId);
      if (istekler?.length) {
        const { data } = await supabase.from('ilanlar').select('id, baslik, fiyat, konum, ilce, mahalle, kategori, fotograflar, tip').eq('durum', 'Aktif');
        setDetayListe((data ?? []).filter((ilan: any) => (istekler ?? []).some((istek: any) => istekEslesiyor(istek, ilan))));
      } else {
        setDetayListe([]);
      }
    } else if (b.tip === 'ilan') {
      const { data: ilan } = await supabase.from('ilanlar').select('fiyat, konum, ilce, mahalle, kategori').eq('id', b.hedefId).single();
      if (ilan) {
        const { data: tum } = await supabase.from('musteriler').select('id, ad, soyad, telefon, durum, musteri_istekler(tip, butce_min, butce_max, tercih_konum)');
        setDetayListe((tum ?? []).filter(m => eslesenMi(m, ilan)));
      }
    } else if (b.tip === 'takip' || b.tip === 'gorev' || b.tip === 'sessiz') {
      setBildirimModal(false);
      setDetayBildirim(null);
      router.push(`/musteri/${b.hedefId}` as any);
      return;
    } else if (b.tip === 'asistan') {
      if (b.hedefId) {
        setBildirimModal(false);
        setDetayBildirim(null);
        router.push(`/musteri/${b.hedefId}` as any);
        return;
      }
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

  async function tumunuOkunduYap() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const ids = bildirimler.filter(b => !silindi.has(b.id)).map(b => b.id);
    if (ids.length === 0) return;
    setOkundu(new Set(ids));
    const rows = ids.map(id => ({ user_id: user.id, bildirim_id: id, silindi: false }));
    await supabase.from('bildirim_okundu').upsert(rows, { onConflict: 'user_id,bildirim_id' });
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

    const { data: mListe } = await supabase.from('musteriler').select('id, ad, soyad, etiketler').order('ad');
    if (mListe) setMusteriListesi(mListe);

    setLoading(false);
  }

  async function fetchGorevDashboard(filtre: 'gecmis' | 'bugun' | 'yarin' | '7gun' | 'tumu') {
    const baslangic = new Date();
    baslangic.setHours(0, 0, 0, 0);

    let q = supabase
      .from('musteri_gorevler')
      .select('id, baslik, hedef_tarih, musteri_id, musteriler(ad, soyad, etiketler)')
      .eq('tamamlandi', false)
      .not('hedef_tarih', 'is', null)
      .order('hedef_tarih', { ascending: true });

    if (filtre === 'gecmis') {
      q = q.lt('hedef_tarih', baslangic.toISOString());
    } else if (filtre === 'bugun') {
      const bitis = new Date(baslangic); bitis.setDate(bitis.getDate() + 1);
      q = q.gte('hedef_tarih', baslangic.toISOString()).lt('hedef_tarih', bitis.toISOString());
    } else if (filtre === 'yarin') {
      const yBaslangic = new Date(baslangic); yBaslangic.setDate(yBaslangic.getDate() + 1);
      const yBitis = new Date(yBaslangic); yBitis.setDate(yBitis.getDate() + 1);
      q = q.gte('hedef_tarih', yBaslangic.toISOString()).lt('hedef_tarih', yBitis.toISOString());
    } else if (filtre === '7gun') {
      const bitis = new Date(baslangic); bitis.setDate(bitis.getDate() + 7);
      q = q.gte('hedef_tarih', baslangic.toISOString()).lt('hedef_tarih', bitis.toISOString());
    }

    const { data } = await q;
    setGorevDashboard(data ?? []);

    const { count } = await supabase.from('musteri_gorevler')
      .select('id', { count: 'exact', head: true })
      .eq('tamamlandi', false)
      .not('hedef_tarih', 'is', null)
      .lt('hedef_tarih', baslangic.toISOString());
    setGecmisCount(count ?? 0);
  }

  async function gorevDuzenleKaydet() {
    if (!editGorev || !editBaslik.trim()) return;
    const dt = new Date(editTarihDate);
    if (editSaatDate) { dt.setHours(editSaatDate.getHours(), editSaatDate.getMinutes(), 0, 0); }
    else { dt.setUTCHours(0, 0, 0, 0); }
    await supabase.from('musteri_gorevler').update({ baslik: editBaslik.trim(), hedef_tarih: dt.toISOString() }).eq('id', editGorev.id);
    setGorevDashboard(prev => prev.map(g => g.id === editGorev.id ? { ...g, baslik: editBaslik.trim(), hedef_tarih: dt.toISOString() } : g));
    setEditGorev(null);
  }

  async function gorevTamamlaDashboard(gorevId: string) {
    await supabase.from('musteri_gorevler').update({ tamamlandi: true }).eq('id', gorevId);
    setGorevDashboard(prev => prev.filter(g => g.id !== gorevId));
  }

  async function gorevSilDashboard(id: string) {
    await supabase.from('musteri_gorevler').delete().eq('id', id);
    setGorevDashboard(prev => prev.filter(g => g.id !== id));
    setGecmisCount(prev => gorevFiltre === 'gecmis' ? Math.max(0, prev - 1) : prev);
    setSilOnayId(null);
  }

  async function genelGorevEkle() {
    if (!genelBaslik.trim()) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const dt = new Date(genelTarihDate);
    if (genelSaatDate) { dt.setHours(genelSaatDate.getHours(), genelSaatDate.getMinutes(), 0, 0); }
    else { dt.setUTCHours(0, 0, 0, 0); }
    await supabase.from('musteri_gorevler').insert({ baslik: genelBaslik.trim(), hedef_tarih: dt.toISOString(), user_id: user.id, tamamlandi: false, ...(genelMusteriId ? { musteri_id: genelMusteriId } : {}) });
    setGenelBaslik(''); setGenelTarihDate(new Date()); setGenelSaatDate(null); setGenelMusteriId(null); setGenelMusteriArama(''); setGenelGorevModal(false);
    fetchGorevDashboard(gorevFiltre);
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

        {/* Görevler */}
        <View style={styles.section}>
          <View style={{ marginBottom: Spacing.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={[styles.bildirimDot, { backgroundColor: '#16a34a' }]} />
                <Text style={styles.sectionTitle}>Görevler</Text>
              </View>
              <TouchableOpacity onPress={() => setGenelGorevModal(true)} style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 99, backgroundColor: '#dbeafe' }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#1d4ed8' }}>＋ Ekle</Text>
              </TouchableOpacity>
            </View>
            <View style={{ flexDirection: 'row', gap: 4, flexWrap: 'wrap' }}>
              {([['gecmis','Gecikmiş'],['bugun','Bugün'],['yarin','Yarın'],['7gun','7 Gün'],['tumu','Tümü']] as ['gecmis'|'bugun'|'yarin'|'7gun'|'tumu', string][]).map(([f, label]) => (
                <TouchableOpacity key={f} onPress={() => { setGorevFiltre(f); fetchGorevDashboard(f); }}
                  style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 99, backgroundColor: gorevFiltre === f ? (f === 'gecmis' ? '#ef4444' : '#16a34a') : Colors.surfaceContainerHigh }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: gorevFiltre === f ? '#fff' : (f === 'gecmis' && gecmisCount > 0 ? '#ef4444' : Colors.onSurfaceVariant) }}>
                    {label}{f === 'gecmis' && gecmisCount > 0 && gorevFiltre !== 'gecmis' ? ` ${gecmisCount}` : ''}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          {gorevDashboard.length === 0 ? (
            <View style={{ padding: 16, backgroundColor: gorevFiltre === 'gecmis' ? '#fff5f5' : '#f0fdf4', borderRadius: 10, alignItems: 'center' }}>
              <Text style={{ fontSize: 13, color: gorevFiltre === 'gecmis' ? '#ef4444' : '#16a34a', fontWeight: '500' }}>
                {gorevFiltre === 'gecmis' ? 'Gecikmiş görev yok 🎉' : gorevFiltre === 'bugun' ? 'Bugün için görev yok 🎉' : gorevFiltre === 'yarin' ? 'Yarın için görev yok 🎉' : gorevFiltre === '7gun' ? '7 günlük görev yok 🎉' : 'Aktif görev yok 🎉'}
              </Text>
            </View>
          ) : (
            gorevDashboard.map(g => {
              const d = g.hedef_tarih ? new Date(g.hedef_tarih) : null;
              const hasTime = d && (d.getUTCHours() !== 0 || d.getUTCMinutes() !== 0);
              const pad = (n: number) => String(n).padStart(2, '0');
              const saatStr = hasTime && d ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : null;
              const tarihStr = d ? `${pad(d.getDate())}.${pad(d.getMonth()+1)}.${d.getFullYear()}${saatStr ? ` ⏰ ${saatStr}` : ''}` : '';
              const gecmis = gorevFiltre === 'gecmis';
              const m = g.musteriler;
              const musteriLabel = [m?.etiketler ? `#${m.etiketler}` : null, m?.ad, m?.soyad].filter(Boolean).join(' ');
              return (
                <TouchableOpacity key={g.id} onPress={() => router.push(`/musteri/${g.musteri_id}` as any)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, backgroundColor: gecmis ? '#fff5f5' : Colors.surface, borderRadius: 10, borderWidth: 1, borderColor: gecmis ? '#fecaca' : '#e5e7eb', borderLeftWidth: 3, borderLeftColor: gecmis ? '#ef4444' : '#16a34a', marginBottom: 6 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: Colors.onSurface }}>{g.baslik}</Text>
                    <Text style={{ fontSize: 11, color: gecmis ? '#ef4444' : Colors.onSurfaceVariant, marginTop: 2 }}>
                      {musteriLabel || '—'}{tarihStr ? ` · 📅 ${tarihStr}` : ''}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 4 }}>
                    <TouchableOpacity onPress={() => {
                      const dt = g.hedef_tarih ? new Date(g.hedef_tarih) : new Date();
                      setEditGorev(g);
                      setEditBaslik(g.baslik);
                      setEditTarihDate(dt);
                      setEditSaatDate(g.hedef_tarih && (new Date(g.hedef_tarih).getUTCHours()!==0||new Date(g.hedef_tarih).getUTCMinutes()!==0) ? dt : null);
                    }} style={{ paddingHorizontal: 8, paddingVertical: 6, backgroundColor: Colors.surfaceContainerHigh, borderRadius: 6 }}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: Colors.onSurfaceVariant }}>✏️</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setSilOnayId(g.id)}
                      style={{ paddingHorizontal: 8, paddingVertical: 6, backgroundColor: '#fff5f5', borderRadius: 6, borderWidth: 1, borderColor: '#fecaca' }}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#ef4444' }}>🗑</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => gorevTamamlaDashboard(g.id)}
                      style={{ paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#f0fdf4', borderRadius: 6, borderWidth: 1, borderColor: '#86efac' }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: '#16a34a' }}>✓</Text>
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </View>

        {/* Görev Düzenle Modal */}
        <Modal visible={!!editGorev} transparent animationType="fade" onRequestClose={() => setEditGorev(null)}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
            <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 22, width: '100%', maxWidth: 360 }}>
              <Text style={{ fontWeight: '700', fontSize: 15, marginBottom: 6 }}>✏️ Görevi Düzenle</Text>
              {editGorev && (() => { const m = editGorev.musteriler; const lbl = [m?.etiketler ? `#${m.etiketler}` : null, m?.ad, m?.soyad].filter(Boolean).join(' '); return lbl ? <Text style={{ fontSize: 11, color: '#6b7280', marginBottom: 10 }}>{lbl}</Text> : null; })()}
              <TextInput value={editBaslik} onChangeText={setEditBaslik} placeholder="Görev başlığı"
                style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, padding: 10, fontSize: 13, marginBottom: 8 }} />
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
                <TouchableOpacity onPress={() => setShowEditTarihPicker(true)} style={{ flex: 1, padding: 10, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8 }}>
                  <Text style={{ fontSize: 13, color: '#374151' }}>📅 {editTarihDate.toLocaleDateString('tr-TR')}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setShowEditSaatPicker(true)} style={{ width: 90, padding: 10, borderWidth: 1, borderColor: editSaatDate ? '#86efac' : '#e5e7eb', borderRadius: 8, alignItems: 'center' }}>
                  <Text style={{ fontSize: 13, color: editSaatDate ? '#16a34a' : '#9ca3af' }}>
                    {editSaatDate ? `⏰ ${String(editSaatDate.getHours()).padStart(2,'0')}:${String(editSaatDate.getMinutes()).padStart(2,'0')}` : '⏰ Saat'}
                  </Text>
                </TouchableOpacity>
              </View>
              {editSaatDate && (
                <TouchableOpacity onPress={() => setEditSaatDate(null)} style={{ marginBottom: 12, alignItems: 'center' }}>
                  <Text style={{ fontSize: 11, color: '#6b7280' }}>Saati kaldır ✕</Text>
                </TouchableOpacity>
              )}
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity onPress={() => setEditGorev(null)} style={{ flex: 1, padding: 12, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, alignItems: 'center' }}>
                  <Text style={{ fontSize: 13, color: '#6b7280', fontWeight: '500' }}>İptal</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={gorevDuzenleKaydet} style={{ flex: 1, padding: 12, backgroundColor: '#3b82f6', borderRadius: 8, alignItems: 'center' }}>
                  <Text style={{ fontSize: 13, color: '#fff', fontWeight: '700' }}>Kaydet</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
          {showEditTarihPicker && <DateTimePicker value={editTarihDate} mode="date" display="default" locale="tr-TR" onChange={(_, d) => { setShowEditTarihPicker(false); if (d) setEditTarihDate(d); }} />}
          {showEditSaatPicker && <DateTimePicker value={editSaatDate ?? new Date()} mode="time" is24Hour display="default" onChange={(_, d) => { setShowEditSaatPicker(false); if (d) setEditSaatDate(d); }} />}
        </Modal>

        {/* Takip Bildirimleri */}
        {takipMusteriler.length > 0 && (
          <View style={styles.section} onLayout={e => { takipY.current = e.nativeEvent.layout.y; }}>
        {/* Genel Görev Ekle Modal */}
        <Modal visible={genelGorevModal} transparent animationType="fade" onRequestClose={() => setGenelGorevModal(false)}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
            <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 22, width: '100%', maxWidth: 360 }}>
              <Text style={{ fontWeight: '700', fontSize: 15, marginBottom: 12 }}>＋ Görev Ekle</Text>
              <TextInput value={genelBaslik} onChangeText={setGenelBaslik} placeholder="Görev başlığı"
                style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, padding: 10, fontSize: 13, marginBottom: 8 }} />
              {genelMusteriId ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 10, borderWidth: 1, borderColor: '#86efac', borderRadius: 8, backgroundColor: '#f0fdf4', marginBottom: 8 }}>
                  <Text style={{ fontSize: 13, color: '#166534', fontWeight: '600', flex: 1 }}>
                    {(() => { const m = musteriListesi.find(x => x.id === genelMusteriId); return [m?.etiketler ? `#${m.etiketler}` : null, m?.ad, m?.soyad].filter(Boolean).join(' '); })()}
                  </Text>
                  <TouchableOpacity onPress={() => { setGenelMusteriId(null); setGenelMusteriArama(''); }}>
                    <Text style={{ color: '#6b7280', fontSize: 14 }}>✕</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={{ marginBottom: 8 }}>
                  <TextInput value={genelMusteriArama} onChangeText={setGenelMusteriArama} placeholder="Müşteri ara (opsiyonel)"
                    style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, padding: 10, fontSize: 13 }} />
                  {genelMusteriArama.trim().length > 0 && (
                    <View style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, marginTop: 2, maxHeight: 140, overflow: 'hidden' }}>
                      {musteriListesi.filter(m => `${m.ad} ${m.soyad ?? ''} ${m.etiketler ?? ''}`.toLowerCase().includes(genelMusteriArama.toLowerCase())).slice(0,6).map(m => (
                        <TouchableOpacity key={m.id} onPress={() => { setGenelMusteriId(m.id); setGenelMusteriArama(''); }}
                          style={{ padding: 10, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' }}>
                          <Text style={{ fontSize: 13, color: '#374151' }}>{[m.etiketler ? `#${m.etiketler}` : null, m.ad, m.soyad].filter(Boolean).join(' ')}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
              )}
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                <TouchableOpacity onPress={() => setShowGenelTarihPicker(true)} style={{ flex: 1, padding: 10, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8 }}>
                  <Text style={{ fontSize: 13, color: '#374151' }}>📅 {genelTarihDate.toLocaleDateString('tr-TR')}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setShowGenelSaatPicker(true)} style={{ width: 90, padding: 10, borderWidth: 1, borderColor: genelSaatDate ? '#86efac' : '#e5e7eb', borderRadius: 8, alignItems: 'center' }}>
                  <Text style={{ fontSize: 13, color: genelSaatDate ? '#16a34a' : '#9ca3af' }}>
                    {genelSaatDate ? `⏰ ${String(genelSaatDate.getHours()).padStart(2,'0')}:${String(genelSaatDate.getMinutes()).padStart(2,'0')}` : '⏰ Saat'}
                  </Text>
                </TouchableOpacity>
              </View>
              {genelSaatDate && (
                <TouchableOpacity onPress={() => setGenelSaatDate(null)} style={{ marginBottom: 10, alignItems: 'center' }}>
                  <Text style={{ fontSize: 11, color: '#6b7280' }}>Saati kaldır ✕</Text>
                </TouchableOpacity>
              )}
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                <TouchableOpacity onPress={() => { setGenelGorevModal(false); setGenelBaslik(''); setGenelTarihDate(new Date()); setGenelSaatDate(null); setGenelMusteriId(null); setGenelMusteriArama(''); }}
                  style={{ flex: 1, padding: 12, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, alignItems: 'center' }}>
                  <Text style={{ fontSize: 13, color: '#6b7280', fontWeight: '500' }}>İptal</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={genelGorevEkle}
                  style={{ flex: 1, padding: 12, backgroundColor: genelBaslik.trim() ? '#16a34a' : '#e5e7eb', borderRadius: 8, alignItems: 'center' }}>
                  <Text style={{ fontSize: 13, color: genelBaslik.trim() ? '#fff' : '#9ca3af', fontWeight: '700' }}>Ekle</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
          {showGenelTarihPicker && <DateTimePicker value={genelTarihDate} mode="date" display="default" locale="tr-TR" onChange={(_, d) => { setShowGenelTarihPicker(false); if (d) setGenelTarihDate(d); }} />}
          {showGenelSaatPicker && <DateTimePicker value={genelSaatDate ?? new Date()} mode="time" is24Hour display="default" onChange={(_, d) => { setShowGenelSaatPicker(false); if (d) setGenelSaatDate(d); }} />}
        </Modal>

        {/* Görev Sil Onay */}
        <Modal visible={!!silOnayId} transparent animationType="fade" onRequestClose={() => setSilOnayId(null)}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
            <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 22, width: '100%', maxWidth: 320 }}>
              <Text style={{ fontWeight: '700', fontSize: 15, marginBottom: 8 }}>🗑 Görevi Sil</Text>
              <Text style={{ fontSize: 13, color: '#6b7280', marginBottom: 20 }}>Bu görev kalıcı olarak silinecek. Emin misiniz?</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity onPress={() => setSilOnayId(null)} style={{ flex: 1, padding: 12, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, alignItems: 'center' }}>
                  <Text style={{ fontSize: 13, color: '#6b7280', fontWeight: '500' }}>İptal</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => silOnayId && gorevSilDashboard(silOnayId)} style={{ flex: 1, padding: 12, backgroundColor: '#ef4444', borderRadius: 8, alignItems: 'center' }}>
                  <Text style={{ fontSize: 13, color: '#fff', fontWeight: '700' }}>Sil</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

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
                    <Text style={styles.takipAd}>{[m.ad, m.soyad].filter(Boolean).join(' ')}</Text>
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
                      <TouchableOpacity onPress={tumunuOkunduYap} style={styles.bdTumuBtn}>
                        <Text style={styles.bdTumuText}>Tümünü okundu yap</Text>
                      </TouchableOpacity>
                    )}
                    renderItem={({ item }) => {
                      const isOkundu = okundu.has(item.id);
                      return (
                        <View style={[styles.bdItem, !isOkundu && styles.bdItemYeni]}>
                          {item.foto ? (
                            <TouchableOpacity onPress={() => bildirimDetayAc(item)}>
                              <R2Image source={item.foto!} size="sm" style={styles.bdFoto} />
                            </TouchableOpacity>
                          ) : (
                            <TouchableOpacity style={[styles.bdIcon, {
                              backgroundColor: item.tip === 'takip' ? '#fee2e2' : item.tip === 'gorev' ? '#fef3c7' : item.tip === 'sessiz' ? '#f3e8ff' : item.tip === 'asistan' ? '#e0f2fe' : item.tip === 'musteri' ? Colors.primaryFixed : '#f0fdf4'
                            }]} onPress={() => bildirimDetayAc(item)}>
                              <Text style={{ fontSize: 16 }}>
                                {item.tip === 'takip' ? '⚠️' : item.tip === 'gorev' ? '📋' : item.tip === 'sessiz' ? '🔕' : item.tip === 'asistan' ? '🤖' : item.tip === 'musteri' ? '👤' : '🏠'}
                              </Text>
                            </TouchableOpacity>
                          )}
                          <TouchableOpacity style={{ flex: 1 }} onPress={() => bildirimDetayAc(item)}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                              <Text style={[styles.bdBaslik, !isOkundu && { fontWeight: '700' }, { flex: 1 }]} numberOfLines={1}>{item.baslik}</Text>
                              {item.tarih ? <Text style={styles.bdZaman}>{goreciZaman(item.tarih)}</Text> : null}
                            </View>
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
              ) : detayBildirim?.tip === 'asistan' && !detayBildirim.hedefId ? (
                <View style={{ padding: Spacing.xl }}>
                  <Text style={{ fontSize: 14, color: Colors.onSurface, lineHeight: 22 }}>{detayBildirim.alt}</Text>
                </View>
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
                            ? <R2Image source={item.fotograflar[0]} size="sm" style={styles.bdDetayFoto} />
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
                            <Text style={styles.bdBaslik}>{[item.ad, item.soyad].filter(Boolean).join(' ')}</Text>
                            <Text style={styles.bdAlt}>
                              {(() => { const i0 = item.musteri_istekler?.[0]; return i0?.butce_min || i0?.butce_max ? `₺${i0.butce_min ? Number(i0.butce_min).toLocaleString('tr-TR') : '?'} – ₺${i0.butce_max ? Number(i0.butce_max).toLocaleString('tr-TR') : '?'}` : ''; })()}
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
        <Text style={styles.eslesmeMusteriAd}>{[musteri?.ad, musteri?.soyad].filter(Boolean).join(' ')}</Text>
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
  bdFoto: { width: 48, height: 48, borderRadius: Radius.md },
  bdBaslik: { fontSize: 14, fontWeight: '600', color: Colors.onSurface },
  bdAlt: { fontSize: 12, color: Colors.onSurfaceVariant, marginTop: 2 },
  bdZaman: { fontSize: 11, color: Colors.outlineVariant, marginTop: 2 },
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
