// Paylaş modallarındaki müşteri listesi: ad soyad A→Z, aynı isimde # etiket büyük olan üstte
type SiralanabilirMusteri = { ad: string | null; soyad: string | null; etiketler: string | null };

function etiketNo(e: string | null): number {
  const n = parseInt((e ?? '').split(',')[0].replace('#', '').trim(), 10);
  return isNaN(n) ? -1 : n;
}

export function musteriSirala<T extends SiralanabilirMusteri>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    const isim = `${a.ad ?? ''} ${a.soyad ?? ''}`.trim().localeCompare(`${b.ad ?? ''} ${b.soyad ?? ''}`.trim(), 'tr', { sensitivity: 'base' });
    return isim !== 0 ? isim : etiketNo(b.etiketler) - etiketNo(a.etiketler);
  });
}
