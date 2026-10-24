import AsyncStorage from '@react-native-async-storage/async-storage';

const TTL = 30 * 24 * 60 * 60 * 1000; // 30 gün

export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > TTL) { await AsyncStorage.removeItem(key); return null; }
    return data as T;
  } catch { return null; }
}

export async function cacheSet(key: string, data: unknown) {
  try {
    await AsyncStorage.setItem(key, JSON.stringify({ data, ts: Date.now() }));
  } catch {}
}

export async function cacheClear(prefix: string) {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const target = keys.filter(k => k.startsWith(prefix));
    if (target.length) await AsyncStorage.multiRemove(target);
  } catch {}
}

// Son oturum açan kullanıcı; soğuk açılışta getSession() token yenilemeyi ağdan beklerken
// cache'i oturumu beklemeden okuyabilmek için. app_ öneki: logout'ta cacheClear('app_') siler.
const UID_KEY = 'app_last_uid';

export async function cacheGetFast<T>(prefix: string): Promise<T | null> {
  try {
    const uid = await AsyncStorage.getItem(UID_KEY);
    return uid ? await cacheGet<T>(`${prefix}${uid}`) : null;
  } catch { return null; }
}

export function cacheRememberUid(uid: string) {
  AsyncStorage.setItem(UID_KEY, uid).catch(() => {});
}
