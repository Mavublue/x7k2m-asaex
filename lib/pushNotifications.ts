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
  if (!Device.isDevice) return;

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
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
    if (!result.data) return;
    await supabase.from('push_tokenler').upsert(
      { token: result.data, platform: Platform.OS },
      { onConflict: 'user_id,token' }
    );
  } catch {
    // Push notification Apple Developer hesabı gerektirir
  }
}
