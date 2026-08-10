import { supabase } from './supabase';

const MEDIA_SERVICE = process.env.EXPO_PUBLIC_MEDIA_SERVICE_URL!;

async function getToken(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Oturum yok');
  return session.access_token;
}

export async function getUploadUrl(ilanId: string, dosyaAdi: string, mimeType: string): Promise<{ uploadUrl: string; key: string }> {
  const token = await getToken();
  const res = await fetch(`${MEDIA_SERVICE}/upload-url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ ilanId, dosyaAdi, mimeType }),
  });
  if (!res.ok) throw new Error('Upload URL alınamadı');
  return res.json();
}

export async function uploadToR2(key: string, body: Uint8Array, contentType: string): Promise<string> {
  throw new Error('Direkt R2 upload kaldırıldı, getUploadUrl kullan');
}

// watermarkText çağıran tarafça bir kez çözülüp verilir. Her foto için ayrı profil
// sorgusu YAPMA — biri null/hata dönerse o foto watermark'sız kalıp müşteride siyah
// gözüküyordu. Verilmezse (tek foto) profilden çeker.
export async function optimizePhoto(
  key: string,
  isFirst = false,
  watermarkText?: string | null,
): Promise<void> {
  const token = await getToken();
  let wm = watermarkText;
  if (wm === undefined) {
    const { data: { user } } = await supabase.auth.getUser();
    wm = null;
    if (user) {
      const { data } = await supabase.from('profiller').select('watermark_text').eq('id', user.id).single();
      wm = data?.watermark_text ?? null;
    }
  }
  const res = await fetch(`${MEDIA_SERVICE}/optimize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ key, isFirst, ...(wm ? { watermarkText: wm } : {}) }),
  });
  // Sessiz başarısızlık = yarım varyant (_wm eksik) = müşteride siyah foto.
  if (!res.ok) throw new Error(`Foto işlenemedi (optimize ${res.status})`);
}

// Kullanıcının watermark metnini bir kez çözer (toplu yüklemede tekrar tekrar
// sorgulamamak için). Çağıran sonucu tüm fotolar için optimizePhoto'ya geçirmeli.
export async function getWatermarkText(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase.from('profiller').select('watermark_text').eq('id', user.id).single();
  if (error) throw error;
  return data?.watermark_text ?? null;
}

export async function copyIlanFiles(sourceIlanId: string, targetIlanId: string, fotograflar: string[]): Promise<string[]> {
  const token = await getToken();
  const res = await fetch(`${MEDIA_SERVICE}/copy-ilan-files`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ sourceIlanId, targetIlanId, fotograflar }),
  });
  if (!res.ok) throw new Error('Kopyalama başarısız');
  const data = await res.json();
  return data.fotograflar;
}

export async function deleteFile(key: string): Promise<void> {
  const token = await getToken();
  await fetch(`${MEDIA_SERVICE}/delete-file`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ key }),
  });
}

export async function deleteIlanPhotos(ilanId: string): Promise<void> {
  const token = await getToken();
  await fetch(`${MEDIA_SERVICE}/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ ilanId }),
  });
}

export async function getPresignedUrl(urlOrKey: string, expiresIn = 3600): Promise<string> {
  const token = await getToken();
  const res = await fetch(`${MEDIA_SERVICE}/presigned-url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ key: urlOrKey, expiresIn }),
  });
  if (!res.ok) throw new Error('Presigned URL alınamadı');
  const data = await res.json();
  return data.url;
}

export function extractKey(urlOrKey: string): string {
  return urlOrKey;
}

export async function deleteFromR2(keys: string[]): Promise<void> {
  // Artık deleteIlanPhotos kullanılıyor
}
