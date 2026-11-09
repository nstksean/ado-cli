// Pure helpers for building work item comment bodies (no network).

const path = require("path");

const GUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const PLACEHOLDER_RE = /\{\{img:([^}]+)\}\}/g;

/**
 * Find "@<guid>" mentions written without angle brackets (e.g. "@5e0d...").
 * ADO renders those as plain text and notifies nobody. Valid forms are
 * markdown "@<guid>" and HTML data-vss-mention="version:2.0,<guid>".
 */
function findBareMentions(text) {
  const stripped = String(text).replace(/data-vss-mention\s*=\s*("[^"]*"|'[^']*')/gi, "");
  const re = new RegExp(`@(${GUID})(?![0-9a-f])`, "gi");
  return [...stripped.matchAll(re)].map((m) => m[1]);
}

function assertNoBareMentions(text) {
  const bare = findBareMentions(text);
  if (bare.length > 0) {
    throw new Error(
      `Refusing to post: bare mention(s) ${bare.map((g) => "@" + g).join(", ")}. ` +
      "Use @<guid> (markdown) or data-vss-mention (html) so ADO notifies the person.",
    );
  }
}

function placeholderNames(text) {
  return [...String(text).matchAll(PLACEHOLDER_RE)].map((m) => m[1]);
}

/**
 * Check that every {{img:<name>}} has a matching --image and vice versa,
 * before anything is uploaded. Returns [{ path, name }].
 */
function planImages(text, imagePaths) {
  const images = imagePaths.map((p) => ({ path: p, name: path.basename(p) }));
  const names = images.map((i) => i.name);
  const dup = names.find((n, i) => names.indexOf(n) !== i);
  if (dup) throw new Error(`Duplicate image basename: ${dup}`);

  const used = new Set(placeholderNames(text));
  const missing = [...used].filter((n) => !names.includes(n));
  if (missing.length) throw new Error(`No --image for placeholder(s): ${missing.map((n) => `{{img:${n}}}`).join(", ")}`);
  const unused = names.filter((n) => !used.has(n));
  if (unused.length) throw new Error(`--image not referenced by any {{img:<name>}}: ${unused.join(", ")}`);
  return images;
}

/** Replace {{img:<name>}} with <img src="<url>" width="<w>"> (all occurrences). */
function replaceImagePlaceholders(text, urlsByName, width) {
  const out = String(text).replace(PLACEHOLDER_RE, (whole, name) => {
    const url = urlsByName[name];
    if (!url) return whole;
    return `<img src="${String(url).replace(/"/g, "&quot;")}" width="${width}">`;
  });
  const left = placeholderNames(out);
  if (left.length) throw new Error(`Unreplaced image placeholder(s): ${left.join(", ")}`);
  return out;
}

// Same rule as pm-req-audit card.py: make sure the URL carries fileName.
function attachmentUrlWithName(url, name) {
  return url.includes("fileName=") ? url : `${url}?fileName=${encodeURIComponent(name)}`;
}

function parseWidth(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`--width must be a positive integer, got: ${value}`);
  return n;
}

module.exports = {
  findBareMentions, assertNoBareMentions, placeholderNames, planImages,
  replaceImagePlaceholders, attachmentUrlWithName, parseWidth,
};
