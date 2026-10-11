#!/usr/bin/env node
/**
 * waf.js — AWS WAF bypass for europarl.europa.eu
 *
 * Uses puppeteer-core + system Chromium to solve the JS challenge
 * and obtain the aws-waf-token cookie. Provides a download function
 * that uses Node's built-in https module with Firefox-mimicking
 * TLS fingerprint to avoid JA3/JA4 detection.
 *
 * Usage:
 *   const { wafRequest, getWafToken } = require("./waf");
 *   const { body } = await wafRequest("GET", "https://...");
 */

const puppeteer = require("puppeteer-core");
const fs = require("fs");
const path = require("path");
const os = require("os");
const tls = require("tls");
const https = require("https");
const { URL } = require("url");

// ── Configuration ─────────────────────────────────────────────────────

const CHROMIUM_PATH = "/usr/bin/chromium-browser";
const CHALLENGE_URL =
  "https://www.europarl.europa.eu/doceo/document/PV-10-2024-07-17-RCV_EN.xml";
const TOKEN_FILE = path.join(os.tmpdir(), "ep-aws-waf-token");

// Firefox 147 cipher suite (same as HowTheyVote)
const FIREFOX_CIPHERS = [
  "TLS_AES_128_GCM_SHA256",
  "TLS_CHACHA20_POLY1305_SHA256",
  "TLS_AES_256_GCM_SHA384",
  "ECDHE-ECDSA-AES128-GCM-SHA256",
  "ECDHE-RSA-AES128-GCM-SHA256",
  "ECDHE-ECDSA-CHACHA20-POLY1305",
  "ECDHE-RSA-CHACHA20-POLY1305",
  "ECDHE-ECDSA-AES256-GCM-SHA384",
  "ECDHE-RSA-AES256-GCM-SHA384",
  "ECDHE-ECDSA-AES256-SHA",
  "ECDHE-RSA-AES256-SHA",
  "ECDHE-ECDSA-AES128-SHA",
  "ECDHE-RSA-AES128-SHA",
  "AES128-GCM-SHA256",
  "AES256-GCM-SHA384",
  "AES256-SHA",
  "AES128-SHA",
].join(":");

// Firefox 147 default request headers
const FIREFOX_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:147.0) Gecko/20100101 Firefox/147.0",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  "Upgrade-Insecure-Requests": "1",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  Priority: "u=0, i",
  Te: "trailers",
};

// ── TLS Fingerprint Agent ─────────────────────────────────────────────

/** Create a custom https.Agent mimicking Firefox 147's TLS fingerprint. */
function createFirefoxAgent() {
  return new https.Agent({
    ciphers: FIREFOX_CIPHERS,
    honorCipherOrder: true,
    secureOptions: tls.SSL_OP_NO_TICKET,
    ALPNProtocols: ["h2", "http/1.1"],
  });
}

// ── WAF Token Management ──────────────────────────────────────────────

/** Get a cached or freshly solved aws-waf-token. */
async function getWafToken(force = false) {
  if (!force && fs.existsSync(TOKEN_FILE)) {
    const cached = fs.readFileSync(TOKEN_FILE, "utf-8").trim();
    if (cached) return cached;
  }

  const token = await solveWafChallenge();
  fs.mkdirSync(path.dirname(TOKEN_FILE), { recursive: true });
  fs.writeFileSync(TOKEN_FILE, token, "utf-8");
  return token;
}

/** Solve the AWS WAF JS challenge using headless Chromium. */
async function solveWafChallenge() {
  const browser = await puppeteer.launch({
    executablePath: CHROMIUM_PATH,
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1560, height: 1644 });
    await page._client().send("Network.clearBrowserCookies");
    await page.goto(CHALLENGE_URL, {
      waitUntil: "networkidle0",
      timeout: 20000,
    });

    const cookies = await page.cookies();
    const wafCookie = cookies.find((c) => c.name === "aws-waf-token");

    if (!wafCookie || !wafCookie.value) {
      throw new Error(
        "AWS WAF challenge did not set aws-waf-token cookie. " +
          "Cookies found: " +
          cookies.map((c) => c.name).join(", ")
      );
    }
    return wafCookie.value;
  } finally {
    await browser.close();
  }
}

