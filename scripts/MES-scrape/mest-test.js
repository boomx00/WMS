require("dotenv").config();

const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");

const MES_URL = "https://mes.makuku.com";
const LOGIN_URL = `${MES_URL}/h5/login.html`;
const PORTAL_URL = `${MES_URL}/h5/portal.html`;

const SESSION_FILE = path.join(__dirname, "mes-session.json");

const ORG_ID = "13ENF4134414F00005CQ00TLL5BX1F04";
const ENTERPRISE_ID = "*";
const CULTURE = "zh-CN";

const MODULE_ID = "13EX6HLD72QF8002B4D8BTR6RDQ53ZF9";
const MODULE_PAGE =
  "/h5/pages/REPORT/QueryOfTagTransitRecords/index.html";

const API_URL =
  `${MES_URL}/api/QueryOfTagTransitRecords/getTagTransitRecordData`;

// ------------------------------------------------------------
// SESSION FILE
// ------------------------------------------------------------

function loadSession() {
  if (!fs.existsSync(SESSION_FILE)) {
    return null;
  }

  try {
    const data = JSON.parse(fs.readFileSync(SESSION_FILE, "utf8"));

    if (!data.token) {
      console.log("Saved session has no token.");
      return null;
    }

    return data;
  } catch (err) {
    console.log("Could not read session file:", err.message);
    return null;
  }
}

function saveSession(session) {
  fs.writeFileSync(
    SESSION_FILE,
    JSON.stringify(session, null, 2),
    "utf8"
  );

  console.log("MES session saved.");
}

// ------------------------------------------------------------
// RANDOM REQUEST SOURCE
// ------------------------------------------------------------

function randomSource() {
  return Math.random().toString(36).substring(2, 8);
}

// ------------------------------------------------------------
// BUILD API URL
// ------------------------------------------------------------

function buildApiUrl() {
  const timestamp = Date.now();
  const globalRequestSource = randomSource();

  return (
    `${API_URL}` +
    `?timestamp=${timestamp}` +
    `&global_request_source=${globalRequestSource}`
  );
}

// ------------------------------------------------------------
// LOGIN
// ------------------------------------------------------------

async function login(page) {
  console.log("");
  console.log("========================================");
  console.log("Logging into MES...");
  console.log("========================================");

  if (!process.env.MES_USERNAME || !process.env.MES_PASSWORD) {
    throw new Error(
      "MES_USERNAME and MES_PASSWORD must exist in .env"
    );
  }

  await page.goto(LOGIN_URL, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });

  await page.waitForSelector(".input-username input", {
    timeout: 30000,
  });

  await page.waitForSelector(".input-password input", {
    timeout: 30000,
  });

  await page.click(".input-username input");
  await page.type(
    ".input-username input",
    process.env.MES_USERNAME
  );

  await page.click(".input-password input");
  await page.type(
    ".input-password input",
    process.env.MES_PASSWORD
  );

  console.log("Submitting MES login...");

  await page.click("button.el-button--primary");

  // Wait for either navigation or the login request to finish.
  try {
    await page.waitForNavigation({
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
  } catch (err) {
    console.log("Navigation wait finished:", err.message);
  }

  // Give MES JS time to finish redirecting.
  await new Promise((resolve) => setTimeout(resolve, 4000));

  console.log("Current URL:", page.url());

  if (page.url().includes("/login.html")) {
    throw new Error(
      "MES login failed. Still on login page."
    );
  }

  // ----------------------------------------------------------
  // Capture token from requests
  // ----------------------------------------------------------

  let token = null;

  // The token should have been captured by request listener.
  if (page.__mesToken) {
    token = page.__mesToken;
  }

  // Sometimes token is stored in localStorage.
  if (!token) {
    try {
      token = await page.evaluate(() => {
        const possibleKeys = [
          "token",
          "Token",
          "TOKEN",
          "accessToken",
          "access_token",
          "Authorization",
          "authorization",
        ];

        for (const key of possibleKeys) {
          const value = localStorage.getItem(key);

          if (value) {
            return value;
          }
        }

        return null;
      });
    } catch (err) {
      console.log(
        "Could not inspect localStorage:",
        err.message
      );
    }
  }

  if (!token) {
    throw new Error(
      "Login succeeded, but MES token could not be captured."
    );
  }

  // ----------------------------------------------------------
  // Capture cookies
  // ----------------------------------------------------------

  const cookies = await page.cookies();

  // ----------------------------------------------------------
  // Capture localStorage
  // ----------------------------------------------------------

  let localStorageData = {};

  try {
    localStorageData = await page.evaluate(() => {
      const result = {};

      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);

        if (key) {
          result[key] = localStorage.getItem(key);
        }
      }

      return result;
    });
  } catch (err) {
    console.log(
      "Could not capture localStorage:",
      err.message
    );
  }

  // ----------------------------------------------------------
  // Save everything
  // ----------------------------------------------------------

  const session = {
    token,
    orgid: ORG_ID,
    cookies,
    localStorage: localStorageData,
    savedAt: new Date().toISOString(),
  };

  saveSession(session);

  console.log("MES login successful.");
  console.log("Token captured:", token.substring(0, 12) + "...");
  console.log("Cookies saved:", cookies.length);

  return session;
}

