import { supabase } from './supabase';

const NOMINATIM = 'https://nominatim.openstreetmap.org';
const CONTACT_EMAIL = 'yasin.35.94@hotmail.com';

function normalizeTr(s: string): string {
  return (s ?? '')
    .toLocaleLowerCase('tr')
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/mah\.?|mahallesi|mahalle|köyü|koyu|köy|koy/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

export interface GeocodeResult {
  lat: number;
  lng: number;
  bbox?: [number, number, number, number];
  displayName: string;
}

async function cacheGet(il: string, ilce: string, mahalle: string): Promise<GeocodeResult | null> {
  try {
    const { data } = await supabase
      .from('mahalle_koordinatlari')
      .select('lat, lng, bbox, display_name')
      .eq('il', il)
      .eq('ilce', ilce)
      .eq('mahalle', mahalle)
      .maybeSingle();
    if (!data) return null;
    const bbox = Array.isArray(data.bbox) && data.bbox.length === 4
      ? (data.bbox as [number, number, number, number])
      : undefined;
    return { lat: data.lat, lng: data.lng, bbox, displayName: data.display_name ?? '' };
  } catch {
    return null;
  }
}

async function cacheSet(il: string, ilce: string, mahalle: string, r: GeocodeResult): Promise<void> {
  try {
    await supabase.from('mahalle_koordinatlari').insert({
      il, ilce, mahalle,
      lat: r.lat, lng: r.lng,
      bbox: r.bbox ?? null,
      display_name: r.displayName,
    });
  } catch {}
}

export async function forwardGeocode(
  il?: string,
  ilce?: string,
  mahalle?: string
): Promise<GeocodeResult | null> {
  const parts = [mahalle, ilce, il, 'Türkiye'].filter(Boolean).join(', ');
  if (!parts) return null;

  const kIl = il ?? '';
  const kIlce = ilce ?? '';
  const kMahalle = mahalle ?? '';
  const cached = await cacheGet(kIl, kIlce, kMahalle);
  if (cached) return cached;

  try {
    const url = `${NOMINATIM}/search?format=json&q=${encodeURIComponent(parts)}&limit=1&countrycodes=tr&email=${CONTACT_EMAIL}`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;
    const r = data[0];
    const lat = parseFloat(r.lat);
    const lng = parseFloat(r.lon);
    if (isNaN(lat) || isNaN(lng)) return null;
    let bbox: [number, number, number, number] | undefined;
    if (Array.isArray(r.boundingbox) && r.boundingbox.length === 4) {
      const [s, n, w, e] = r.boundingbox.map((v: string) => parseFloat(v));
      if ([s, n, w, e].every(v => !isNaN(v))) bbox = [s, n, w, e];
    }
    const result: GeocodeResult = { lat, lng, bbox, displayName: r.display_name ?? '' };
    cacheSet(kIl, kIlce, kMahalle, result);
    return result;
  } catch {
    return null;
  }
}

export interface ReverseResult {
  il?: string;
  ilce?: string;
  mahalle?: string;
  displayName: string;
}

export async function reverseGeocode(lat: number, lng: number): Promise<ReverseResult | null> {
  try {
    const url = `${NOMINATIM}/reverse?format=json&lat=${lat}&lon=${lng}&zoom=14&addressdetails=1&accept-language=tr&email=${CONTACT_EMAIL}`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const data = await res.json();
    const a = data?.address ?? {};
    return {
      il: a.province ?? a.state ?? a.city,
      ilce: a.county ?? a.town ?? a.district,
      mahalle: a.suburb ?? a.neighbourhood ?? a.village ?? a.hamlet ?? a.quarter,
      displayName: data?.display_name ?? '',
    };
  } catch {
    return null;
  }
}

export interface MatchCheck {
  ok: boolean;
  seenMahalle?: string;
  seenIlce?: string;
  displayName: string;
}

export async function verifyLocation(
  lat: number,
  lng: number,
  expectedIlce?: string,
  expectedMahalle?: string
): Promise<MatchCheck | null> {
  const r = await reverseGeocode(lat, lng);
  if (!r) return null;
  const nMah = normalizeTr(expectedMahalle ?? '');
  const nIlce = normalizeTr(expectedIlce ?? '');
  const sMah = normalizeTr(r.mahalle ?? '');
  const sIlce = normalizeTr(r.ilce ?? '');
  const mahOk = nMah ? sMah.includes(nMah) || nMah.includes(sMah) : true;
  const ilceOk = nIlce ? sIlce.includes(nIlce) || nIlce.includes(sIlce) : true;
  return {
    ok: mahOk && ilceOk,
    seenMahalle: r.mahalle,
    seenIlce: r.ilce,
    displayName: r.displayName,
  };
}
