import puppeteer, { Browser, Page } from "puppeteer";
import fs from "fs";
import path from "path";

// ------------------------------------------------------------
// This is a headless, server-side adaptation of
// scripts/MES-scrape/mest-test.js for use from a Next.js API route.
//
// Key difference from the CLI script: we don't unconditionally launch a
// browser on every call. A saved session's token/cookies are checked
// directly against the MES API with a plain fetch first (validateSession).
// Puppeteer is only launched when we actually need to log in (no saved
// session, or the saved one is no longer valid) — so a "Cross Check MES"
// click with a still-valid session never spins up Chromium at all.
//
// It reuses the SAME session file the CLI script writes to
// (scripts/MES-scrape/mes-session.json), so a session captured by running
// the script once is immediately usable here too, and vice versa.
// ------------------------------------------------------------

const MES_URL = "https://mes.makuku.com";
const LOGIN_URL = `${MES_URL}/h5/login.html`;

const SESSION_FILE = path.join(process.cwd(), "scripts", "MES-scrape", "mes-session.json");

const ORG_ID = "13ENF4134414F00005CQ00TLL5BX1F04";
const ENTERPRISE_ID = "*";
const CULTURE = "zh-CN";

const MODULE_ID = "13EX6HLD72QF8002B4D8BTR6RDQ53ZF9";
const MODULE_PAGE = "/h5/pages/REPORT/QueryOfTagTransitRecords/index.html";

const API_URL = `${MES_URL}/api/QueryOfTagTransitRecords/getTagTransitRecordData`;

export type MesTagTransitRecord = {
  ID: string;
  LABEL_NO: string;
  MO_CODE: string;
  MITEM_CODE: string;
  MITEM_DESC: string;
  STATION_CODE: string;
  STATION_STR: string;
  WORKCENTER_CODE: string;
  LINE_NAME: string;
  WORKGROUP_NAME: string;
  REPORT_BILL_NO: string;
  STOCKIN_BILL_NO: string;
  LABEL_STOCK_QTY: number;
  LABEL_QTY: number;
  STATUS: string;
  STATUS_STR: string;
  DATETIME_CREATED: string;
};

type MesCookie = { name: string; value: string; [key: string]: unknown };

type MesSession = {
  token: string;
  orgid: string;
  cookies: MesCookie[];
  localStorage: Record<string, string>;
  savedAt: string;
};

// ------------------------------------------------------------
// SESSION FILE
// ------------------------------------------------------------

function loadSession(): MesSession | null {
  if (!fs.existsSync(SESSION_FILE)) return null;

  try {
    const data = JSON.parse(fs.readFileSync(SESSION_FILE, "utf8"));
    if (!data.token) return null;
    return data as MesSession;
  } catch {
    return null;
  }
}

function saveSession(session: MesSession) {
  fs.mkdirSync(path.dirname(SESSION_FILE), { recursive: true });
  fs.writeFileSync(SESSION_FILE, JSON.stringify(session, null, 2), "utf8");
}

// ------------------------------------------------------------
// API REQUEST
// ------------------------------------------------------------

function randomSource() {
  return Math.random().toString(36).substring(2, 8);
}

function buildApiUrl() {
  return `${API_URL}?timestamp=${Date.now()}&global_request_source=${randomSource()}`;
}

async function mesApiRequest(session: MesSession, payload: Record<string, unknown>) {
  const cookieHeader = (session.cookies || []).map((c) => `${c.name}=${c.value}`).join("; ");

  const headers: Record<string, string> = {
    token: session.token,
    orgid: session.orgid || ORG_ID,
    enterpriseid: ENTERPRISE_ID,
    culture: CULTURE,
    "content-type": "application/json; charset=utf-8",
    modulepage: MODULE_PAGE,
    moduleid: MODULE_ID,
    referer: `${MES_URL}${MODULE_PAGE}?vct=${Date.now()}&moduleId=${MODULE_ID}`,
    Accept: "application/json, text/plain, */*",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
  };
  if (cookieHeader) headers.Cookie = cookieHeader;

  const response = await fetch(buildApiUrl(), {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  const text = await response.text();

  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`MES API returned HTTP ${response.status} but response was not JSON.`);
  }

  return { httpStatus: response.status, data: json };
}

async function validateSession(session: MesSession): Promise<boolean> {
  try {
    const result = await mesApiRequest(session, {
      moCode: "",
      status: "",
      stockinBillNo: "",
      workcenterCode: "",
      stationCode: "",
      labelNo: "",
      mitemCode: "",
      beginTime: "",
      endTime: "",
      start: 0,
      length: 1,
    });

    const data = result.data;

    if (data?.success === false && data?.message?.code === "08") return false;
    if (result.httpStatus === 401 || result.httpStatus === 403) return false;

    return !!data && typeof data === "object";
  } catch {
    return false;
  }
}

// ------------------------------------------------------------
// LOGIN (only reached when there's no valid saved session)
// ------------------------------------------------------------

