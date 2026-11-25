#!/usr/bin/env node
/**
 * Bulk-create CityCatalyst workshop accounts (one per city) through the public
 * register endpoint, verify each one by logging in through next-auth (CSRF
 * token + credentials callback), and write the credentials to a CSV that opens
 * in Excel.
 *
 * Usage:
 *   node scripts/create-workshop-accounts.mjs --out <file.csv> --report-file <events.jsonl> --accounts-file <prepared.json>
 *   Prepared JSON: [{city, name, email, password}]. --dry-run validates without network calls.
 *   --verify-only checks existing accounts without registering. Reports contain no passwords or cookies.
 *   Alternatively pass --cities-file cities.txt or city arguments; generated credentials are saved before use.
 *
 * Requires Node.js 22+. Creates user accounts only, not city records, inventories,
 * or city memberships. Registration accepts the application terms and may send
 * welcome emails. Run only for workshop participants you are authorized to enroll.
 * The CSV and prepared JSON hold plaintext passwords: keep both outside the repo.
 * Run one instance per prepared file/report and reuse both files when resuming.
 */
import { randomBytes } from "node:crypto";
import {
  readFileSync,
  writeFileSync,
  appendFileSync,
  existsSync,
} from "node:fs";
import { parseArgs } from "node:util";
import { resolve } from "node:path";

const { values: opts, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    host: { type: "string", default: "https://citycatalyst.openearth.dev" },
    domain: { type: "string", default: "example.com" },
    out: { type: "string" },
    "cities-file": { type: "string" },
    "accounts-file": { type: "string" },
    "report-file": { type: "string" },
    "dry-run": { type: "boolean", default: false },
    "verify-only": { type: "boolean", default: false },
    help: { type: "boolean", short: "h", default: false },
  },
});

if (opts.help) {
  console.log(`Create and verify workshop users on citycatalyst.openearth.dev (Node.js 22+).

From app/:
  node scripts/create-workshop-accounts.mjs --out /private/accounts.csv --report-file /private/events.jsonl "Viladecans" "Vitoria-Gasteiz"
  node scripts/create-workshop-accounts.mjs --out /private/accounts.csv --report-file /private/events.jsonl --accounts-file /private/accounts.csv.prepared.json --verify-only

Input: city arguments, --cities-file (one city per line), or --accounts-file
       (JSON array of {city, name, email, password}).
--domain       Email domain for generated addresses (default: example.com).
--dry-run      Validate without network requests or writing files.
--verify-only  Check existing accounts; never register.
--host         Only https://citycatalyst.openearth.dev is allowed.

Generated passwords are 24 characters. Credentials are saved to <out>.prepared.json
before registration; reuse that file AND the report to resume. The CSV includes
only verified users. Keep credential files outside the repository. City records
and city access are not created. Registration accepts terms and may send email.`);
  process.exit(0);
}

const cities = [
  ...positionals,
  ...(opts["cities-file"]
    ? readFileSync(opts["cities-file"], "utf8").split(/\r?\n/)
    : []),
]
  .map((c) => c.trim())
  .filter(Boolean);

if (!opts.out || (!opts["accounts-file"] && cities.length === 0)) {
  console.error(
    "Need --out <file.csv> and --accounts-file <prepared.json> or cities.",
  );
  process.exit(1);
}
if (opts["accounts-file"] && cities.length)
  throw new Error("Use prepared accounts OR city names.");
opts.host = new URL(opts.host).origin;
if (opts.host !== "https://citycatalyst.openearth.dev")
  throw new Error("This workshop run is restricted to the dev host.");
if (!opts["report-file"])
  throw new Error("Need --report-file <events.jsonl> for resumable progress.");

// Same rule as passwordRegex in src/util/validation.ts.
const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9]).{4,}$/;
function makePassword() {
  let pw;
  do pw = randomBytes(18).toString("base64url");
  while (!passwordRegex.test(pw));
  return pw;
}

const slugify = (s) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

async function register(account) {
  const res = await fetch(`${opts.host}/api/v1/auth/register/`, {
    redirect: "manual",
    signal: AbortSignal.timeout(30000),
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: account.name,
      email: account.email,
      password: account.password,
      confirmPassword: account.password,
      acceptTerms: true,
      preferredLanguage: "en",
    }),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, userId: body.user?.userId ?? null };
}

async function canLogIn(account) {
  const csrfRes = await fetch(`${opts.host}/api/auth/csrf/`, {
    redirect: "manual",
    signal: AbortSignal.timeout(30000),
  });
  if (!csrfRes.ok) throw new Error(`CSRF HTTP ${csrfRes.status}`);
  const { csrfToken } = await csrfRes.json();
  if (!csrfToken) throw new Error("Missing CSRF token");
  const cookie = csrfRes.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  const res = await fetch(`${opts.host}/api/auth/callback/credentials/`, {
    method: "POST",
    redirect: "manual",
    signal: AbortSignal.timeout(30000),
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: cookie,
    },
    body: new URLSearchParams({
      csrfToken,
      email: account.email,
      password: account.password,
      callbackUrl: "/en/cities",
      json: "true",
    }),
  });
  const cookies = res.headers.getSetCookie().map((c) => c.split(";")[0]);
  const hasSession = cookies.some((c) =>
    /^(?:__Secure-)?next-auth\.session-token(?:\.\d+)?=.+/.test(c),
  );
  if (res.status === 401 && !hasSession)
    return { ok: false, loginStatus: res.status };
  if (!res.ok || !hasSession)
    throw new Error(
      `Login did not produce a valid session (HTTP ${res.status})`,
    );
  const headers = { Cookie: [cookie, ...cookies].filter(Boolean).join("; ") };
  const sessionRes = await fetch(`${opts.host}/api/auth/session/`, {
    headers,
    redirect: "manual",
    signal: AbortSignal.timeout(30000),
  });
  const session = await sessionRes.json();
  if (
    !sessionRes.ok ||
    session.user?.email !== account.email ||
    !session.user?.id
  )
    throw new Error("Authenticated session identity mismatch");
  const userRes = await fetch(`${opts.host}/api/v1/user/`, {
    headers,
    redirect: "manual",
    signal: AbortSignal.timeout(30000),
  });
  const user = (await userRes.json()).data;
  if (
    !userRes.ok ||
    user?.email !== account.email ||
    user?.userId !== session.user.id ||
    user?.role !== "user"
  )
    throw new Error("Protected user identity mismatch");
  return {
    ok: true,
    loginStatus: res.status,
    sessionStatus: sessionRes.status,
    userStatus: userRes.status,
    userId: user.userId,
    verifiedAt: new Date().toISOString(),
  };
}