/** Clear the cached WAF token. */
function clearWafToken() {
  if (fs.existsSync(TOKEN_FILE)) fs.unlinkSync(TOKEN_FILE);
}

// ── Persistent Browser Pool ───────────────────────────────────────────

let _browser = null;
let _browserPage = null;
let _browserRefCount = 0;

/**
 * Get or create a shared headless Chromium instance.
 * The browser is kept alive across calls and closed on process exit.
 */
async function getBrowser() {
  if (!_browser) {
    _browser = await puppeteer.launch({
      executablePath: CHROMIUM_PATH,
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-gpu",
        "--disable-dev-shm-usage",
      ],
    });

    // Create a single page and solve the WAF challenge once
    _browserPage = await _browser.newPage();
    await _browserPage.setViewport({ width: 1560, height: 1644 });
    await _browserPage._client().send("Network.clearBrowserCookies");
    await _browserPage.goto(CHALLENGE_URL, {
      waitUntil: "networkidle0",
      timeout: 20000,
    });

    // Detach browser so it exits when the Node process ends
    _browser.on("disconnected", () => {
      _browser = null;
    });

    // On SIGINT/SIGTERM, close browser properly then exit
    const onSignal = async () => {
      await closeBrowser();
      process.exit(0);
    };
    process.on("SIGINT", onSignal);
    process.on("SIGTERM", onSignal);
  }
  return { browser: _browser, page: _browserPage };
}

// ── Browser-based Download ────────────────────────────────────────────

/**
 * Download a URL using the shared headless Chromium instance.
 *
 * The browser solves the AWS WAF JS challenge once and reuses the
 * session cookies (including aws-waf-token) for all subsequent calls.
 * This is much faster than launching a new browser per request.
 *
 * @param {string} url - Full URL to download
 * @param {object} [opts]
 * @param {number} [opts.timeout=15000] - Per-fetch timeout in ms
 * @returns {{ status: number, body: string, url: string }}
 */
async function downloadViaBrowser(url, opts = {}) {
  const timeout = opts.timeout || 15000;
  const { page } = await getBrowser();

  // Use fetch() from the browser context (reuses WAF cookies)
  let result = await page.evaluate(
    async (targetUrl, fetchTimeout) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), fetchTimeout);
      try {
        const resp = await fetch(targetUrl, { signal: controller.signal });
        const text = await resp.text();
        return { status: resp.status, body: text };
      } finally {
        clearTimeout(timer);
      }
    },
    url,
    timeout
  );

  // If the WAF token expired (HTTP 202), re-solve the challenge and retry once
  if (result.status === 202) {
    console.warn("   ⏳ WAF token expired, re-solving challenge…");
    await page.goto(CHALLENGE_URL, {
      waitUntil: "networkidle0",
      timeout: 20000,
    });
    result = await page.evaluate(
      async (targetUrl, fetchTimeout) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), fetchTimeout);
        try {
          const resp = await fetch(targetUrl, { signal: controller.signal });
          const text = await resp.text();
          return { status: resp.status, body: text };
        } finally {
          clearTimeout(timer);
        }
      },
      url,
      timeout
    );
  }

  return { status: result.status, body: result.body, url };
}

/** Close the shared browser instance (e.g. after a batch completes). */
async function closeBrowser() {
  if (_browser) {
    const proc = _browser.process();
    const pid = proc && proc.pid;

    // Force-kill the browser process tree directly (snap Chromium often
    // hangs on graceful close()).  The PID from puppeteer is the snap
    // wrapper, so we also need to find and kill the actual browser.
    if (pid) {
      try {
        process.kill(-pid, "SIGKILL");
      } catch {} // negative PID = process group
      try {
        process.kill(pid, "SIGKILL");
      } catch {}
      // Also kill any remaining chrome processes from this session
      try {
        require("child_process").execSync(
          'pkill -f "headless.*puppeteer" 2>/dev/null',
          { stdio: "ignore" }
        );
      } catch {}
    }

    _browser = null;
    _browserPage = null;
  }
}

// ── Module Exports ────────────────────────────────────────────────────

module.exports = {
  createFirefoxAgent,
  getWafToken,
  clearWafToken,
  solveWafChallenge,
  downloadViaBrowser,
  closeBrowser,
  FIREFOX_HEADERS,
  CHROMIUM_PATH,
  TOKEN_FILE,
};
