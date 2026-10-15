import { parseCsv } from '@wine-match/core';

/** Decodes a text file: UTF-8 (with or without BOM), otherwise Windows-1250 (Polish Excel's "CSV"). */
export function decodeText(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, '');
  } catch {
    return new TextDecoder('windows-1250').decode(bytes);
  }
}

export function readCsv(bytes: Uint8Array): string[][] {
  return parseCsv(decodeText(bytes)).filter((r) => r.some((c) => c !== ''));
}
