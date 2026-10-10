import { supabase } from './supabase';

const MEDIA_SERVICE = process.env.EXPO_PUBLIC_MEDIA_SERVICE_URL!;
const R2_BASE = process.env.EXPO_PUBLIC_R2_PUBLIC_URL!;

// "Kırp" — senkron, worker yok (web ile aynı API). crop: 0..1 oranları.
export interface Crop { x: number; y: number; w: number; h: number }

const keyBaseOf = (k: string) => { const i = k.lastIndexOf('.'); return i === -1 ? k : k.slice(0, i); };
export const kirpOncesiUrl = (fotoKey: string) => `${R2_BASE}/${keyBaseOf(fotoKey)}_lg.jpg`;

async function token(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Oturum yok');
  return session.access_token;
}

export async function kirpUygula(ilanId: string, fotoKey: string, crop: Crop): Promise<string> {
  const res = await fetch(`${MEDIA_SERVICE}/kirp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}` },
    body: JSON.stringify({ ilanId, fotoKey, crop }),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({} as any));
    throw new Error(j.error || `Kırpılamadı (${res.status})`);
  }
  const j = await res.json();
  return j.yeniKey as string;
}
