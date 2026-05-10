import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

serve(async (req) => {
  try {
    const { slot } = await req.json(); // 'sabah' | 'oglen' | 'aksam'
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const { data: kullanicilar } = await supabase.from('profiles').select('id');
    if (!kullanicilar?.length) return new Response('ok');

    for (const kullanici of kullanicilar) {
      await isleEmlakci(supabase, kullanici.id, slot);
    }

    return new Response('ok');
  } catch (e) {
    return new Response(String(e), { status: 500 });
  }
});

async function isleEmlakci(supabase: any, userId: string, slot: string) {
  const bugun = new Date().toISOString().split('T')[0];

  const [{ data: gorevler }, { data: uzunSuredir }, { data: takipGecmis }] = await Promise.all([
    supabase.from('musteri_gorevler')
      .select('id, baslik, hedef_tarih, musteriler!inner(id, ad, soyad, user_id)')
      .eq('tamamlandi', false)
      .lte('hedef_tarih', bugun)
      .eq('musteriler.user_id', userId)
      .not('hedef_tarih', 'is', null)
      .limit(10),

    supabase.from('musteriler')
      .select('id, ad, soyad, guncelleme_tarihi')
      .eq('user_id', userId)
      .eq('durum', 'Aktif')
      .lt('guncelleme_tarihi', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .limit(10),

    supabase.from('musteriler')
      .select('id, ad, soyad, takip_tarihi')
      .eq('user_id', userId)
      .eq('durum', 'Aktif')
      .lt('takip_tarihi', bugun)
      .not('takip_tarihi', 'is', null)
      .limit(10),
  ]);

  const satirlar: string[] = [
    ...(gorevler ?? []).map((g: any) => {
      const m = g.musteriler;
      return `• ${m?.ad ?? ''} ${m?.soyad ?? ''}: "${g.baslik}" görevi gecikmiş`;
    }),
    ...(uzunSuredir ?? []).map((m: any) => `• ${m.ad} ${m.soyad ?? ''}: 7+ gündür iletişim yok`),
    ...(takipGecmis ?? []).map((m: any) => `• ${m.ad} ${m.soyad ?? ''}: takip tarihi geçmiş`),
  ];

  if (!satirlar.length) return;

  let mesaj = satirlar.slice(0, 3).join('\n');

  if (ANTHROPIC_API_KEY) {
    const slotAdi = slot === 'sabah' ? 'sabah' : slot === 'oglen' ? 'öğlen' : 'akşam';
    const prompt = `Sen bir emlak asistanısın. ${slotAdi} özeti:\n${satirlar.join('\n')}\nKısa, samimi, motive edici hatırlatma yaz. Maksimum 2 cümle.`;

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 150,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    const d = await r.json();
    mesaj = d.content?.[0]?.text ?? mesaj;
  }

  const { data: tokenler } = await supabase.from('push_tokenler').select('token').eq('user_id', userId);
  if (!tokenler?.length) return;

  const slotBaslik = slot === 'sabah' ? '🌅 Sabah Özeti' : slot === 'oglen' ? '☀️ Öğlen Hatırlatması' : '🌙 Akşam Özeti';

  await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(
      tokenler.map((t: any) => ({
        to: t.token,
        title: slotBaslik,
        body: mesaj,
        sound: 'default',
      }))
    ),
  });
}
