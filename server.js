const express  = require('express');
const path     = require('path');
const puppeteer = require('puppeteer');
const app      = express();

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// PDF generation endpoint — receives full HTML, returns clean PDF
app.post('/generate-pdf', async (req, res) => {
  const { html, filename } = req.body;
  if (!html) return res.status(400).send('Missing html');

  let browser;
  try {
    browser = await puppeteer.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      headless: true,
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });

    const pdf = await page.pdf({
      format:           'A4',
      landscape:        true,
      printBackground:  true,
      margin:           { top: '0.4in', right: '0.4in', bottom: '0.4in', left: '0.4in' },
      displayHeaderFooter: false,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename || 'CSA-Schedule.pdf'}"`);
    res.send(pdf);
  } catch (err) {
    console.error('PDF generation error:', err);
    res.status(500).send('PDF generation failed');
  } finally {
    if (browser) await browser.close();
  }
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`CSA Scheduler running on port ${PORT}`));
