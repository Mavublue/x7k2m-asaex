import { supabase } from './supabase';

const MEDIA_SERVICE = process.env.EXPO_PUBLIC_MEDIA_SERVICE_URL!;
const R2_BASE = process.env.EXPO_PUBLIC_R2_PUBLIC_URL!;

// "Maske ile Sil" — filigrandan bağımsız serbest-maske inpaint (web ile aynı API).
export type MaskeDurum = 'bekliyor' | 'isleniyor' | 'hazir' | 'onaylandi' | 'reddedildi' | 'hata';
export interface MaskeRow {
  id: string;
  foto_key: string;
  durum: MaskeDurum;
  temiz_key: string | null;
  hata: string | null;
}

const keyBaseOf = (k: string) => { const i = k.lastIndexOf('.'); return i === -1 ? k : k.slice(0, i); };
export const thumbUrl = (fotoKey: string) => `${R2_BASE}/${keyBaseOf(fotoKey)}_sm.jpg`;
export const oncesiUrl = (fotoKey: string) => `${R2_BASE}/${keyBaseOf(fotoKey)}_lg.jpg`;
export const sonrasiUrl = (temizKey: string) => `${R2_BASE}/${temizKey}`;

async function token(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Oturum yok');
  return session.access_token;
}

// maskDataUrl: WebView canvas.toDataURL('image/png'). data: URL → blob → raw PNG gövde.
export async function maskeBaslat(ilanId: string, fotoKey: string, maskDataUrl: string): Promise<string> {
  const blob = await (await fetch(maskDataUrl)).blob();
  const qs = `ilanId=${encodeURIComponent(ilanId)}&fotoKey=${encodeURIComponent(fotoKey)}`;
  const res = await fetch(`${MEDIA_SERVICE}/maske/baslat?${qs}`, {
    method: 'POST',
    headers: { 'Content-Type': 'image/png', Authorization: `Bearer ${await token()}` },
    body: blob,
  });
  if (!res.ok && res.status !== 202) {
    const j = await res.json().catch(() => ({} as any));
    throw new Error(j.error || 'Başlatılamadı');
  }
  const j = await res.json().catch(() => ({} as any));
  return j.id as string;
}

export async function maskeDurum(ilanId: string): Promise<MaskeRow[]> {
  const res = await fetch(`${MEDIA_SERVICE}/maske/durum?ilanId=${encodeURIComponent(ilanId)}`, {
    headers: { Authorization: `Bearer ${await token()}` },
  });
  if (!res.ok) throw new Error('Durum alınamadı');
  const j = await res.json();
  return j.rows ?? [];
}

export async function maskeOnayla(id: string): Promise<void> {
  const res = await fetch(`${MEDIA_SERVICE}/maske/onayla`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}` },
    body: JSON.stringify({ id }),
  });
  if (!res.ok) throw new Error('Onaylanamadı');
}

export async function maskeReddet(id: string): Promise<void> {
  const res = await fetch(`${MEDIA_SERVICE}/maske/reddet`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}` },
    body: JSON.stringify({ id }),
  });
  if (!res.ok) throw new Error('Reddedilemedi');
}
