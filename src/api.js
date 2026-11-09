const path = require("path");
const fs = require("fs");

// Load .env manually to avoid dotenv v17 noisy logging
const envPath = path.resolve(__dirname, "../.env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

/**
 * Create an API context from CLI global options.
 * CLI flags override .env defaults: ADO_PAT, ADO_ORG, ADO_PROJECT, ADO_AREA_PATH
 */
function createContext({ org, project, area, pat, requireOrg = true } = {}) {
  const resolvedPat = pat || process.env.ADO_PAT;
  if (!resolvedPat) {
    console.error("Error: PAT not provided. Use --pat flag or set ADO_PAT in .env");
    process.exit(1);
  }
  const resolvedOrg = org || process.env.ADO_ORG;
  const resolvedProject = project || process.env.ADO_PROJECT;
  const resolvedArea = area || process.env.ADO_AREA_PATH || resolvedProject;

  if (requireOrg && !resolvedOrg) {
    console.error("Error: Organization not provided. Use --org flag or set ADO_ORG in .env");
    process.exit(1);
  }
  return {
    org: resolvedOrg || null,
    project: resolvedProject || null,
    area: resolvedArea || null,
    base: resolvedOrg ? `https://dev.azure.com/${resolvedOrg}` : null,
    auth: "Basic " + Buffer.from(`:${resolvedPat}`).toString("base64"),
  };
}

// body: plain object → JSON; Buffer → sent raw (default application/octet-stream).
async function request(ctx, url, { method = "GET", body, contentType } = {}) {
  const headers = { Authorization: ctx.auth };
  const raw = Buffer.isBuffer(body);
  if (body) headers["Content-Type"] = contentType || (raw ? "application/octet-stream" : "application/json");

  const res = await fetch(url, {
    method,
    headers,
    body: body ? (raw ? body : JSON.stringify(body)) : undefined,
  });

  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }

  if (!res.ok) {
    const msg = typeof data === "object" ? JSON.stringify(data, null, 2) : data;
    throw new Error(`HTTP ${res.status}: ${msg}`);
  }
  return data;
}

async function patchWorkItem(ctx, url, patchDoc) {
  const headers = {
    Authorization: ctx.auth,
    "Content-Type": "application/json-patch+json",
  };
  const res = await fetch(url, {
    method: "PATCH",
    headers,
    body: JSON.stringify(patchDoc),
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) {
    const msg = typeof data === "object" ? JSON.stringify(data, null, 2) : data;
    throw new Error(`HTTP ${res.status}: ${msg}`);
  }
  return data;
}

module.exports = { createContext, request, patchWorkItem };
