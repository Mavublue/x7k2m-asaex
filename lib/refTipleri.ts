// RN 0.88 (Expo 58): ScrollView/TextInput/View artık fonksiyon bileşen tipinde;
// ref tipi bileşenin kendisi değil, ref prop'unun örnek tipi olmalı.
import type { ComponentRef } from 'react';
import type { ScrollView, TextInput, View } from 'react-native';

export type ScrollViewRef = ComponentRef<typeof ScrollView>;
export type TextInputRef = ComponentRef<typeof TextInput>;
export type ViewRef = ComponentRef<typeof View>;
