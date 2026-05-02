import mahalleler from './il_ilce_mahalle.json';

export type MahalleGrup = { semt: string | null; mahalleler: string[] };

const RAW = mahalleler as Record<string, Record<string, MahalleGrup[]>>;

export const IL_LISTESI = Object.keys(RAW).sort((a, b) => a.localeCompare(b, 'tr'));

export const TURKIYE: Record<string, string[]> = Object.fromEntries(
  Object.entries(RAW).map(([il, ilceler]) => [il, Object.keys(ilceler).sort((a, b) => a.localeCompare(b, 'tr'))])
);

export const MAHALLELER = RAW;

export const getMahalleler = (il: string, ilce: string): string[] =>
  (RAW[il]?.[ilce] || []).flatMap(g => g.mahalleler);

export const getMahalleGruplar = (il: string, ilce: string): MahalleGrup[] =>
  RAW[il]?.[ilce] || [];
