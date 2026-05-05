import { AsYouType, type CountryCode } from 'libphonenumber-js';

export interface TelefonKodu {
  kod: string;
  ulke: string;
  bayrak: string;
}

export const TELEFON_KODLARI: TelefonKodu[] = [
  { kod: '+90', ulke: 'Türkiye', bayrak: '🇹🇷' },
  { kod: '+93', ulke: 'Afganistan', bayrak: '🇦🇫' },
  { kod: '+355', ulke: 'Arnavutluk', bayrak: '🇦🇱' },
  { kod: '+213', ulke: 'Cezayir', bayrak: '🇩🇿' },
  { kod: '+1', ulke: 'ABD / Kanada', bayrak: '🇺🇸' },
  { kod: '+376', ulke: 'Andorra', bayrak: '🇦🇩' },
  { kod: '+244', ulke: 'Angola', bayrak: '🇦🇴' },
  { kod: '+1264', ulke: 'Anguilla', bayrak: '🇦🇮' },
  { kod: '+1268', ulke: 'Antigua ve Barbuda', bayrak: '🇦🇬' },
  { kod: '+54', ulke: 'Arjantin', bayrak: '🇦🇷' },
  { kod: '+374', ulke: 'Ermenistan', bayrak: '🇦🇲' },
  { kod: '+297', ulke: 'Aruba', bayrak: '🇦🇼' },
  { kod: '+61', ulke: 'Avustralya', bayrak: '🇦🇺' },
  { kod: '+43', ulke: 'Avusturya', bayrak: '🇦🇹' },
  { kod: '+994', ulke: 'Azerbaycan', bayrak: '🇦🇿' },
  { kod: '+1242', ulke: 'Bahamalar', bayrak: '🇧🇸' },
  { kod: '+973', ulke: 'Bahreyn', bayrak: '🇧🇭' },
  { kod: '+880', ulke: 'Bangladeş', bayrak: '🇧🇩' },
  { kod: '+1246', ulke: 'Barbados', bayrak: '🇧🇧' },
  { kod: '+375', ulke: 'Belarus', bayrak: '🇧🇾' },
  { kod: '+32', ulke: 'Belçika', bayrak: '🇧🇪' },
  { kod: '+501', ulke: 'Belize', bayrak: '🇧🇿' },
  { kod: '+229', ulke: 'Benin', bayrak: '🇧🇯' },
  { kod: '+1441', ulke: 'Bermuda', bayrak: '🇧🇲' },
  { kod: '+975', ulke: 'Bhutan', bayrak: '🇧🇹' },
  { kod: '+591', ulke: 'Bolivya', bayrak: '🇧🇴' },
  { kod: '+387', ulke: 'Bosna Hersek', bayrak: '🇧🇦' },
  { kod: '+267', ulke: 'Botsvana', bayrak: '🇧🇼' },
  { kod: '+55', ulke: 'Brezilya', bayrak: '🇧🇷' },
  { kod: '+673', ulke: 'Brunei', bayrak: '🇧🇳' },
  { kod: '+359', ulke: 'Bulgaristan', bayrak: '🇧🇬' },
  { kod: '+226', ulke: 'Burkina Faso', bayrak: '🇧🇫' },
  { kod: '+257', ulke: 'Burundi', bayrak: '🇧🇮' },
  { kod: '+855', ulke: 'Kamboçya', bayrak: '🇰🇭' },
  { kod: '+237', ulke: 'Kamerun', bayrak: '🇨🇲' },
  { kod: '+238', ulke: 'Cape Verde', bayrak: '🇨🇻' },
  { kod: '+1345', ulke: 'Cayman Adaları', bayrak: '🇰🇾' },
  { kod: '+236', ulke: 'Orta Afrika Cumh.', bayrak: '🇨🇫' },
  { kod: '+235', ulke: 'Çad', bayrak: '🇹🇩' },
  { kod: '+56', ulke: 'Şili', bayrak: '🇨🇱' },
  { kod: '+86', ulke: 'Çin', bayrak: '🇨🇳' },
  { kod: '+57', ulke: 'Kolombiya', bayrak: '🇨🇴' },
  { kod: '+269', ulke: 'Komorlar', bayrak: '🇰🇲' },
  { kod: '+242', ulke: 'Kongo', bayrak: '🇨🇬' },
  { kod: '+243', ulke: 'Kongo Demokratik Cumh.', bayrak: '🇨🇩' },
  { kod: '+682', ulke: 'Cook Adaları', bayrak: '🇨🇰' },
  { kod: '+506', ulke: 'Kosta Rika', bayrak: '🇨🇷' },
  { kod: '+385', ulke: 'Hırvatistan', bayrak: '🇭🇷' },
  { kod: '+53', ulke: 'Küba', bayrak: '🇨🇺' },
  { kod: '+599', ulke: 'Curaçao', bayrak: '🇨🇼' },
  { kod: '+357', ulke: 'Kıbrıs', bayrak: '🇨🇾' },
  { kod: '+420', ulke: 'Çek Cumh.', bayrak: '🇨🇿' },
  { kod: '+45', ulke: 'Danimarka', bayrak: '🇩🇰' },
  { kod: '+253', ulke: 'Cibuti', bayrak: '🇩🇯' },
  { kod: '+1767', ulke: 'Dominika', bayrak: '🇩🇲' },
  { kod: '+1809', ulke: 'Dominik Cumh.', bayrak: '🇩🇴' },
  { kod: '+593', ulke: 'Ekvador', bayrak: '🇪🇨' },
  { kod: '+20', ulke: 'Mısır', bayrak: '🇪🇬' },
  { kod: '+503', ulke: 'El Salvador', bayrak: '🇸🇻' },
  { kod: '+240', ulke: 'Ekvator Ginesi', bayrak: '🇬🇶' },
  { kod: '+291', ulke: 'Eritre', bayrak: '🇪🇷' },
  { kod: '+372', ulke: 'Estonya', bayrak: '🇪🇪' },
  { kod: '+251', ulke: 'Etiyopya', bayrak: '🇪🇹' },
  { kod: '+500', ulke: 'Falkland Adaları', bayrak: '🇫🇰' },
  { kod: '+298', ulke: 'Faroe Adaları', bayrak: '🇫🇴' },
  { kod: '+679', ulke: 'Fiji', bayrak: '🇫🇯' },
  { kod: '+358', ulke: 'Finlandiya', bayrak: '🇫🇮' },
  { kod: '+33', ulke: 'Fransa', bayrak: '🇫🇷' },
  { kod: '+594', ulke: 'Fransız Guyanası', bayrak: '🇬🇫' },
  { kod: '+689', ulke: 'Fransız Polinezyası', bayrak: '🇵🇫' },
  { kod: '+241', ulke: 'Gabon', bayrak: '🇬🇦' },
  { kod: '+220', ulke: 'Gambiya', bayrak: '🇬🇲' },
  { kod: '+995', ulke: 'Gürcistan', bayrak: '🇬🇪' },
  { kod: '+49', ulke: 'Almanya', bayrak: '🇩🇪' },
  { kod: '+233', ulke: 'Gana', bayrak: '🇬🇭' },
  { kod: '+350', ulke: 'Cebelitarık', bayrak: '🇬🇮' },
  { kod: '+30', ulke: 'Yunanistan', bayrak: '🇬🇷' },
  { kod: '+299', ulke: 'Grönland', bayrak: '🇬🇱' },
  { kod: '+1473', ulke: 'Grenada', bayrak: '🇬🇩' },
  { kod: '+590', ulke: 'Guadalupe', bayrak: '🇬🇵' },
  { kod: '+1671', ulke: 'Guam', bayrak: '🇬🇺' },
  { kod: '+502', ulke: 'Guatemala', bayrak: '🇬🇹' },
  { kod: '+44', ulke: 'Birleşik Krallık', bayrak: '🇬🇧' },
  { kod: '+224', ulke: 'Gine', bayrak: '🇬🇳' },
  { kod: '+245', ulke: 'Gine-Bissau', bayrak: '🇬🇼' },
  { kod: '+592', ulke: 'Guyana', bayrak: '🇬🇾' },
  { kod: '+509', ulke: 'Haiti', bayrak: '🇭🇹' },
  { kod: '+504', ulke: 'Honduras', bayrak: '🇭🇳' },
  { kod: '+852', ulke: 'Hong Kong', bayrak: '🇭🇰' },
  { kod: '+36', ulke: 'Macaristan', bayrak: '🇭🇺' },
  { kod: '+354', ulke: 'İzlanda', bayrak: '🇮🇸' },
  { kod: '+91', ulke: 'Hindistan', bayrak: '🇮🇳' },
  { kod: '+62', ulke: 'Endonezya', bayrak: '🇮🇩' },
  { kod: '+98', ulke: 'İran', bayrak: '🇮🇷' },
  { kod: '+964', ulke: 'Irak', bayrak: '🇮🇶' },
  { kod: '+353', ulke: 'İrlanda', bayrak: '🇮🇪' },
  { kod: '+972', ulke: 'İsrail', bayrak: '🇮🇱' },
  { kod: '+39', ulke: 'İtalya', bayrak: '🇮🇹' },
  { kod: '+225', ulke: 'Fildişi Sahili', bayrak: '🇨🇮' },
  { kod: '+1876', ulke: 'Jamaika', bayrak: '🇯🇲' },
  { kod: '+81', ulke: 'Japonya', bayrak: '🇯🇵' },
  { kod: '+962', ulke: 'Ürdün', bayrak: '🇯🇴' },
  { kod: '+7', ulke: 'Rusya / Kazakistan', bayrak: '🇷🇺' },
  { kod: '+254', ulke: 'Kenya', bayrak: '🇰🇪' },
  { kod: '+686', ulke: 'Kiribati', bayrak: '🇰🇮' },
  { kod: '+850', ulke: 'Kuzey Kore', bayrak: '🇰🇵' },
  { kod: '+82', ulke: 'Güney Kore', bayrak: '🇰🇷' },
  { kod: '+383', ulke: 'Kosova', bayrak: '🇽🇰' },
  { kod: '+965', ulke: 'Kuveyt', bayrak: '🇰🇼' },
  { kod: '+996', ulke: 'Kırgızistan', bayrak: '🇰🇬' },
  { kod: '+856', ulke: 'Laos', bayrak: '🇱🇦' },
  { kod: '+371', ulke: 'Letonya', bayrak: '🇱🇻' },
  { kod: '+961', ulke: 'Lübnan', bayrak: '🇱🇧' },
  { kod: '+266', ulke: 'Lesoto', bayrak: '🇱🇸' },
  { kod: '+231', ulke: 'Liberya', bayrak: '🇱🇷' },
  { kod: '+218', ulke: 'Libya', bayrak: '🇱🇾' },
  { kod: '+423', ulke: 'Liechtenstein', bayrak: '🇱🇮' },
  { kod: '+370', ulke: 'Litvanya', bayrak: '🇱🇹' },
  { kod: '+352', ulke: 'Lüksemburg', bayrak: '🇱🇺' },
  { kod: '+853', ulke: 'Makao', bayrak: '🇲🇴' },
  { kod: '+389', ulke: 'Kuzey Makedonya', bayrak: '🇲🇰' },
  { kod: '+261', ulke: 'Madagaskar', bayrak: '🇲🇬' },
  { kod: '+265', ulke: 'Malavi', bayrak: '🇲🇼' },
  { kod: '+60', ulke: 'Malezya', bayrak: '🇲🇾' },
  { kod: '+960', ulke: 'Maldivler', bayrak: '🇲🇻' },
  { kod: '+223', ulke: 'Mali', bayrak: '🇲🇱' },
  { kod: '+356', ulke: 'Malta', bayrak: '🇲🇹' },
  { kod: '+692', ulke: 'Marshall Adaları', bayrak: '🇲🇭' },
  { kod: '+596', ulke: 'Martinik', bayrak: '🇲🇶' },
  { kod: '+222', ulke: 'Moritanya', bayrak: '🇲🇷' },
  { kod: '+230', ulke: 'Mauritius', bayrak: '🇲🇺' },
  { kod: '+262', ulke: 'Mayotte / Réunion', bayrak: '🇾🇹' },
  { kod: '+52', ulke: 'Meksika', bayrak: '🇲🇽' },
  { kod: '+691', ulke: 'Mikronezya', bayrak: '🇫🇲' },
  { kod: '+373', ulke: 'Moldova', bayrak: '🇲🇩' },
  { kod: '+377', ulke: 'Monako', bayrak: '🇲🇨' },
  { kod: '+976', ulke: 'Moğolistan', bayrak: '🇲🇳' },
  { kod: '+382', ulke: 'Karadağ', bayrak: '🇲🇪' },
  { kod: '+1664', ulke: 'Montserrat', bayrak: '🇲🇸' },
  { kod: '+212', ulke: 'Fas', bayrak: '🇲🇦' },
  { kod: '+258', ulke: 'Mozambik', bayrak: '🇲🇿' },
  { kod: '+95', ulke: 'Myanmar', bayrak: '🇲🇲' },
  { kod: '+264', ulke: 'Namibya', bayrak: '🇳🇦' },
  { kod: '+674', ulke: 'Nauru', bayrak: '🇳🇷' },
  { kod: '+977', ulke: 'Nepal', bayrak: '🇳🇵' },
  { kod: '+31', ulke: 'Hollanda', bayrak: '🇳🇱' },
  { kod: '+687', ulke: 'Yeni Kaledonya', bayrak: '🇳🇨' },
  { kod: '+64', ulke: 'Yeni Zelanda', bayrak: '🇳🇿' },
  { kod: '+505', ulke: 'Nikaragua', bayrak: '🇳🇮' },
  { kod: '+227', ulke: 'Nijer', bayrak: '🇳🇪' },
  { kod: '+234', ulke: 'Nijerya', bayrak: '🇳🇬' },
  { kod: '+683', ulke: 'Niue', bayrak: '🇳🇺' },
  { kod: '+47', ulke: 'Norveç', bayrak: '🇳🇴' },
  { kod: '+968', ulke: 'Umman', bayrak: '🇴🇲' },
  { kod: '+92', ulke: 'Pakistan', bayrak: '🇵🇰' },
  { kod: '+680', ulke: 'Palau', bayrak: '🇵🇼' },
  { kod: '+970', ulke: 'Filistin', bayrak: '🇵🇸' },
  { kod: '+507', ulke: 'Panama', bayrak: '🇵🇦' },
  { kod: '+675', ulke: 'Papua Yeni Gine', bayrak: '🇵🇬' },
  { kod: '+595', ulke: 'Paraguay', bayrak: '🇵🇾' },
  { kod: '+51', ulke: 'Peru', bayrak: '🇵🇪' },
  { kod: '+63', ulke: 'Filipinler', bayrak: '🇵🇭' },
  { kod: '+48', ulke: 'Polonya', bayrak: '🇵🇱' },
  { kod: '+351', ulke: 'Portekiz', bayrak: '🇵🇹' },
  { kod: '+1787', ulke: 'Porto Riko', bayrak: '🇵🇷' },
  { kod: '+974', ulke: 'Katar', bayrak: '🇶🇦' },
  { kod: '+40', ulke: 'Romanya', bayrak: '🇷🇴' },
  { kod: '+250', ulke: 'Ruanda', bayrak: '🇷🇼' },
  { kod: '+1869', ulke: 'Saint Kitts ve Nevis', bayrak: '🇰🇳' },
  { kod: '+1758', ulke: 'Saint Lucia', bayrak: '🇱🇨' },
  { kod: '+1784', ulke: 'Saint Vincent', bayrak: '🇻🇨' },
  { kod: '+685', ulke: 'Samoa', bayrak: '🇼🇸' },
  { kod: '+378', ulke: 'San Marino', bayrak: '🇸🇲' },
  { kod: '+239', ulke: 'São Tomé', bayrak: '🇸🇹' },
  { kod: '+966', ulke: 'Suudi Arabistan', bayrak: '🇸🇦' },
  { kod: '+221', ulke: 'Senegal', bayrak: '🇸🇳' },
  { kod: '+381', ulke: 'Sırbistan', bayrak: '🇷🇸' },
  { kod: '+248', ulke: 'Seyşeller', bayrak: '🇸🇨' },
  { kod: '+232', ulke: 'Sierra Leone', bayrak: '🇸🇱' },
  { kod: '+65', ulke: 'Singapur', bayrak: '🇸🇬' },
  { kod: '+421', ulke: 'Slovakya', bayrak: '🇸🇰' },
  { kod: '+386', ulke: 'Slovenya', bayrak: '🇸🇮' },
  { kod: '+677', ulke: 'Solomon Adaları', bayrak: '🇸🇧' },
  { kod: '+252', ulke: 'Somali', bayrak: '🇸🇴' },
  { kod: '+27', ulke: 'Güney Afrika', bayrak: '🇿🇦' },
  { kod: '+211', ulke: 'Güney Sudan', bayrak: '🇸🇸' },
  { kod: '+34', ulke: 'İspanya', bayrak: '🇪🇸' },
  { kod: '+94', ulke: 'Sri Lanka', bayrak: '🇱🇰' },
  { kod: '+249', ulke: 'Sudan', bayrak: '🇸🇩' },
  { kod: '+597', ulke: 'Surinam', bayrak: '🇸🇷' },
  { kod: '+268', ulke: 'Esvatini', bayrak: '🇸🇿' },
  { kod: '+46', ulke: 'İsveç', bayrak: '🇸🇪' },
  { kod: '+41', ulke: 'İsviçre', bayrak: '🇨🇭' },
  { kod: '+963', ulke: 'Suriye', bayrak: '🇸🇾' },
  { kod: '+886', ulke: 'Tayvan', bayrak: '🇹🇼' },
  { kod: '+992', ulke: 'Tacikistan', bayrak: '🇹🇯' },
  { kod: '+255', ulke: 'Tanzanya', bayrak: '🇹🇿' },
  { kod: '+66', ulke: 'Tayland', bayrak: '🇹🇭' },
  { kod: '+670', ulke: 'Doğu Timor', bayrak: '🇹🇱' },
  { kod: '+228', ulke: 'Togo', bayrak: '🇹🇬' },
  { kod: '+676', ulke: 'Tonga', bayrak: '🇹🇴' },
  { kod: '+1868', ulke: 'Trinidad ve Tobago', bayrak: '🇹🇹' },
  { kod: '+216', ulke: 'Tunus', bayrak: '🇹🇳' },
  { kod: '+993', ulke: 'Türkmenistan', bayrak: '🇹🇲' },
  { kod: '+1649', ulke: 'Turks ve Caicos', bayrak: '🇹🇨' },
  { kod: '+688', ulke: 'Tuvalu', bayrak: '🇹🇻' },
  { kod: '+256', ulke: 'Uganda', bayrak: '🇺🇬' },
  { kod: '+380', ulke: 'Ukrayna', bayrak: '🇺🇦' },
  { kod: '+971', ulke: 'BAE', bayrak: '🇦🇪' },
  { kod: '+598', ulke: 'Uruguay', bayrak: '🇺🇾' },
  { kod: '+998', ulke: 'Özbekistan', bayrak: '🇺🇿' },
  { kod: '+678', ulke: 'Vanuatu', bayrak: '🇻🇺' },
  { kod: '+379', ulke: 'Vatikan', bayrak: '🇻🇦' },
  { kod: '+58', ulke: 'Venezuela', bayrak: '🇻🇪' },
  { kod: '+84', ulke: 'Vietnam', bayrak: '🇻🇳' },
  { kod: '+1284', ulke: 'BVI', bayrak: '🇻🇬' },
  { kod: '+967', ulke: 'Yemen', bayrak: '🇾🇪' },
  { kod: '+260', ulke: 'Zambiya', bayrak: '🇿🇲' },
  { kod: '+263', ulke: 'Zimbabve', bayrak: '🇿🇼' },
];

