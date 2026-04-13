import React, { useEffect, useState } from 'react';
import { Image, ImageStyle, View } from 'react-native';
import { getCachedPhoto } from '../lib/photoCache';

type Size = 'cover' | 'sm' | 'md' | 'lg';

type Props = {
  source: string;
  style?: ImageStyle | ImageStyle[];
  resizeMode?: 'cover' | 'contain' | 'stretch' | 'repeat' | 'center';
  size?: Size;
};

const isLocalUri = (s: string) =>
  s.startsWith('file://') || s.startsWith('ph://') || s.startsWith('content://');

const isFullUrl = (s: string) => s.startsWith('http://') || s.startsWith('https://');

export default function R2Image({ source, style, resizeMode = 'cover', size = 'md' }: Props) {
  const [uri, setUri] = useState<string | null>(null);

  useEffect(() => {
    if (!source) return;
    if (isLocalUri(source) || isFullUrl(source)) {
      setUri(source);
      return;
    }
    getCachedPhoto(source, size).then(setUri).catch(() => {});
  }, [source, size]);

  if (!uri) return <View style={[style as any, { backgroundColor: '#E5E7EB' }]} />;
  return <Image source={{ uri }} style={style} resizeMode={resizeMode} />;
}
