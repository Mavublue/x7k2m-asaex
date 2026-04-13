import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const CHUNK_SIZE = 1900;

// SecureStore 2048 byte sınırını aşmamak için büyük değerleri parçalara böler
const ChunkedSecureStore = {
  async getItem(key: string): Promise<string | null> {
    const numChunksStr = await SecureStore.getItemAsync(`${key}_chunks`);
    if (!numChunksStr) return SecureStore.getItemAsync(key);
    const numChunks = parseInt(numChunksStr);
    const chunks: string[] = [];
    for (let i = 0; i < numChunks; i++) {
      const chunk = await SecureStore.getItemAsync(`${key}_${i}`);
      chunks.push(chunk ?? '');
    }
    return chunks.join('');
  },

  async setItem(key: string, value: string): Promise<void> {
    if (value.length <= CHUNK_SIZE) {
      await SecureStore.setItemAsync(key, value);
      return;
    }
    const numChunks = Math.ceil(value.length / CHUNK_SIZE);
    await SecureStore.setItemAsync(`${key}_chunks`, String(numChunks));
    for (let i = 0; i < numChunks; i++) {
      await SecureStore.setItemAsync(`${key}_${i}`, value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE));
    }
  },

  async removeItem(key: string): Promise<void> {
    const numChunksStr = await SecureStore.getItemAsync(`${key}_chunks`);
    if (numChunksStr) {
      const numChunks = parseInt(numChunksStr);
      await SecureStore.deleteItemAsync(`${key}_chunks`);
      for (let i = 0; i < numChunks; i++) {
        await SecureStore.deleteItemAsync(`${key}_${i}`);
      }
    }
    await SecureStore.deleteItemAsync(key);
  },
};

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

const storage = Platform.OS === 'web' ? undefined : ChunkedSecureStore;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
