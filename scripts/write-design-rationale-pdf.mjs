/**
 * Writes docs/design-rationale.pdf from docs/design-rationale.md (one US Letter page).
 * Usage: node scripts/write-design-rationale-pdf.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const mdPath = join(root, 'docs', 'design-rationale.md');
const outPath = join(root, 'docs', 'design-rationale.pdf');

const md = readFileSync(mdPath, 'utf8');
const text = md
  .replace(/\r\n/g, '\n')
  .replace(/^>.*$/gm, '')
  .replace(/^#{1,6}\s*/gm, '')
  .replace(/\*\*(.*?)\*\*/g, '$1')
  .replace(/\*([^*]+)\*/g, '$1')
  .replace(/`([^`]+)`/g, '$1')
  .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
  .replace(/\|/g, ' ')
  .replace(/-{3,}/g, '')
  .replace(/^\*Regenerate PDF.*$/gm, '')
  .replace(/\n{3,}/g, '\n\n')
  .trim();

const MAX_CHARS = 98;
const lines = [];
for (const paragraph of text.split('\n')) {
  const words = paragraph.split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    lines.push('');
    continue;
  }
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > MAX_CHARS) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
}

// US Letter 612×792 pt — compact 7.5pt Helvetica to fit full rationale on one page
const FONT_SIZE = 7.5;
const LEADING = 9.2;
const MARGIN_LEFT = 40;
const MARGIN_TOP = 758;
const MAX_LINES = 78;

const pageLines = lines.slice(0, MAX_LINES);
if (lines.length > MAX_LINES) {
  console.warn(`Warning: truncated ${lines.length - MAX_LINES} lines to fit one page`);
}

const contentLines = ['BT', `/F1 ${FONT_SIZE} Tf`, `${MARGIN_LEFT} ${MARGIN_TOP} Td`, `${LEADING} TL`];
pageLines.forEach((line, index) => {
  const escaped = line.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  if (index === 0) {
    contentLines.push(`(${escaped}) Tj`);
  } else {
    contentLines.push('T*');
    contentLines.push(`(${escaped}) Tj`);
  }
});
contentLines.push('ET');
const stream = `${contentLines.join('\n')}\n`;

const objects = [];
objects.push('1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n');
objects.push('2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n');
objects.push(
  '3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>endobj\n',
);
objects.push(`4 0 obj<< /Length ${Buffer.byteLength(stream, 'utf8')} >>stream\n${stream}endstream\nendobj\n`);
objects.push('5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\n');

let pdf = '%PDF-1.4\n';
const offsets = [0];
for (const obj of objects) {
  offsets.push(Buffer.byteLength(pdf, 'utf8'));
  pdf += obj;
}
const xrefStart = Buffer.byteLength(pdf, 'utf8');
pdf += `xref\n0 ${objects.length + 1}\n`;
pdf += '0000000000 65535 f \n';
for (let i = 1; i < offsets.length; i += 1) {
  pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
}
pdf += `trailer<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;

const altPath = join(root, 'docs', 'design-rationale.generated.pdf');
try {
  writeFileSync(outPath, pdf);
  console.log(`Wrote ${outPath} (${pageLines.length} lines, ${FONT_SIZE}pt)`);
} catch (err) {
  if (err && typeof err === 'object' && 'code' in err && err.code === 'EBUSY') {
    writeFileSync(altPath, pdf);
    console.log(`Target locked; wrote ${altPath} instead (${pageLines.length} lines, ${FONT_SIZE}pt)`);
    console.log('Close design-rationale.pdf in your editor, then re-run to overwrite.');
  } else {
    throw err;
  }
}
