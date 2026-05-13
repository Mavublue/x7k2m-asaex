import { useState, useEffect } from 'react';

export type DownloadProgress = { current: number; total: number } | null;

let _progress: DownloadProgress = null;
const _listeners = new Set<(p: DownloadProgress) => void>();

export function setDownloadProgress(p: DownloadProgress) {
  _progress = p;
  _listeners.forEach(l => l(p));
}

export function useDownloadProgress(): DownloadProgress {
  const [progress, setProgress] = useState<DownloadProgress>(_progress);
  useEffect(() => {
    setProgress(_progress);
    _listeners.add(setProgress);
    return () => { _listeners.delete(setProgress); };
  }, []);
  return progress;
}
