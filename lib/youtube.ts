// watch?v=, youtu.be, shorts, embed, live linklerinden 11 haneli video id'si; geçersizse null
export function youtubeId(url: string | null | undefined): string | null {
  const m = (url ?? '').trim().match(
    /^(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtube-nocookie\.com\/embed\/|youtu\.be\/)([\w-]{11})(?:[?&#/].*)?$/i
  );
  return m ? m[1] : null;
}

// DB'ye tek biçimde yazılır
export function youtubeNormalize(url: string | null | undefined): string | null {
  const id = youtubeId(url);
  return id ? `https://www.youtube.com/watch?v=${id}` : null;
}