// ------------------------------------------------------------
// RESTORE SESSION
// ------------------------------------------------------------

async function restoreSession(page, session) {
  console.log("");
  console.log("Restoring saved MES session...");

  // First visit the MES domain so localStorage is available.
  await page.goto(MES_URL, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });

  // Restore cookies.
  if (session.cookies && session.cookies.length > 0) {
    await page.setCookie(...session.cookies);
    console.log(
      `Restored ${session.cookies.length} cookies.`
    );
  }

  // Restore localStorage.
  if (
    session.localStorage &&
    Object.keys(session.localStorage).length > 0
  ) {
    try {
      await page.evaluate((storage) => {
        for (const [key, value] of Object.entries(storage)) {
          localStorage.setItem(key, value);
        }
      }, session.localStorage);

      console.log(
        `Restored ${
          Object.keys(session.localStorage).length
        } localStorage values.`
      );
    } catch (err) {
      console.log(
        "Could not restore localStorage:",
        err.message
      );
    }
  }

  page.__mesToken = session.token;

  console.log("Saved MES token restored.");

  // Now go directly to portal.
  await page.goto(PORTAL_URL, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });

  // Give MES time to perform any authentication checks.
  await new Promise((resolve) => setTimeout(resolve, 4000));

  console.log("After restore URL:", page.url());

  // If MES redirected to login, session is invalid.
  if (page.url().includes("/login.html")) {
    console.log("Saved MES session is expired.");
    return false;
  }

  return true;
}

// ------------------------------------------------------------
// API REQUEST
// ------------------------------------------------------------

async function mesApiRequest(session, payload) {
  const url = buildApiUrl();

  const cookieHeader = (session.cookies || [])
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ");

  const headers = {
    token: session.token,
    orgid: session.orgid || ORG_ID,
    enterpriseid: ENTERPRISE_ID,
    culture: CULTURE,

    "content-type": "application/json; charset=utf-8",

    modulepage: MODULE_PAGE,
    moduleid: MODULE_ID,

    referer:
      `${MES_URL}${MODULE_PAGE}` +
      `?vct=${Date.now()}&moduleId=${MODULE_ID}`,

    Cookie: cookieHeader,

    Accept: "application/json, text/plain, */*",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
      "AppleWebKit/537.36 (KHTML, like Gecko) " +
      "Chrome/140.0.0.0 Safari/537.36",
  };

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  const text = await response.text();

  let json;

  try {
    json = JSON.parse(text);
  } catch (err) {
    console.log("");
    console.log("MES returned non-JSON:");
    console.log(text.substring(0, 2000));

    throw new Error(
      `MES API returned HTTP ${response.status} but response was not JSON.`
    );
  }

  return {
    httpStatus: response.status,
    data: json,
  };
}

// ------------------------------------------------------------
// VALIDATE SESSION
// ------------------------------------------------------------

