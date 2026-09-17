const puppeteer = require("puppeteer");
const logger = require("../utils/logger");

// PUPPETEER_EXECUTABLE_PATH lets local/dev environments point at an
// already-installed Chromium instead of puppeteer downloading its own
// (useful in sandboxes without a working download path); leave unset in a
// normal deployment to use puppeteer's bundled browser.

// Launching Chromium from scratch takes 0.5-2s+ depending on hardware --
// by far the dominant cost of generating a PDF, dwarfing the render itself.
// Every bill and KOT print used to pay that cost fresh (KOT especially,
// since it deliberately isn't cached -- see orderController.getOrderKotPdf).
// One browser process is launched lazily on first use and kept alive for
// the life of the server; each request only opens/closes a page, which is
// cheap (~10-50ms).
let browserPromise = null;

function launchBrowser() {
  return puppeteer.launch({
    headless: true,
    args: ["--no-sandbox"],
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
  });
}

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = launchBrowser();
    browserPromise
      .then((browser) => {
        // Chromium can crash or get killed under memory pressure -- drop the
        // cached instance so the next request relaunches instead of every
        // subsequent PDF request failing against a dead browser forever.
        browser.on("disconnected", () => {
          logger.warn("pdf.browser_disconnected");
          browserPromise = null;
        });
      })
      .catch((err) => {
        logger.error("pdf.browser_launch_failed", { error: err.message });
        browserPromise = null;
      });
  }
  return browserPromise;
}

// `options.format` renders a standard fixed page (A4/A5). `options.width`
// renders a receipt-style page instead: Chromium's print-to-PDF engine
// does not honor CSS `@page { size: <width> auto }` for a content-driven
// height (it silently falls back to Letter), so instead the page is laid
// out at that physical width, its rendered height is measured in-browser,
// and that exact pixel height is passed to page.pdf() -- the same trick
// print-to-PDF libraries use for variable-length receipts.
async function renderHtmlToPdf(html, options = {}) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    // Every bill/KOT template is fully self-contained (inline CSS, a logo
    // already inlined as a data URI -- see billController's logoDataUri) --
    // nothing it renders ever makes a network request, so there's nothing
    // for "networkidle0" to usefully wait out beyond its own ~500ms settle
    // window. domcontentloaded reflects exactly when the content is actually
    // ready here, without that fixed delay on every single render.
    if (options.width && options.pixelWidth) {
      // scrollHeight reports max(content height, viewport height), so a
      // tall starting viewport (e.g. puppeteer's 800px default) would just
      // report 800px back for any shorter receipt instead of its real
      // height. Starting from a deliberately short viewport guarantees
      // what comes back is the content's own height.
      await page.setViewport({ width: options.pixelWidth, height: 50 });
      await page.setContent(html, { waitUntil: "domcontentloaded" });
      const heightPx = await page.evaluate(() => Math.ceil(document.documentElement.scrollHeight));
      return await page.pdf({ printBackground: true, width: options.width, height: `${heightPx}px` });
    }

    await page.setContent(html, { waitUntil: "domcontentloaded" });
    return await page.pdf({ printBackground: true, format: options.format || "A4" });
  } finally {
    await page.close();
  }
}

// Lets the server close the persistent browser cleanly on shutdown instead
// of leaving it to be force-killed alongside the process.
async function closeBrowser() {
  if (!browserPromise) return;
  const promise = browserPromise;
  browserPromise = null;
  try {
    const browser = await promise;
    await browser.close();
  } catch {
    // Already dead or never launched -- nothing to clean up.
  }
}

module.exports = { renderHtmlToPdf, closeBrowser };
