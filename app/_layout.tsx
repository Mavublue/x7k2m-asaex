import 'react-native-get-random-values';
import { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { supabase } from '../lib/supabase';
import { registerPushToken } from '../lib/pushNotifications';
import { Session } from '@supabase/supabase-js';

export default function RootLayout() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session) {
        const { error } = await supabase.auth.getUser();
        if (error) {
          await supabase.auth.signOut();
          setSession(null);
        } else {
          setSession(session);
        }
      } else {
        setSession(null);
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        registerPushToken();
      } else {
        router.replace('/(auth)/login');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!loading) {
      if (session) {
        router.replace('/(tabs)');
      } else {
        router.replace('/(auth)/login');
      }
    }
  }, [session, loading]);

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(async (response) => {
      const data = response.notification.request.content.data as any;
      if (data?.tip !== 'gorev_onerisi') return;

      const { musteri_id, musteri_ad, gorev_baslik, gorev_tarih } = data;

      Alert.alert(
        'Görev Önerisi',
        `${musteri_ad} için görev eklensin mi?\n\n"${gorev_baslik}"${gorev_tarih ? `\nTarih: ${new Date(gorev_tarih).toLocaleDateString('tr-TR')}` : ''}`,
        [
          { text: 'Hayır', style: 'cancel' },
          {
            text: 'Evet, Ekle',
            onPress: async () => {
              await supabase.from('musteri_gorevler').insert({
                musteri_id,
                baslik: gorev_baslik,
                hedef_tarih: gorev_tarih ? new Date(gorev_tarih).toISOString() : null,
                aciklama: 'Nottan önerildi',
              });
              router.push(`/musteri/${musteri_id}` as any);
            },
          },
        ]
      );
    });
    return () => sub.remove();
  }, []);

  return (
    <>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)/login" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="ilan/[id]" options={{ presentation: 'card' }} />
        <Stack.Screen name="ilan/ekle" options={{ presentation: 'modal' }} />
        <Stack.Screen name="ilan/duzenle/[id]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="profil/duzenle" options={{ presentation: 'card' }} />
        <Stack.Screen name="musteri/ekle" options={{ presentation: 'modal' }} />
        <Stack.Screen name="musteri/[id]" options={{ presentation: 'card' }} />
        <Stack.Screen name="ozellikler/index" options={{ presentation: 'card' }} />
      </Stack>
    </>
  );
}
