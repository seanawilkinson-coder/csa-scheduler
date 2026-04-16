const express = require('express');
const path    = require('path');
const PDFDocument = require('pdfkit');
const app     = express();

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── Colour palette ────────────────────────────────────────────────────────────
const C = {
  pageBg:       '#F5F0E6',
  navy:         '#1b2a4a',
  teal:         '#2a6b7c',
  gold:         '#c4933f',
  divider:      '#D6CEBC',
  altRow:       '#FAF7F2',
  markerText:   '#888888',
};

// ── Layout constants ──────────────────────────────────────────────────────────
const MARGIN        = 30;
const DATE_COL_W    = 70;
const MONTH_ROW_H   = 20;
const SCENARIO_HDR_H= 22;
const BASE_ROW_H    = 28;
const CHIP_H        = 16;
const CHIP_GAP      = 3;
const CHIP_PAD_X    = 6;   // padding inside column on each side
const CHIP_RADIUS   = 3;
const CHIP_FONT_SZ  = 7;
const DATE_FONT_SZ  = 9;
const MARKER_FONT_SZ= 7;
const HDR_TITLE_SZ  = 18;
const HDR_SUB_SZ    = 10;
const SCEN_HDR_SZ   = 10;
const MONTH_HDR_SZ  = 11;

// ── Helper: truncate text with ellipsis to fit maxWidth ──────────────────────
function fitText(doc, text, maxWidth) {
  if (doc.widthOfString(text) <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && doc.widthOfString(t + '…') > maxWidth) {
    t = t.slice(0, -1);
  }
  return t + '…';
}

// ── Helper: draw a rounded rect (pdfkit roundedRect) ─────────────────────────
function chip(doc, x, y, w, h, color, label) {
  doc.save()
     .roundedRect(x, y, w, h, CHIP_RADIUS)
     .fill(color);
  doc.font('Helvetica-Bold')
     .fontSize(CHIP_FONT_SZ)
     .fillColor('#ffffff');
  const inner = w - CHIP_PAD_X * 2;
  const text  = fitText(doc, label, inner);
  const tw    = doc.widthOfString(text);
  doc.text(text, x + (w - tw) / 2, y + (h - CHIP_FONT_SZ) / 2 + 1, { lineBreak: false });
  doc.restore();
}

