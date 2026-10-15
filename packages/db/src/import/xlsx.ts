import { strFromU8, unzipSync } from 'fflate';
import { ValidationError } from '@wine-match/core';

/**
 * Minimal, safe reader for .xlsx (the first worksheet that has data).
 *  - zip bombs: the total uncompressed size of what we read is capped
 *  - no XML parser, so no entity expansion / XXE: only the five standard entities and numeric references are decoded
 */
const MAX_UNCOMPRESSED = 25 * 1024 * 1024;

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decode = (s: string) =>
  s.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (_, e: string) =>
    e[0] === '#' ? String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENTITIES[e]);

/** Text of all <t> elements, ignoring phonetic runs (<rPh>). */
function textOf(xml: string): string {
  const noPhonetic = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '');
  return [...noPhonetic.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) => decode(m[1])).join('');
}

const colIndex = (ref: string) => {
  let n = 0;
  for (const ch of ref.replace(/[0-9]/g, '')) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

/** 58.499999999999993 → "58.5"; integers stay integers. */
const num = (raw: string) => {
  const n = Number(raw);
  return Number.isFinite(n) ? String(Math.round(n * 1e8) / 1e8) : raw;
};

export function readXlsx(bytes: Uint8Array): string[][] {
  let total = 0;
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, {
      filter: (f) => {
        if (!/^(xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|worksheets\/[^/]+\.xml))$/.test(f.name)) return false;
        total += f.originalSize;
        if (total > MAX_UNCOMPRESSED) throw new ValidationError('file_too_large', 'The spreadsheet is too large once unpacked.');
        return true;
      }
    });
  } catch (e) {
    if (e instanceof ValidationError) throw e;
    throw new ValidationError('corrupt_file', 'This Excel file could not be opened. Is it damaged? Try saving it again as .xlsx or CSV.');
  }
  if (!files['xl/workbook.xml']) throw new ValidationError('corrupt_file', 'This is not a valid Excel (.xlsx) file.');

  const shared = files['xl/sharedStrings.xml']
    ? [...strFromU8(files['xl/sharedStrings.xml']).matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]))
    : [];

  // sheets in workbook order → target file through the relationships
  const rels = new Map<string, string>();
  if (files['xl/_rels/workbook.xml.rels']) {
    for (const m of strFromU8(files['xl/_rels/workbook.xml.rels']).matchAll(/<Relationship\b([^>]*?)\/?>/g)) {
      const id = /\bId="([^"]*)"/.exec(m[1])?.[1];
      const target = /\bTarget="([^"]*)"/.exec(m[1])?.[1];
      if (id && target) rels.set(id, target.replace(/^\/?(xl\/)?/, 'xl/'));
    }
  }
  const sheetFiles = [...strFromU8(files['xl/workbook.xml']).matchAll(/<sheet\b([^>]*?)\/?>/g)]
    .map((m) => rels.get(/\br:id="([^"]*)"/.exec(m[1])?.[1] ?? ''))
    .filter((f): f is string => !!f && !!files[f]);
  if (sheetFiles.length === 0) sheetFiles.push(...Object.keys(files).filter((n) => n.startsWith('xl/worksheets/')).sort());

  for (const file of sheetFiles) {
    const rows = readSheet(strFromU8(files[file]), shared);
    if (rows.length > 0) return rows;
  }
  throw new ValidationError('empty_file', 'The spreadsheet has no data.');
}

function readSheet(xml: string, shared: string[]): string[][] {
  const out: string[][] = [];
  for (const rowMatch of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const cells: string[] = [];
    for (const c of (rowMatch[2] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = /\br="([A-Z]+[0-9]+)"/.exec(c[1])?.[1];
      if (!ref) continue;
      const type = /\bt="([^"]*)"/.exec(c[1])?.[1] ?? 'n';
      const inner = c[2] ?? '';
      let value = '';
      if (type === 'inlineStr') value = textOf(inner);
      else {
        const v = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(inner)?.[1];
        if (v !== undefined) {
          if (type === 's') value = shared[Number(v)] ?? '';
          else if (type === 'b') value = v === '1' ? 'TRUE' : 'FALSE';
          else if (type === 'str') value = decode(v);
          else if (type === 'e') value = '';
          else value = num(v);
        }
      }
      cells[colIndex(ref)] = value;
    }
    const row = Array.from(cells, (v) => v ?? '').map((v) => v.trim());
    if (row.some((v) => v !== '')) out.push(row);
  }
  // Excel does not store empty cells at the end of a row: make every row as wide as the widest one
  const width = Math.max(0, ...out.map((r) => r.length));
  return out.map((r) => (r.length < width ? [...r, ...Array(width - r.length).fill('')] : r));
}
