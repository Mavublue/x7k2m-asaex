// Müşteri ziyareti sayılmaması gereken otomatik okuyucular (Google sesli okuma, arama/önizleme botları).
// "bot" kelime sınırıyla aranır — CUBOT gibi telefon markaları yakalanmasın. ilan-web/lib/bot.ts ile aynı.
const BOT_UA = /\b(bot|crawler|spider)\b|Google-Read-Aloud|Googlebot|Google-InspectionTool|AdsBot|Mediapartners-Google|APIs-Google|FeedFetcher|bingbot|Applebot|facebookexternalhit|facebookcatalog|Twitterbot|TelegramBot|Slackbot|Discordbot|LinkedInBot|YandexBot|Baiduspider|Bytespider|PetalBot|SemrushBot|AhrefsBot|HeadlessChrome|Lighthouse|Chrome-Lighthouse/i;

export function isBotUA(ua: string | null | undefined): boolean {
  return !!ua && BOT_UA.test(ua);
}