// ── PDF generation ────────────────────────────────────────────────────────────
app.post('/generate-pdf', (req, res) => {
  const {
    filename      = 'CSA-Schedule.pdf',
    label         = '',
    year          = '',
    weekends      = [],
    columns       = [],
    events        = [],
  } = req.body;

  // Build event lookup: id → { name, type }
  const eventMap = {};
  for (const e of events) eventMap[e.id] = e;

  try {
    const doc = new PDFDocument({
      size:     'A4',
      layout:   'landscape',
      margins:  { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN },
      autoFirstPage: true,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    doc.pipe(res);

    // Page dimensions (A4 landscape: 841.89 × 595.28)
    const PW = doc.page.width;
    const PH = doc.page.height;

    // ── Page background ───────────────────────────────────────────────────────
    doc.rect(0, 0, PW, PH).fill(C.pageBg);

    // ── Usable area ───────────────────────────────────────────────────────────
    const usableW = PW - MARGIN * 2;

    // ── Header block ──────────────────────────────────────────────────────────
    let curY = MARGIN;

    doc.font('Helvetica-Bold')
       .fontSize(HDR_TITLE_SZ)
       .fillColor(C.navy)
       .text('CSA SEASON SCHEDULER', MARGIN, curY, { lineBreak: false });

    curY += HDR_TITLE_SZ + 4;

    const subtitle = [year, label].filter(Boolean).join(' · ');
    doc.font('Helvetica')
       .fontSize(HDR_SUB_SZ)
       .fillColor(C.gold)
       .text(subtitle, MARGIN, curY, { lineBreak: false });

    curY += HDR_SUB_SZ + 8;

    // Thin gold rule
    doc.moveTo(MARGIN, curY)
       .lineTo(MARGIN + usableW, curY)
       .lineWidth(0.75)
       .stroke(C.gold);

    curY += 12;

    // ── Grid layout ───────────────────────────────────────────────────────────
    const colCount  = columns.length || 1;
    const gridLeft  = MARGIN;
    const gridW     = usableW;
    const scenColW  = (gridW - DATE_COL_W) / colCount;

    // Column x positions (scenario columns)
    const scenX = (i) => gridLeft + DATE_COL_W + i * scenColW;

    // ── Scenario header row ───────────────────────────────────────────────────
    // Navy background spanning full grid width
    doc.rect(gridLeft, curY, gridW, SCENARIO_HDR_H).fill(C.navy);

    // Date column label (blank or "Weekend")
    doc.font('Helvetica-Bold')
       .fontSize(SCEN_HDR_SZ)
       .fillColor('#ffffff')
       .text('Weekend', gridLeft + 4, curY + (SCENARIO_HDR_H - SCEN_HDR_SZ) / 2, {
         lineBreak: false,
         width: DATE_COL_W - 4,
       });

    // Scenario labels
    columns.forEach((col, i) => {
      const cx = scenX(i);
      const lbl = col.label || `Option ${i + 1}`;
      doc.font('Helvetica-Bold')
         .fontSize(SCEN_HDR_SZ)
         .fillColor('#ffffff');
      const tw = doc.widthOfString(lbl);
      doc.text(lbl, cx + (scenColW - tw) / 2, curY + (SCENARIO_HDR_H - SCEN_HDR_SZ) / 2, {
        lineBreak: false,
      });
    });

    curY += SCENARIO_HDR_H;

    // ── Calendar rows ─────────────────────────────────────────────────────────
    weekends.forEach((wknd, rowIdx) => {
      // Month header
      if (wknd.month) {
        doc.rect(gridLeft, curY, gridW, MONTH_ROW_H).fill(C.navy);
        doc.font('Helvetica-Bold')
           .fontSize(MONTH_HDR_SZ)
           .fillColor('#ffffff')
           .text(wknd.month, gridLeft + 8, curY + (MONTH_ROW_H - MONTH_HDR_SZ) / 2, {
             lineBreak: false,
           });
        curY += MONTH_ROW_H;
      }

      // Determine row height: find max chip count across all scenario columns
      let maxChips = 0;
      columns.forEach((col) => {
        const placed = (col.placements && col.placements[wknd.key]) || [];
        if (placed.length > maxChips) maxChips = placed.length;
      });
      const chipStack = maxChips > 0
        ? maxChips * CHIP_H + (maxChips - 1) * CHIP_GAP + 8
        : 0;
      const rowH = Math.max(BASE_ROW_H, chipStack + (wknd.marker ? 12 : 0));

      // Alternating row background
      if (rowIdx % 2 === 1) {
        doc.rect(gridLeft, curY, gridW, rowH).fill(C.altRow);
      }

      // Date label
      doc.font('Helvetica')
         .fontSize(DATE_FONT_SZ)
         .fillColor(C.navy)
         .text(wknd.label, gridLeft + 4, curY + 6, {
           lineBreak: false,
           width: DATE_COL_W - 8,
         });

      // Holiday marker
      if (wknd.marker) {
        doc.font('Helvetica-Oblique')
           .fontSize(MARKER_FONT_SZ)
           .fillColor(C.markerText)
           .text(wknd.marker.text, gridLeft + 4, curY + 6 + DATE_FONT_SZ + 2, {
             lineBreak: false,
             width: DATE_COL_W - 8,
           });
      }

      // Chips per scenario column
      columns.forEach((col, ci) => {
        const placed = (col.placements && col.placements[wknd.key]) || [];
        const cx     = scenX(ci);
        const chipW  = scenColW - CHIP_PAD_X * 2;
        let chipY    = curY + 6;

        placed.forEach((evtId) => {
          const evt   = eventMap[evtId] || { name: evtId, type: 'csa' };
          const color = evt.type === 'us' ? C.gold : C.teal;
          chip(doc, cx + CHIP_PAD_X, chipY, chipW, CHIP_H, color, evt.name);
          chipY += CHIP_H + CHIP_GAP;
        });
      });

      // Bottom divider
      curY += rowH;
      doc.moveTo(gridLeft, curY)
         .lineTo(gridLeft + gridW, curY)
         .lineWidth(0.5)
         .stroke(C.divider);
    });

    doc.end();
  } catch (err) {
    console.error('PDF generation error:', err);
    if (!res.headersSent) res.status(500).send('PDF generation failed');
  }
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`CSA Scheduler running on port ${PORT}`));