// Prepared credentials are persisted before the first registration, never regenerated on retry.
const preparedPath = opts["accounts-file"] || `${opts.out}.prepared.json`;
if (opts["accounts-file"] && !existsSync(preparedPath))
  throw new Error("Prepared accounts file does not exist");
const filePaths = [
  preparedPath,
  opts.out,
  opts["report-file"],
  opts["cities-file"],
]
  .filter(Boolean)
  .map((file) => {
    const path = resolve(file);
    return process.platform === "win32" ? path.toLowerCase() : path;
  });
if (new Set(filePaths).size !== filePaths.length)
  throw new Error(
    "Input, CSV, prepared accounts, and report paths must differ",
  );
const accounts = existsSync(preparedPath)
  ? JSON.parse(readFileSync(preparedPath, "utf8"))
  : cities.map((city) => ({
      city,
      name: `${city} Workshop`,
      email: `cc-workshop-${slugify(city)}-${randomBytes(3).toString("hex")}@${opts.domain}`,
      password: makePassword(),
    }));
if (!Array.isArray(accounts) || accounts.length === 0)
  throw new Error("No prepared accounts");
if (
  cities.length &&
  (accounts.length !== cities.length ||
    accounts.some((account, index) => account?.city !== cities[index]))
)
  throw new Error(
    "Saved accounts do not match the requested cities; use a new output path",
  );
for (const a of accounts) {
  if (
    !a ||
    typeof a.city !== "string" ||
    !a.city ||
    typeof a.name !== "string" ||
    a.name.length < 4 ||
    typeof a.email !== "string" ||
    !/^[a-z0-9.-]+@[a-z0-9.-]+\.[a-z]+$/.test(a.email) ||
    typeof a.password !== "string" ||
    !passwordRegex.test(a.password)
  )
    throw new Error("Invalid prepared account");
}
if (new Set(accounts.map((a) => a.email)).size !== accounts.length)
  throw new Error("Duplicate account emails");
if (opts["dry-run"]) {
  console.log(
    `Validated ${accounts.length} accounts for ${opts.host}; no network requests.`,
  );
  process.exit(0);
}
if (!existsSync(preparedPath))
  writeFileSync(preparedPath, JSON.stringify(accounts, null, 2), {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
const events = existsSync(opts["report-file"])
  ? readFileSync(opts["report-file"], "utf8")
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line))
  : [];
if (events.some((e) => e.host !== opts.host))
  throw new Error("Report host mismatch");
function record(account, event, detail = {}) {
  const entry = {
    at: new Date().toISOString(),
    host: opts.host,
    city: account.city,
    email: account.email,
    event,
    ...detail,
  };
  appendFileSync(opts["report-file"], JSON.stringify(entry) + "\n", "utf8");
  events.push(entry);
}
const rows = [];
for (const account of accounts) {
  try {
    let result = await canLogIn(account);
    let registration;
    if (!result.ok && !opts["verify-only"]) {
      // An ambiguous/failed prior POST is never blindly repeated on resume.
      if (
        events.some(
          (e) =>
            e.email === account.email && e.event === "registration_started",
        )
      )
        throw new Error(
          "Prior registration attempt exists; login still fails; manual investigation required",
        );
      record(account, "registration_started");
      try {
        registration = await register(account);
        record(account, "registration_response", registration);
      } catch (error) {
        record(account, "registration_error", { error: error.name });
      }
      // Registration can persist the user before a welcome-email error.
      result = await canLogIn(account);
    }
    if (
      result.ok &&
      registration?.userId &&
      result.userId !== registration.userId
    )
      throw new Error("Registered and authenticated user IDs differ");
    record(account, result.ok ? "verified" : "verification_failed", result);
    if (result.ok) rows.push(account);
    console.log(
      `${result.ok ? "OK" : "FAIL"} ${account.city}${registration ? ` register=${registration.status}` : ""}${result.ok ? " login/session/user verified" : " login rejected"}`,
    );
  } catch (error) {
    record(account, "verification_error", { error: error.message });
    console.log(`FAIL ${account.city}: ${error.message}`);
  }
}

const csvCell = (v) => `"${String(v).replaceAll('"', '""')}"`;
const csv = [
  ["City", "Email", "Password", "Login URL"],
  ...rows.map((r) => [
    r.city,
    r.email,
    r.password,
    `${opts.host}/en/auth/login`,
  ]),
]
  .map((r) => r.map(csvCell).join(","))
  .join("\r\n");
// BOM so Excel reads accented city names as UTF-8.
writeFileSync(opts.out, "\uFEFF" + csv + "\r\n", {
  encoding: "utf8",
  mode: 0o600,
});
console.log(
  `Verified ${rows.length}/${accounts.length} accounts; CSV saved to ${opts.out}`,
);
process.exitCode = rows.length === accounts.length ? 0 : 1;
