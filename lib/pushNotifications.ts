import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { supabase } from './supabase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function registerPushToken() {
  if (!Device.isDevice) { console.log('[push] simulator, atlandı'); return; }

  const { status: existing } = await Notifications.getPermissionsAsync();
  console.log('[push] mevcut izin:', existing);
  let finalStatus = existing;
  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  console.log('[push] final izin:', finalStatus);
  if (finalStatus !== 'granted') return;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Varsayılan',
      importance: Notifications.AndroidImportance.MAX,
    });
  }

  try {
    const result = await Notifications.getExpoPushTokenAsync({
      projectId: 'e4ab4d85-4bc6-42fe-8d95-217137887489',
    });
    console.log('[push] token:', result.data);
    if (!result.data) return;

    const { error } = await supabase.from('push_tokenler').upsert(
      { token: result.data, platform: Platform.OS },
      { onConflict: 'user_id,token' }
    );
    console.log('[push] DB kayıt hatası:', error);
  } catch (e) {
    console.log('[push] hata:', e);
  }
}
