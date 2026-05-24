import type { Ilan } from '../types';

export interface SosyalProfil {
  ad?: string | null;
  soyad?: string | null;
  telefon?: string | null;
  sosyal_medya_sablonu?: string | null;
}

const KATEGORI_EMOJI: Record<string, string> = {
  Villa: '🏡', Daire: '🏢', Arsa: '🌿', Tarla: '🌾',
  'İşyeri': '🏬', 'Müstakil Ev': '🏠', Otel: '🏨',
};

export const DEFAULT_SOSYAL_SABLON = `{{kategori_emoji}} {{baslik}}

💰 {{fiyat}} ₺

{{contact_block}}

✅ {{lokasyon}}'DA
✅ {{oda}}
✅ {{metrekare}} NET M²
✅ {{brut_metrekare}} BRÜT M²
✅ {{bina_yasi}} YAŞINDA
✅ {{kat_sayisi}} KATLI
✅ {{bulundugu_kat}}. KAT
✅ {{banyo_sayisi}} BANYO
{{ozellikler}}`;

export interface PlaceholderInfo { key: string; label: string; }

export const PLACEHOLDERS: PlaceholderInfo[] = [
  { key: 'baslik', label: 'İlan başlığı' },
  { key: 'fiyat', label: 'Fiyat (formatlı)' },
  { key: 'kategori_emoji', label: 'Kategori emoji' },
  { key: 'lokasyon', label: 'Mahalle / İlçe / Şehir' },
  { key: 'oda', label: 'Oda sayısı' },
  { key: 'metrekare', label: 'Net m²' },
  { key: 'brut_metrekare', label: 'Brüt m²' },
  { key: 'bina_yasi', label: 'Bina yaşı' },
  { key: 'kat_sayisi', label: 'Kat sayısı' },
  { key: 'bulundugu_kat', label: 'Bulunduğu kat' },
  { key: 'banyo_sayisi', label: 'Banyo sayısı' },
  { key: 'ozellikler', label: 'Özellikler listesi' },
  { key: 'ad_soyad', label: 'Emlakçı ad-soyad' },
  { key: 'telefon', label: 'Telefon' },
  { key: 'wa_link', label: 'WhatsApp linki' },
  { key: 'contact_block', label: 'İletişim bloğu' },
];

export function renderSosyalMetin(ilan: Ilan, ozellikAdlari: string[], profil: SosyalProfil | null): string {
  const template = profil?.sosyal_medya_sablonu?.trim() || DEFAULT_SOSYAL_SABLON;
  return applyTemplate(template, buildData(ilan, ozellikAdlari, profil));
}

function buildData(ilan: Ilan, ozellikAdlari: string[], profil: SosyalProfil | null): Record<string, string> {
  const lokasyon = [ilan.mahalle, ilan.ilce, ilan.konum].filter(Boolean).join(' / ').toUpperCase();
  const adSoyad = [profil?.ad, profil?.soyad].filter(Boolean).join(' ').trim();
  const telefon = profil?.telefon ?? '';
  const waNum = telefon.replace(/\D/g, '');
  const waLink = waNum ? `https://wa.me/${waNum}?text=Merhaba` : '';
  const ozelliklerBlock = ozellikAdlari.length
    ? ozellikAdlari.map(o => `✅ ${o.toUpperCase()}`).join('\n')
    : '';
  const contactBlock = telefon
    ? `📞 Tek tıkla mesaj gönder:\n${waLink}\n\n📱 ${telefon}${adSoyad ? `\n👤 ${adSoyad}` : ''}`
    : '';
  return {
    kategori_emoji: KATEGORI_EMOJI[ilan.kategori] ?? '🏠',
    baslik: ilan.baslik ?? '',
    fiyat: Number(ilan.fiyat).toLocaleString('tr-TR'),
    lokasyon,
    oda: ilan.oda_sayisi ?? '',
    metrekare: ilan.metrekare ? String(ilan.metrekare) : '',
    brut_metrekare: ilan.brut_metrekare ? String(ilan.brut_metrekare) : '',
    bina_yasi: ilan.bina_yasi ?? '',
    kat_sayisi: ilan.kat_sayisi ?? '',
    bulundugu_kat: ilan.bulundugu_kat ?? '',
    banyo_sayisi: ilan.banyo_sayisi ? String(ilan.banyo_sayisi) : '',
    ozellikler: ozelliklerBlock,
    ad_soyad: adSoyad,
    telefon,
    wa_link: waLink,
    contact_block: contactBlock,
  };
}

function applyTemplate(template: string, data: Record<string, string>): string {
  let result = template;
  result = result.replace(/\{\{contact_block\}\}/g, data.contact_block ?? '');
  result = result.replace(/\{\{ozellikler\}\}/g, data.ozellikler ?? '');
  const lines = result.split('\n');
  const out: string[] = [];
  for (const line of lines) {
    const matches = [...line.matchAll(/\{\{(\w+)\}\}/g)];
    if (matches.length === 0) { out.push(line); continue; }
    let processed = line;
    let hasNonEmpty = false;
    for (const m of matches) {
      const val = data[m[1]] ?? '';
      if (val.trim() !== '') hasNonEmpty = true;
      processed = processed.replace(m[0], val);
    }
    if (hasNonEmpty) out.push(processed);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