async function validateSession(session) {
  console.log("Checking saved MES session...");

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

    console.log(
      "Session check HTTP status:",
      result.httpStatus
    );

    const data = result.data;

    // MES's known expired-session response.
    if (
      data &&
      data.success === false &&
      data.message &&
      data.message.code === "08"
    ) {
      console.log("MES says session is expired.");
      return false;
    }

    if (
      result.httpStatus === 401 ||
      result.httpStatus === 403
    ) {
      console.log("MES returned unauthorized.");
      return false;
    }

    // If we received a normal MES response, session works.
    if (data && typeof data === "object") {
      console.log("Saved MES session appears valid.");
      return true;
    }

    return false;
  } catch (err) {
    console.log(
      "Session validation failed:",
      err.message
    );

    return false;
  }
}

// ------------------------------------------------------------
// ENSURE SESSION
// ------------------------------------------------------------

async function ensureSession(page) {
  let session = loadSession();

  if (session) {
    console.log("");
    console.log(
      "Found saved MES session from:",
      session.savedAt
    );

    // Restore browser state.
    try {
      const restored = await restoreSession(
        page,
        session
      );

      if (!restored) {
        console.log(
          "Browser session expired."
        );
      } else {
        // Validate directly against API.
        const valid = await validateSession(session);

        if (valid) {
          console.log("");
          console.log(
            "========================================"
          );
          console.log(
            "USING EXISTING MES SESSION"
          );
          console.log(
            "NO LOGIN REQUIRED"
          );
          console.log(
            "========================================"
          );

          return session;
        }

        console.log(
          "Saved token is no longer valid."
        );
      }
    } catch (err) {
      console.log(
        "Could not restore saved session:",
        err.message
      );
    }
  } else {
    console.log("No saved MES session found.");
  }

  // ----------------------------------------------------------
  // Only reach here when session is actually invalid.
  // ----------------------------------------------------------

  console.log("");
  console.log(
    "No valid MES session. Logging in..."
  );

  return await login(page);
}

// ------------------------------------------------------------
// EXTRACT RECORD ARRAY
// ------------------------------------------------------------

function extractRecords(response) {
  if (!response) {
    return [];
  }

  // ----------------------------------------------------------
  // Most likely MES structure
  // ----------------------------------------------------------

  if (Array.isArray(response.data)) {
    return response.data;
  }

  // Some MES responses:
  // { data: { data: [...] } }

  if (
    response.data &&
    Array.isArray(response.data.data)
  ) {
    return response.data.data;
  }

  // { data: { rows: [...] } }

  if (
    response.data &&
    Array.isArray(response.data.rows)
  ) {
    return response.data.rows;
  }

  // { data: { list: [...] } }

  if (
    response.data &&
    Array.isArray(response.data.list)
  ) {
    return response.data.list;
  }

  // { rows: [...] }

  if (Array.isArray(response.rows)) {
    return response.rows;
  }

  // { list: [...] }

  if (Array.isArray(response.list)) {
    return response.list;
  }

  return [];
}

// ------------------------------------------------------------
// GET TAG TRANSIT RECORDS
// ------------------------------------------------------------

async function getTagTransitRecords(session, moCode) {
  console.log("");
  console.log(
    `Querying Tag Transit Records for ${moCode}...`
  );

  const allRecords = [];

  let start = 0;
  const length = 100;

  let totalRecords = null;

  while (true) {
    console.log(
      `Fetching records ${start + 1} - ${start + length}...`
    );

    const payload = {
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
    };

    const result = await mesApiRequest(
      session,
      payload
    );

    console.log(
      "HTTP status:",
      result.httpStatus
    );

    // --------------------------------------------------------
    // IMPORTANT:
    // Print response structure when debugging.
    // --------------------------------------------------------

    const response = result.data;

    if (!response) {
      throw new Error(
        "MES returned an empty response."
      );
    }

    // Known expired-session response.
    if (
      response.success === false &&
      response.message &&
      response.message.code === "08"
    ) {
      throw new Error(
        "MES_SESSION_EXPIRED"
      );
    }

    // --------------------------------------------------------
    // Detect total
    // --------------------------------------------------------

    const possibleTotals = [
      response.recordsTotal,
      response.recordsFiltered,

      response.data?.recordsTotal,
      response.data?.recordsFiltered,

      response.data?.data?.recordsTotal,
      response.data?.data?.recordsFiltered,
    ];

    for (const value of possibleTotals) {
      if (
        value !== undefined &&
        value !== null &&
        !Number.isNaN(Number(value))
      ) {
        totalRecords = Number(value);
        break;
      }
    }

    // --------------------------------------------------------
    // Extract records
    // --------------------------------------------------------

    const records = extractRecords(response);

    console.log(
      "Records received this request:",
      records.length
    );

    // --------------------------------------------------------
    // DEBUG RESPONSE IF NOTHING WAS FOUND
    // --------------------------------------------------------

    if (
      records.length === 0 &&
      start === 0
    ) {
      console.log("");
      console.log(
        "WARNING: MES returned no records."
      );

      console.log("");
      console.log(
        "Raw MES response:"
      );

      console.log(
        JSON.stringify(response, null, 2).substring(
          0,
          10000
        )
      );

      console.log("");
    }

    allRecords.push(...records);

    // If MES explicitly tells us the total.
    if (
      totalRecords !== null &&
      allRecords.length >= totalRecords
    ) {
      break;
    }

    // If fewer than requested came back, we're done.
    if (records.length < length) {
      break;
    }

    start += length;
  }

  console.log("");
  console.log(
    `Total records: ${allRecords.length}`
  );

  return allRecords;
}

