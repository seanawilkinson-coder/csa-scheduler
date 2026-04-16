const express    = require('express');
const path       = require('path');
const puppeteer  = require('puppeteer');
const app        = express();

app.use(express.json({ limit: '20mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── Persistent browser — launched once, reused for every request ──────────────
let browser;
async function getBrowser() {
  if (!browser || !browser.connected) {
    browser = await puppeteer.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      headless: true,
    });
  }
  return browser;
}
// Warm up on start
getBrowser().catch(console.error);

// ── PDF generation ─────────────────────────────────────────────────────────────
app.post('/generate-pdf', async (req, res) => {
  const { html, filename = 'CSA-Schedule.pdf' } = req.body;
  if (!html) return res.status(400).send('Missing html');

  let page;
  try {
    const b = await getBrowser();
    page = await b.newPage();

    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 15000 });

    // Hide any UI artifacts that shouldn't appear in the PDF
    await page.addStyleTag({ content: `
      .drop-placeholder, [data-placeholder], .chip-remove,
      .drop-zone:empty::after, .drop-zone > .drop-hint { display: none !important; }
      * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    `});

    const pdf = await page.pdf({
      format:              'A4',
      landscape:           true,
      printBackground:     true,
      displayHeaderFooter: false,
      margin:              { top: '0.4in', right: '0.3in', bottom: '0.4in', left: '0.3in' },
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdf);
  } catch (err) {
    console.error('PDF error:', err);
    res.status(500).send('PDF generation failed');
  } finally {
    if (page) await page.close();
  }
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`CSA Scheduler on port ${PORT}`));
