const puppeteer = require("puppeteer");

// PUPPETEER_EXECUTABLE_PATH lets local/dev environments point at an
// already-installed Chromium instead of puppeteer downloading its own
// (useful in sandboxes without a working download path); leave unset in a
// normal deployment to use puppeteer's bundled browser.
//
// `options.format` renders a standard fixed page (A4/A5). `options.width`
// renders a receipt-style page instead: Chromium's print-to-PDF engine
// does not honor CSS `@page { size: <width> auto }` for a content-driven
// height (it silently falls back to Letter), so instead the page is laid
// out at that physical width, its rendered height is measured in-browser,
// and that exact pixel height is passed to page.pdf() -- the same trick
// print-to-PDF libraries use for variable-length receipts.
async function renderHtmlToPdf(html, options = {}) {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox"],
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
  });
  try {
    const page = await browser.newPage();

    if (options.width && options.pixelWidth) {
      // scrollHeight reports max(content height, viewport height), so a
      // tall starting viewport (e.g. puppeteer's 800px default) would just
      // report 800px back for any shorter receipt instead of its real
      // height. Starting from a deliberately short viewport guarantees
      // what comes back is the content's own height.
      await page.setViewport({ width: options.pixelWidth, height: 50 });
      await page.setContent(html, { waitUntil: "networkidle0" });
      const heightPx = await page.evaluate(() => Math.ceil(document.documentElement.scrollHeight));
      return await page.pdf({ printBackground: true, width: options.width, height: `${heightPx}px` });
    }

    await page.setContent(html, { waitUntil: "networkidle0" });
    return await page.pdf({ printBackground: true, format: options.format || "A4" });
  } finally {
    await browser.close();
  }
}

module.exports = { renderHtmlToPdf };
