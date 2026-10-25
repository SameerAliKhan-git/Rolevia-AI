// Rolevia AI · Browser Automation Driver
// Modular Playwright driver for ATS interactions, diagnostic screenshots, and resilient page lifecycles.
// Uses local system Chrome/Edge or Chromium headless channels with graceful fallbacks.

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

class BrowserDriver {
  /**
   * Launches a Playwright browser instance with preferred system channels.
   * @param {Object} options
   * @param {boolean} [options.headless=true]
   * @returns {Promise<import('playwright').Browser>}
   */
  static async launchBrowser({ headless = true } = {}) {
    const channels = ['chrome', 'msedge', undefined];
    let lastError = null;

    for (const channel of channels) {
      try {
        const launchOpts = {
          headless,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-blink-features=AutomationControlled'
          ]
        };
        if (channel) launchOpts.channel = channel;
        const browser = await chromium.launch(launchOpts);
        return browser;
      } catch (err) {
        lastError = err;
      }
    }

    throw new Error(`Failed to launch browser across Chrome/Edge/Chromium: ${lastError ? lastError.message : 'Unknown error'}`);
  }

  /**
   * Initializes a fresh browser session (context + page) with standard headers.
   * @param {Object} options
   * @returns {Promise<{ browser: import('playwright').Browser, context: import('playwright').BrowserContext, page: import('playwright').Page }>}
   */
  static async createSession(options = {}) {
    const browser = await this.launchBrowser(options);
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 RoleviaAI/0.2.0',
      acceptDownloads: true,
      ignoreHTTPSErrors: true
    });

    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    page.setDefaultNavigationTimeout(20000);

    return { browser, context, page };
  }

  /**
   * Captures an evidence screenshot for audit ledgers and candidate verification.
   * @param {import('playwright').Page} page
   * @param {string} prefix
   * @returns {Promise<string>} Saved file path
   */
  static async captureEvidenceScreenshot(page, prefix = 'ats_step') {
    const evidenceDir = path.resolve(__dirname, '../../evidence/screenshots');
    if (!fs.existsSync(evidenceDir)) {
      fs.mkdirSync(evidenceDir, { recursive: true });
    }

    const filename = `${prefix}_${Date.now()}.png`;
    const fullPath = path.join(evidenceDir, filename);

    try {
      await page.screenshot({ path: fullPath, fullPage: true });
      return fullPath;
    } catch (err) {
      // Fallback viewport screenshot if fullPage fails
      try {
        await page.screenshot({ path: fullPath, fullPage: false });
        return fullPath;
      } catch (e) {
        return null;
      }
    }
  }

  /**
   * Gracefully closes a browser session.
   * @param {{ browser?: import('playwright').Browser, context?: import('playwright').BrowserContext, page?: import('playwright').Page }} session
   */
  static async safeClose(session) {
    if (!session) return;
    try {
      if (session.page && !session.page.isClosed()) await session.page.close();
    } catch (e) {}
    try {
      if (session.context) await session.context.close();
    } catch (e) {}
    try {
      if (session.browser && session.browser.isConnected()) await session.browser.close();
    } catch (e) {}
  }
}

module.exports = BrowserDriver;
