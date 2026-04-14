import mahalleler from './il_ilce_mahalle.json';

const RAW = mahalleler as Record<string, Record<string, string[]>>;

export const IL_LISTESI = Object.keys(RAW).sort((a, b) => a.localeCompare(b, 'tr'));

export const TURKIYE: Record<string, string[]> = Object.fromEntries(
  Object.entries(RAW).map(([il, ilceler]) => [il, Object.keys(ilceler)])
);

export const MAHALLELER = RAW;
