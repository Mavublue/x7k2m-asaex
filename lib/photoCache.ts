import * as FileSystem from 'expo-file-system/legacy';
import { getPresignedUrl } from './r2';

const CACHE_DIR = FileSystem.cacheDirectory + 'r2photos/';
const META_FILE = CACHE_DIR + '_meta.json';
const MAX_SIZE = 500 * 1024 * 1024; // 500 MB

type PhotoMeta = { localPath: string; lastAccessed: number; size: number };
type CacheMeta = Record<string, PhotoMeta>;

function toSizedKey(key: string, size: string): string {
  const dotIdx = key.lastIndexOf('.');
  return key.slice(0, dotIdx) + `_${size}.jpg`;
}

function keyToFilename(sizedKey: string): string {
  return sizedKey.replace(/\//g, '__');
}

async function ensureDir() {
  const info = await FileSystem.getInfoAsync(CACHE_DIR);
  if (!info.exists) await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true });
}

async function getMeta(): Promise<CacheMeta> {
  try {
    const info = await FileSystem.getInfoAsync(META_FILE);
    if (!info.exists) return {};
    const raw = await FileSystem.readAsStringAsync(META_FILE);
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function saveMeta(meta: CacheMeta) {
  await FileSystem.writeAsStringAsync(META_FILE, JSON.stringify(meta));
}

async function evictIfNeeded(meta: CacheMeta): Promise<CacheMeta> {
  const total = Object.values(meta).reduce((s, m) => s + m.size, 0);
  if (total <= MAX_SIZE) return meta;

  const sorted = Object.entries(meta).sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);
  let current = total;
  const updated = { ...meta };

  for (const [k, m] of sorted) {
    if (current <= MAX_SIZE * 0.8) break;
    try { await FileSystem.deleteAsync(m.localPath, { idempotent: true }); } catch {}
    delete updated[k];
    current -= m.size;
  }

  return updated;
}

export async function getCachedPhoto(key: string, size: string): Promise<string> {
  const sizedKey = toSizedKey(key, size);

  await ensureDir();
  const meta = await getMeta();

  if (meta[sizedKey]) {
    const info = await FileSystem.getInfoAsync(meta[sizedKey].localPath);
    if (info.exists) {
      meta[sizedKey].lastAccessed = Date.now();
      await saveMeta(meta);
      return meta[sizedKey].localPath;
    }
    delete meta[sizedKey];
  }

  const url = await getPresignedUrl(sizedKey, 604800);
  const localPath = CACHE_DIR + keyToFilename(sizedKey);
  await FileSystem.downloadAsync(url, localPath);

  const fileInfo = await FileSystem.getInfoAsync(localPath, { size: true });
  const fileSize = (fileInfo as any).size ?? 0;

  meta[sizedKey] = { localPath, lastAccessed: Date.now(), size: fileSize };
  const evicted = await evictIfNeeded(meta);
  await saveMeta(evicted);

  return localPath;
}
