import { ValidationError } from '@wine-match/core';
import { getDocumentProxy } from 'unpdf';

/**
 * Text of a PDF as lines. Characters are grouped into lines by their vertical position and ordered
 * left to right; gaps wider than a space become a space. A PDF has no tables: turning lines into rows
 * is a best-effort step done in @wine-match/core (`linesToRows`) and always shown to the user for checking.
 */
export async function readPdfLines(bytes: Uint8Array): Promise<string[]> {
  let pdf;
  try {
    pdf = await getDocumentProxy(new Uint8Array(bytes));
  } catch {
    throw new ValidationError('corrupt_file', 'This PDF could not be opened. Is it damaged or password-protected? Export a CSV or Excel file instead.');
  }
  const lines: string[] = [];
  for (let p = 1; p <= Math.min(pdf.numPages, 60); p++) {
    const content = await (await pdf.getPage(p)).getTextContent();
    const items = content.items
      .filter((i): i is typeof i & { str: string; transform: number[]; width: number } => 'str' in i && i.str.trim() !== '')
      .map((i) => ({ str: i.str, x: i.transform[4], y: i.transform[5], w: i.width }));
    items.sort((a, b) => b.y - a.y || a.x - b.x);
    let current: typeof items = [];
    const flush = () => {
      if (current.length === 0) return;
      current.sort((a, b) => a.x - b.x);
      let text = '';
      let end = -Infinity;
      for (const i of current) {
        text += (text && i.x - end > 1.5 ? ' ' : '') + i.str;
        end = i.x + i.w;
      }
      lines.push(text.replace(/\s+/g, ' ').trim());
      current = [];
    };
    for (const it of items) {
      if (current.length && Math.abs(current[0].y - it.y) > 2.5) flush();
      current.push(it);
    }
    flush();
  }
  if (lines.length === 0) {
    throw new ValidationError('scanned_pdf', 'This PDF has no text (it looks like a scan or a photo). Reading images is not supported: export a CSV or Excel file from your system.');
  }
  return lines;
}
