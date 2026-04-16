const express = require('express');
const path    = require('path');
const PDFDocument = require('pdfkit');
const app     = express();

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── Colors (exact match to app CSS) ──────────────────────────────────────────
const C = {
  pageBg:    '#F5F0E6',
  navy:      '#1b2a4a',
  gold:      '#c4933f',
  divider:   '#D6CEBC',
  altRow:    '#FAF7F2',
  marker:    '#999999',
  white:     '#ffffff',
  csaBg:     '#1b2a4a',
  csaBorder: '#c4933f',
  usBg:      '#8B1F17',
  usBorder:  '#E84C3F',
};

// ── Layout ────────────────────────────────────────────────────────────────────
const M          = 30;    // margin
const DATE_W     = 72;    // date column width
const MONTH_H    = 20;    // month header row height
const SCEN_H     = 24;    // scenario header row height
const BASE_ROW_H = 30;    // minimum data row height
const CHIP_H     = 16;    // chip height
const CHIP_GAP   = 3;     // gap between stacked chips
const CHIP_R     = 3;     // chip corner radius
const CHIP_PAD   = 4;     // horizontal padding inside chip column
const BORDER_W   = 4;     // left accent border width

// ── Helpers ───────────────────────────────────────────────────────────────────
function truncate(doc, text, maxW) {
  if (doc.widthOfString(text) <= maxW) return text;
  while (text.length > 1 && doc.widthOfString(text + '…') > maxW) text = text.slice(0, -1);
  return text + '…';
}

function drawChip(doc, x, y, w, bgColor, borderColor, label) {
  // Background
  doc.save().roundedRect(x, y, w, CHIP_H, CHIP_R).fill(bgColor);
  // Left accent border
  doc.rect(x, y, BORDER_W, CHIP_H).fill(borderColor);
  // Label
  const textX  = x + BORDER_W + 6;
  const maxW   = w - BORDER_W - 10;
  const text   = truncate(doc, label, maxW);
  doc.font('Helvetica-Bold').fontSize(7).fillColor(C.white)
     .text(text, textX, y + (CHIP_H - 7) / 2 + 1, { lineBreak: false });
  doc.restore();
}

function drawScenHeader(doc, gridL, gridW, scenX, scenColW, columns, y) {
  doc.rect(gridL, y, gridW, SCEN_H).fill(C.navy);
  doc.font('Helvetica-Bold').fontSize(9).fillColor(C.white)
     .text('Weekend', gridL + 4, y + (SCEN_H - 9) / 2 + 1, { lineBreak: false, width: DATE_W - 8 });
  columns.forEach((col, i) => {
    const lbl = col.label || `Option ${i + 1}`;
    const tw  = doc.widthOfString(lbl);
    const cx  = scenX(i) + (scenColW - tw) / 2;
    doc.text(lbl, cx, y + (SCEN_H - 9) / 2 + 1, { lineBreak: false });
  });
  return y + SCEN_H;
}

// ── PDF endpoint ──────────────────────────────────────────────────────────────
app.post('/generate-pdf', (req, res) => {
  const { filename = 'CSA-Schedule.pdf', label = '', year = '', weekends = [], columns = [], events = [] } = req.body;

  const eventMap = {};
  events.forEach(e => { eventMap[e.id] = e; });

  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margins: { top: M, right: M, bottom: M, left: M }, autoFirstPage: true });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  doc.pipe(res);

  const PW      = doc.page.width;
  const PH      = doc.page.height;
  const usableW = PW - M * 2;
  const gridL   = M;
  const colCount = Math.max(columns.length, 1);
  const scenColW = (usableW - DATE_W) / colCount;
  const scenX    = i => gridL + DATE_W + i * scenColW;

  function newPage(curY) {
    doc.addPage();
    doc.rect(0, 0, PW, PH).fill(C.pageBg);
    return drawScenHeader(doc, gridL, usableW, scenX, scenColW, columns, M);
  }

  // Page background
  doc.rect(0, 0, PW, PH).fill(C.pageBg);

  // ── Header block ─────────────────────────────────────────────────────────
  let curY = M;
  doc.font('Helvetica-Bold').fontSize(18).fillColor(C.navy)
     .text('CSA SEASON SCHEDULER', gridL, curY, { lineBreak: false });
  curY += 22;

  const subtitle = [year.replace('-', '–'), label].filter(Boolean).join(' · ');
  doc.font('Helvetica').fontSize(10).fillColor(C.gold)
     .text(subtitle, gridL, curY, { lineBreak: false });
  curY += 14;

  doc.moveTo(gridL, curY).lineTo(gridL + usableW, curY).lineWidth(0.75).stroke(C.gold);
  curY += 10;

  // ── Scenario header row ───────────────────────────────────────────────────
  curY = drawScenHeader(doc, gridL, usableW, scenX, scenColW, columns, curY);

  // ── Calendar rows ─────────────────────────────────────────────────────────
  let rowIdx = 0;
  weekends.forEach(wknd => {

    // Month header
    if (wknd.month) {
      if (curY + MONTH_H + BASE_ROW_H > PH - M) curY = newPage(curY);
      doc.rect(gridL, curY, usableW, MONTH_H).fill(C.navy);
      doc.font('Helvetica-Bold').fontSize(10).fillColor(C.white)
         .text(wknd.month.toUpperCase(), gridL + 8, curY + (MONTH_H - 10) / 2 + 1, { lineBreak: false });
      curY += MONTH_H;
    }

    // Row height: tallest chip stack across all columns
    let maxChips = 0;
    columns.forEach(col => {
      const placed = (col.placements && col.placements[wknd.key]) || [];
      if (placed.length > maxChips) maxChips = placed.length;
    });
    const chipStack = maxChips > 0 ? maxChips * CHIP_H + (maxChips - 1) * CHIP_GAP : 0;
    const rowH = Math.max(BASE_ROW_H, chipStack + 8 + (wknd.marker ? 12 : 0));

    // Page break
    if (curY + rowH > PH - M) curY = newPage(curY);

    // Alt row
    if (rowIdx % 2 === 1) doc.rect(gridL, curY, usableW, rowH).fill(C.altRow);
    rowIdx++;

    // Date label
    doc.font('Helvetica-Bold').fontSize(9).fillColor(C.navy)
       .text(wknd.label, gridL + 4, curY + 4, { lineBreak: false, width: DATE_W - 8 });

    // Holiday marker
    if (wknd.marker) {
      doc.font('Helvetica-Oblique').fontSize(7).fillColor(C.marker)
         .text(wknd.marker.text, gridL + 4, curY + 16, { lineBreak: false, width: DATE_W - 8 });
    }

    // Chips
    columns.forEach((col, ci) => {
      const placed = (col.placements && col.placements[wknd.key]) || [];
      const cx     = scenX(ci);
      const chipW  = scenColW - CHIP_PAD * 2;
      let chipY    = curY + 4;
      placed.forEach(evtId => {
        const evt      = eventMap[evtId] || { name: evtId, type: 'csa' };
        const isUs     = evt.type === 'us';
        drawChip(doc, cx + CHIP_PAD, chipY, chipW, isUs ? C.usBg : C.csaBg, isUs ? C.usBorder : C.csaBorder, evt.name);
        chipY += CHIP_H + CHIP_GAP;
      });
    });

    // Bottom divider
    curY += rowH;
    doc.moveTo(gridL, curY).lineTo(gridL + usableW, curY).lineWidth(0.5).stroke(C.divider);
  });

  doc.end();
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`CSA Scheduler on port ${PORT}`));
