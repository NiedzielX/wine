import { IMPORT_LIMITS, ValidationError, type ImportFileParser, type ParsedFile } from '@wine-match/core';
import { readCsv } from './csv';
import { readPdfLines } from './pdf';
import { readXlsx } from './xlsx';

/**
 * Reads an uploaded file. The type is decided by the CONTENT (magic bytes), not the extension; an
 * extension that disagrees with the content is refused rather than guessed.
 */
type Sniffed = 'pdf' | 'zip' | 'ole' | 'text';

function sniff(b: Uint8Array): Sniffed {
  const starts = (...bytes: number[]) => bytes.every((v, i) => b[i] === v);
  if (starts(0x25, 0x50, 0x44, 0x46, 0x2d)) return 'pdf';                    // %PDF-
  if (starts(0x50, 0x4b, 0x03, 0x04)) return 'zip';                          // PK..
  if (starts(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1)) return 'ole';  // legacy .xls / .doc
  return 'text';
}

const extension = (name: string) => /\.([A-Za-z0-9]+)$/.exec(name)?.[1].toLowerCase() ?? '';

export class NodeImportFileParser implements ImportFileParser {
  async parse(file: { name: string; bytes: Uint8Array }): Promise<ParsedFile> {
    const { bytes, name } = file;
    if (bytes.length === 0) throw new ValidationError('empty_file', 'The file is empty.');
    if (bytes.length > IMPORT_LIMITS.maxBytes) throw new ValidationError('file_too_large', `The file is larger than ${IMPORT_LIMITS.maxBytes / 1024 / 1024} MB.`);

    const ext = extension(name);
    const kind = sniff(bytes);
    if (kind === 'ole' || ext === 'xls') throw new ValidationError('legacy_xls', 'Old Excel files (.xls) are not supported. Save the file as .xlsx or CSV and upload it again.');
    if (!['csv', 'tsv', 'txt', 'xlsx', 'pdf'].includes(ext)) throw new ValidationError('unsupported_format', `“.${ext || '?'}” files are not supported. Upload a CSV, Excel (.xlsx) or PDF file.`);

    if (ext === 'pdf') {
      if (kind !== 'pdf') throw new ValidationError('format_mismatch', 'This file is named .pdf but is not a PDF.');
      return { parser: 'pdf-text', lines: await readPdfLines(bytes) };
    }
    if (ext === 'xlsx') {
      if (kind !== 'zip') throw new ValidationError('format_mismatch', 'This file is named .xlsx but is not an Excel file.');
      return { parser: 'xlsx', rows: this.limit(readXlsx(bytes)) };
    }
    // csv / tsv / txt
    if (kind !== 'text') throw new ValidationError('format_mismatch', `This file is named .${ext} but is not a text file.`);
    if (bytes.subarray(0, 4096).includes(0)) throw new ValidationError('format_mismatch', 'This file is not a text file.');
    const rows = readCsv(bytes);
    if (rows.length === 0) throw new ValidationError('empty_file', 'The file has no data.');
    return { parser: 'csv', rows: this.limit(rows) };
  }

  // both callers have already refused an empty table
  private limit(rows: string[][]): string[][] {
    if (rows.length > IMPORT_LIMITS.maxRows + 1) throw new ValidationError('too_many_rows', `The file has more than ${IMPORT_LIMITS.maxRows} rows. Split it and import in parts.`);
    return rows;
  }
}
