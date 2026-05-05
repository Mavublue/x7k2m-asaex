export interface Ilan {
  id: string;
  baslik: string;
  fiyat: number;
  konum: string;
  ilce: string | null;
  mahalle: string | null;
  metrekare: number | null;
  oda_sayisi: string | null;
  tip: 'Satılık' | 'Kiralık';
  durum?: 'Aktif' | 'İptal';
  kategori: 'Daire' | 'Villa' | 'Arsa' | 'Tarla' | 'İşyeri' | 'Otel';
  musteri_gizle?: boolean | null;
  aciklama: string | null;
  musteri_aciklamasi: string | null;
  bina_yasi: string | null;
  brut_metrekare: number | null;
  banyo_sayisi: number | null;
  kat_sayisi: string | null;
  bulundugu_kat: string | null;
  fotograflar: string[] | null;
  gizli_fotograflar: string[] | null;
  lat: number | null;
  lng: number | null;
  musteri_lat: number | null;
  musteri_lng: number | null;
  portfoy_no: string | null;
  ozellikler: string | null;
  olusturma_tarihi: string;
}

export interface Musteri {
  id: string;
  ad: string;
  soyad: string;
  telefon: string | null;
  email: string | null;
  butce_min: number | null;
  butce_max: number | null;
  tercih_konum: string | null;
  notlar: string | null;
  etiketler: string | null;
  bina_yasi: string | null;
  avatar_url: string | null;
  durum: 'Aktif' | 'Beklemede' | 'İptal';
  olusturma_tarihi: string;
}

export interface MusteriIletisim {
  id: string;
  musteri_id: string;
  ad: string;
  telefon: string | null;
  tip: string | null;
  sira: number;
  olusturma_tarihi: string;
}

export interface Eslesme {
  id: string;
  musteri_id: string;
  ilan_id: string;
  durum: 'Yeni' | 'İletişimde' | 'Görüşüldü' | 'Tamamlandı';
  olusturma_tarihi: string;
  musteri?: Musteri;
  ilan?: Ilan;
}