const SORTED_KODLAR = [...TELEFON_KODLARI.slice(1)].sort((a, b) => a.ulke.localeCompare(b.ulke, 'tr'));
export const TELEFON_KODLARI_SIRALI: TelefonKodu[] = [TELEFON_KODLARI[0], ...SORTED_KODLAR];

export const VARSAYILAN_TELEFON_KODU = '+90';

export function bulKod(kod: string): TelefonKodu {
  return TELEFON_KODLARI.find(t => t.kod === kod) ?? TELEFON_KODLARI[0];
}

export function bayrakToIso(bayrak: string): string {
  try {
    const cps = [...bayrak].map(c => c.codePointAt(0) ?? 0);
    if (cps.length !== 2) return '';
    const a = cps[0] - 0x1F1E6;
    const b = cps[1] - 0x1F1E6;
    if (a < 0 || a > 25 || b < 0 || b > 25) return '';
    return String.fromCharCode(65 + a, 65 + b).toLowerCase();
  } catch { return ''; }
}

export function ayirTelefon(tam: string | null | undefined, varsayilan: string = VARSAYILAN_TELEFON_KODU): { kod: string; numara: string } {
  if (!tam) return { kod: varsayilan, numara: '' };
  const trimmed = tam.trim();
  if (!trimmed.startsWith('+')) return { kod: varsayilan, numara: trimmed.replace(/^0/, '') };
  const sirali = [...TELEFON_KODLARI].sort((a, b) => b.kod.length - a.kod.length);
  for (const t of sirali) {
    if (trimmed.startsWith(t.kod)) {
      return { kod: t.kod, numara: trimmed.slice(t.kod.length).trim() };
    }
  }
  return { kod: varsayilan, numara: trimmed };
}

export function birlestirTelefon(kod: string, numara: string): string | null {
  const temiz = numara.replace(/\D/g, '');
  if (!temiz) return null;
  return kod + temiz;
}

export function formatNumara(kod: string, numara: string): string {
  const temiz = numara.replace(/\D/g, '');
  if (!temiz) return '';
  const iso = bayrakToIso(bulKod(kod).bayrak).toUpperCase();
  if (!iso) return temiz;
  try {
    const f = new AsYouType(iso as CountryCode);
    const out = f.input(temiz);
    return out || temiz;
  } catch { return temiz; }
}