async function loginWithPuppeteer(): Promise<MesSession> {
  if (!process.env.MES_USERNAME || !process.env.MES_PASSWORD) {
    throw new Error("MES_USERNAME and MES_PASSWORD must be set in the environment.");
  }

  let browser: Browser | null = null;

  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page: Page = await browser.newPage();

    let capturedToken: string | null = null;
    page.on("request", (request) => {
      const headers = request.headers();
      if (headers.token) capturedToken = headers.token;
    });

    await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector(".input-username input", { timeout: 30000 });
    await page.waitForSelector(".input-password input", { timeout: 30000 });

    await page.click(".input-username input");
    await page.type(".input-username input", process.env.MES_USERNAME);

    await page.click(".input-password input");
    await page.type(".input-password input", process.env.MES_PASSWORD);

    await page.click("button.el-button--primary");

    try {
      await page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 60000 });
    } catch {
      // MES sometimes redirects via client-side JS without a "real"
      // navigation event — the fixed wait below covers that case.
    }

    await new Promise((resolve) => setTimeout(resolve, 4000));

    if (page.url().includes("/login.html")) {
      throw new Error("MES login failed — check MES_USERNAME/MES_PASSWORD.");
    }

    let token: string | null = capturedToken;
    if (!token) {
      token = await page.evaluate(() => {
        const keys = ["token", "Token", "TOKEN", "accessToken", "access_token", "Authorization", "authorization"];
        for (const key of keys) {
          const value = localStorage.getItem(key);
          if (value) return value;
        }
        return null;
      });
    }

    if (!token) throw new Error("MES login succeeded, but no auth token could be captured.");

    const cookies = (await page.cookies()) as unknown as MesCookie[];

    let localStorageData: Record<string, string> = {};
    try {
      localStorageData = await page.evaluate(() => {
        const result: Record<string, string> = {};
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key) result[key] = localStorage.getItem(key) ?? "";
        }
        return result;
      });
    } catch {
      // Non-fatal — cookies + token are enough to make API requests.
    }

    const session: MesSession = {
      token,
      orgid: ORG_ID,
      cookies,
      localStorage: localStorageData,
      savedAt: new Date().toISOString(),
    };

    saveSession(session);
    return session;
  } finally {
    if (browser) await browser.close();
  }
}

async function ensureSession(): Promise<MesSession> {
  const saved = loadSession();
  if (saved && (await validateSession(saved))) return saved;
  return loginWithPuppeteer();
}

// ------------------------------------------------------------
// EXTRACT RECORD ARRAY (MES's response shape has drifted before)
// ------------------------------------------------------------

function extractRecords(response: any): MesTagTransitRecord[] {
  // MES's real response shape is:
  //   { success, message, data: { Success, Data: { recordsTotal, data: [...] } } }
  // i.e. one level deeper than a first glance suggests, and capitalized
  // ("Data", not "data") at that middle level. The other shapes below are
  // kept as fallbacks in case MES changes casing/nesting again.
  const candidates: unknown[] = [
    response?.data?.Data?.data,
    response?.data?.Data?.rows,
    response?.data?.Data?.list,
    response?.data?.data,
    response?.data?.rows,
    response?.data?.list,
    response?.data,
    response?.rows,
    response?.list,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate as MesTagTransitRecord[];
  }
  return [];
}

// ------------------------------------------------------------
// PUBLIC ENTRY POINT
// ------------------------------------------------------------

async function fetchAllPages(session: MesSession, moCode: string): Promise<MesTagTransitRecord[]> {
  const allRecords: MesTagTransitRecord[] = [];
  let start = 0;
  const length = 100;
  let totalRecords: number | null = null;

  while (true) {
    const result = await mesApiRequest(session, {
      moCode: moCode || "",
      status: "",
      stockinBillNo: "",
      workcenterCode: "",
      stationCode: "",
      labelNo: "",
      mitemCode: "",
      beginTime: "",
      endTime: "",
      start,
      length,
    });

    const response = result.data;
    if (!response) throw new Error("MES returned an empty response.");

    if (response.success === false && response.message?.code === "08") {
      throw new Error("MES_SESSION_EXPIRED");
    }

    const possibleTotals = [
      response.recordsTotal,
      response.recordsFiltered,
      response.data?.recordsTotal,
      response.data?.recordsFiltered,
      response.data?.Data?.recordsTotal,
      response.data?.Data?.recordsFiltered,
      response.data?.data?.recordsTotal,
      response.data?.data?.recordsFiltered,
    ];
    for (const value of possibleTotals) {
      if (value !== undefined && value !== null && !Number.isNaN(Number(value))) {
        totalRecords = Number(value);
        break;
      }
    }

    const records = extractRecords(response);
    allRecords.push(...records);

    if (totalRecords !== null && allRecords.length >= totalRecords) break;
    if (records.length < length) break;
    start += length;
  }

  return allRecords;
}

/**
 * Fetch every Tag Transit Record MES has for a given MO / work order number.
 * Handles session reuse, login-when-needed, and a single retry if the
 * session expires mid-query.
 */
export async function getMesTagTransitRecords(moCode: string): Promise<MesTagTransitRecord[]> {
  let session = await ensureSession();

  try {
    return await fetchAllPages(session, moCode);
  } catch (err) {
    if (err instanceof Error && err.message === "MES_SESSION_EXPIRED") {
      session = await loginWithPuppeteer();
      return await fetchAllPages(session, moCode);
    }
    throw err;
  }
}