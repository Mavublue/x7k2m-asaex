import { supabase } from './supabase';

const MEDIA_SERVICE = process.env.EXPO_PUBLIC_MEDIA_SERVICE_URL!;
const R2_BASE = process.env.EXPO_PUBLIC_R2_PUBLIC_URL!;
const ALLOWED = (process.env.EXPO_PUBLIC_WATERMARK_ALLOWED_EMAILS || 'yasin.35.94@hotmail.com')
  .split(',').map((e: string) => e.trim().toLowerCase()).filter(Boolean);

export type FiligranDurum = 'bekliyor' | 'isleniyor' | 'hazir' | 'onaylandi' | 'reddedildi' | 'hata';
export interface FiligranRow {
  id: string;
  foto_key: string;
  durum: FiligranDurum;
  temiz_key: string | null;
  hata: string | null;
}

export function watermarkYetkili(email?: string | null): boolean {
  return ALLOWED.includes(String(email || '').toLowerCase());
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

export async function filigranBaslat(ilanId: string, fotoKeys: string[]): Promise<number> {
  const res = await fetch(`${MEDIA_SERVICE}/filigran/baslat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}` },
    body: JSON.stringify({ ilanId, fotoKeys }),
  });
  if (!res.ok && res.status !== 202) throw new Error('Başlatılamadı');
  const j = await res.json().catch(() => ({}));
  return j.eklenen ?? 0;
}

export async function filigranDurum(ilanId: string): Promise<FiligranRow[]> {
  const res = await fetch(`${MEDIA_SERVICE}/filigran/durum?ilanId=${encodeURIComponent(ilanId)}`, {
    headers: { Authorization: `Bearer ${await token()}` },
  });
  if (!res.ok) throw new Error('Durum alınamadı');
  const j = await res.json();
  return j.rows ?? [];
}

export async function filigranOnayla(id: string): Promise<void> {
  const res = await fetch(`${MEDIA_SERVICE}/filigran/onayla`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}` },
    body: JSON.stringify({ id }),
  });
  if (!res.ok) throw new Error('Onaylanamadı');
}

export async function filigranReddet(id: string): Promise<void> {
  const res = await fetch(`${MEDIA_SERVICE}/filigran/reddet`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}` },
    body: JSON.stringify({ id }),
  });
  if (!res.ok) throw new Error('Reddedilemedi');
}
