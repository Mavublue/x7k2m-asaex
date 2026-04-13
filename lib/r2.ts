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

export async function optimizePhoto(key: string, isFirst = false): Promise<void> {
  const token = await getToken();
  fetch(`${MEDIA_SERVICE}/optimize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ key, isFirst }),
  }).catch(() => {});
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
