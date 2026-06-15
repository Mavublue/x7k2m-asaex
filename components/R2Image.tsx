import React from 'react';
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

const isLocalUri = (s: string) =>
  s.startsWith('file://') || s.startsWith('ph://') || s.startsWith('content://');

const isFullUrl = (s: string) => s.startsWith('http://') || s.startsWith('https://');

function toSizedUrl(key: string, size: Size): string {
  const dotIdx = key.lastIndexOf('.');
  const sizedKey = key.slice(0, dotIdx) + `_${size}.jpg`;
  return `${R2_BASE}/${sizedKey}`;
}

export default function R2Image({ source, style, resizeMode = 'cover', size = 'md' }: Props) {
  if (!source) return null;

  const uri = isLocalUri(source) || isFullUrl(source)
    ? source
    : toSizedUrl(source, size);

  return <Image source={{ uri }} style={style} contentFit={resizeMode === 'contain' ? 'contain' : 'cover'} cachePolicy="memory-disk" recyclingKey={uri} transition={0} />;
}

// Verilen R2 anahtarlarını belirtilen boyutta önceden indir (cache'e ısıt)
export function prefetchR2(keys: string[], size: Size = 'sm') {
  const uris = keys
    .filter(Boolean)
    .map((k) => (isLocalUri(k) || isFullUrl(k) ? k : toSizedUrl(k, size)));
  if (uris.length) Image.prefetch(uris, { cachePolicy: 'memory-disk' });
}
