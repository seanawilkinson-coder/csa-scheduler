const express = require('express');
const path    = require('path');
const fs      = require('fs');
const crypto  = require('crypto');
const PDFDocument = require('pdfkit');
const app     = express();

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/portal', (req, res) => res.sendFile(path.join(__dirname, 'public', 'portal.html')));

// ── Legislative portal persistence + passwordless development auth ──────────
// The JSON store keeps this slice runnable without provisioning Supabase first.
// The API boundary is intentionally shaped so the store can be replaced later.
const DATA_FILE = path.join(__dirname, 'data', 'portal-data.json');
const sessions = new Map();
const loginCodes = new Map();

function readPortalData() {
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function writePortalData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2) + '\n');
}

function getSession(req) {
  const cookie = req.headers.cookie || '';
  const match = cookie.match(/(?:^|; )csa_session=([^;]+)/);
  return match ? sessions.get(match[1]) : null;
}

function requireSession(req, res, next) {
  const session = getSession(req);
  if (!session) return res.status(401).json({ error: 'Sign-in required' });
  req.user = session;
  next();
}

function requireCommissioner(req, res, next) {
  if (req.user.role !== 'commissioner') return res.status(403).json({ error: 'Commissioner permission required' });
  next();
}

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role, programs: user.programs };
}

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'csa-legislative-portal', persistence: 'json' }));

app.get('/api/auth/me', (req, res) => {
  const session = getSession(req);
  if (!session) return res.status(401).json({ error: 'Not signed in' });
  res.json({ user: session });
});

app.post('/api/auth/request-code', (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const data = readPortalData();
  const user = data.users.find(item => item.email.toLowerCase() === email);
  // Keep the response generic for unknown emails; only approved users receive a code.
  if (!user) return res.json({ sent: true });
  const code = String(crypto.randomInt(100000, 1000000));
  loginCodes.set(email, { code, expires: Date.now() + 10 * 60 * 1000 });
  const response = { sent: true };
  if (process.env.NODE_ENV !== 'production') response.devCode = code;
  res.json(response);
});

app.post('/api/auth/verify-code', (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const code = String(req.body.code || '').trim();
  const pending = loginCodes.get(email);
  if (!pending || pending.expires < Date.now() || pending.code !== code) return res.status(401).json({ error: 'Invalid or expired code' });
  const data = readPortalData();
  const user = data.users.find(item => item.email.toLowerCase() === email);
  if (!user) return res.status(401).json({ error: 'This email is not approved for CSA Portal access' });
  loginCodes.delete(email);
  const token = crypto.randomBytes(32).toString('hex');
  const session = publicUser(user);
  sessions.set(token, session);
  res.setHeader('Set-Cookie', `csa_session=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=28800`);
  res.json({ user: session });
});

app.post('/api/auth/logout', (req, res) => {
  const cookie = req.headers.cookie || '';
  const match = cookie.match(/(?:^|; )csa_session=([^;]+)/);
  if (match) sessions.delete(match[1]);
  res.setHeader('Set-Cookie', 'csa_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0');
  res.json({ ok: true });
});

app.get('/api/proposals', requireSession, (req, res) => {
  const data = readPortalData();
  res.json(data.proposals);
});

app.post('/api/proposals', requireSession, (req, res) => {
  const data = readPortalData();
  const body = req.body || {};
  const proposal = {
    ...body,
    id: `p${Date.now()}`,
    proposer: req.user.name,
    status: 'review',
    statusLabel: 'Staff review',
    next: 'CSA staff review',
    comments: [],
    audit: [{ event: 'Proposal submitted', by: req.user.name, at: 'Just now' }],
    activity: 'Submitted for staff review',
    time: 'Just now'
  };
  data.proposals.unshift(proposal);
  writePortalData(data);
  res.status(201).json(proposal);
});

app.patch('/api/proposals/:id', requireSession, requireCommissioner, (req, res) => {
  const data = readPortalData();
  const proposal = data.proposals.find(item => item.id === req.params.id);
  if (!proposal) return res.status(404).json({ error: 'Proposal not found' });
  const allowed = ['bucket', 'status', 'statusLabel', 'next', 'activity', 'time', 'reviewReason', 'audit'];
  allowed.forEach(key => { if (Object.prototype.hasOwnProperty.call(req.body, key)) proposal[key] = req.body[key]; });
  writePortalData(data);
  res.json(proposal);
});

app.post('/api/proposals/:id/comments', requireSession, (req, res) => {
  const data = readPortalData();
  const proposal = data.proposals.find(item => item.id === req.params.id);
  if (!proposal) return res.status(404).json({ error: 'Proposal not found' });
  if (proposal.status !== 'comment') return res.status(409).json({ error: 'Comment window is closed' });
  const text = String(req.body.text || '').trim();
  if (!text) return res.status(400).json({ error: 'Comment text is required' });
  proposal.comments.push({ author: req.user.name, date: 'Just now', text });
  proposal.activity = `Comment added by ${req.user.name}`;
  proposal.time = 'Just now';
  proposal.audit = [...(proposal.audit || []), { event: 'Comment added', by: req.user.name, at: 'Just now' }];
  writePortalData(data);
  res.status(201).json(proposal);
});

app.delete('/api/proposals/:id/comments/:index', requireSession, (req, res) => {
  const data = readPortalData();
  const proposal = data.proposals.find(item => item.id === req.params.id);
  const index = Number(req.params.index);
  if (!proposal || !proposal.comments[index]) return res.status(404).json({ error: 'Comment not found' });
  const comment = proposal.comments[index];
  const isOwner = comment.author === req.user.name;
  if (!isOwner && req.user.role !== 'commissioner') return res.status(403).json({ error: 'You may only remove your own comments' });
  const reason = String(req.body.reason || (isOwner ? 'Removed by commenter' : '')).trim();
  if (req.user.role === 'commissioner' && !reason) return res.status(400).json({ error: 'A moderation reason is required' });
  comment.removed = true;
  comment.originalText = comment.text;
  comment.removedBy = req.user.name;
  comment.removedReason = reason;
  proposal.audit = [...(proposal.audit || []), { event: 'Comment removed', by: req.user.name, at: 'Just now', reason }];
  proposal.activity = 'Comment removed from visible thread';
  proposal.time = 'Just now';
  writePortalData(data);
  res.json(proposal);
});

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
