// react-native-webview 14 (Expo 58): bileşen çalışma anında forwardRef + injectJavaScript vb. veriyor,
// ama tip tanımı FunctionComponent ve ref'i içermiyor. Aynı bileşeni doğru tiple dışa veriyoruz.
import type { ForwardRefExoticComponent, RefAttributes } from 'react';
import { WebView as RNWebView, type WebViewProps } from 'react-native-webview';

export type WebView = {
  injectJavaScript: (js: string) => void;
  postMessage: (data: string) => void;
  reload: () => void;
  goBack: () => void;
  goForward: () => void;
  stopLoading: () => void;
  requestFocus: () => void;
  clearCache?: (includeDiskFiles: boolean) => void;
};

export const WebView = RNWebView as unknown as ForwardRefExoticComponent<WebViewProps & RefAttributes<WebView>>;
