import React, { useState, useEffect } from 'react';
import { Image } from 'expo-image';
import { ImageStyle } from 'react-native';

type Size = 'cover' | 'sm' | 'md' | 'lg';

type Props = {
  source: string;
  style?: ImageStyle | ImageStyle[];
  resizeMode?: 'cover' | 'contain' | 'stretch' | 'repeat' | 'center';
  size?: Size;
};

const R2_BASE = process.env.EXPO_PUBLIC_R2_PUBLIC_URL!;

// Büyükten küçüğe: istenen boyut yüklenemezse (variant yok) bir alttakine düşeriz.
const ORDER: Size[] = ['lg', 'md', 'sm', 'cover'];

const isLocalUri = (s: string) =>
  s.startsWith('file://') || s.startsWith('ph://') || s.startsWith('content://');

const isFullUrl = (s: string) => s.startsWith('http://') || s.startsWith('https://');

function toSizedUrl(key: string, size: Size): string {
  const dotIdx = key.lastIndexOf('.');
  const sizedKey = key.slice(0, dotIdx) + `_${size}.jpg`;
  return `${R2_BASE}/${sizedKey}`;
}

export default function R2Image({ source, style, resizeMode = 'cover', size = 'md' }: Props) {
  const passthrough = !!source && (isLocalUri(source) || isFullUrl(source));
  // Eksik variant → bir küçüğe düş (örn _md yoksa _sm). source/size değişince sıfırla.
  const [fb, setFb] = useState(0);
  useEffect(() => { setFb(0); }, [source, size]);

  if (!source) return null;

  const contentFit = resizeMode === 'contain' ? 'contain' : 'cover';

  if (passthrough) {
    return <Image source={{ uri: source }} style={style} contentFit={contentFit} cachePolicy="memory-disk" recyclingKey={source} transition={0} />;
  }

  const startIdx = Math.max(0, ORDER.indexOf(size));
  const curIdx = Math.min(ORDER.length - 1, startIdx + fb);
  const uri = toSizedUrl(source, ORDER[curIdx]);

  return (
    <Image
      source={{ uri }}
      style={style}
      contentFit={contentFit}
      cachePolicy="memory-disk"
      recyclingKey={uri}
      transition={0}
      onError={() => { if (curIdx < ORDER.length - 1) setFb((f) => f + 1); }}
    />
  );
}

// Verilen R2 anahtarlarını belirtilen boyutta önceden indir (cache'e ısıt)
export function prefetchR2(keys: string[], size: Size = 'sm') {
  const uris = keys
    .filter(Boolean)
    .map((k) => (isLocalUri(k) || isFullUrl(k) ? k : toSizedUrl(k, size)));
  if (uris.length) Image.prefetch(uris, { cachePolicy: 'memory-disk' });
}