// ------------------------------------------------------------
// MAIN
// ------------------------------------------------------------

(async () => {
  const moCode = process.argv[2];

  if (!moCode) {
    console.log(
      "Usage: node mest-test.js MO007617"
    );
    process.exit(1);
  }

  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: [
      "--start-maximized",
    ],
  });

  const page = await browser.newPage();

  // ----------------------------------------------------------
  // Capture MES token from every request.
  // ----------------------------------------------------------

  page.on("request", (request) => {
    const headers = request.headers();

    if (headers.token) {
      page.__mesToken = headers.token;
    }
  });

  // ----------------------------------------------------------
  // Session
  // ----------------------------------------------------------

  let session;

  try {
    session = await ensureSession(page);
  } catch (err) {
    console.error("");
    console.error(
      "Failed to establish MES session:"
    );
    console.error(err);
    await browser.close();
    process.exit(1);
  }

  // ----------------------------------------------------------
  // Query
  // ----------------------------------------------------------

  let records;

  try {
    records = await getTagTransitRecords(
      session,
      moCode
    );
  } catch (err) {
    // --------------------------------------------------------
    // If token expired during the query:
    // login once, save new session, retry.
    // --------------------------------------------------------

    if (err.message === "MES_SESSION_EXPIRED") {
      console.log("");
      console.log(
        "MES session expired during query."
      );

      session = await login(page);

      records = await getTagTransitRecords(
        session,
        moCode
      );
    } else {
      throw err;
    }
  }

  // ----------------------------------------------------------
  // Print extracted data
  // ----------------------------------------------------------

  console.log("");
  console.log(
    "========================================"
  );
  console.log(
    `Received ${records.length} records.`
  );
  console.log(
    "========================================"
  );

  if (records.length > 0) {
    console.log("");

    for (const record of records) {
      console.log(
        [
          record.LABEL_NO,
          record.MO_CODE,
          record.MITEM_CODE,
          record.MITEM_DESC,
          `QTY=${record.LABEL_QTY}`,
          `STATUS=${record.STATUS}`,
          `STOCKIN=${record.STOCKIN_BILL_NO || ""}`,
          record.STATION_CODE,
          record.WORKCENTER_CODE,
          record.LINE_NAME,
          record.WORKGROUP_NAME,
        ].join(" | ")
      );
    }
  }

  // ----------------------------------------------------------
  // Save JSON
  // ----------------------------------------------------------

  fs.writeFileSync(
    "mes-tag-transit-records.json",
    JSON.stringify(records, null, 2),
    "utf8"
  );

  fs.writeFileSync(
    "mes-tag-transit-data.json",
    JSON.stringify(
      {
        moCode,
        recordsTotal: records.length,
        records,
        fetchedAt: new Date().toISOString(),
      },
      null,
      2
    ),
    "utf8"
  );

  console.log("");
  console.log(
    "Saved mes-tag-transit-records.json"
  );

  console.log(
    "Saved mes-tag-transit-data.json"
  );

  console.log("");
  console.log(
    "Browser will remain open."
  );
})();