// WIQL literal helpers. Macros such as @Me, @Today - 7 or @CurrentIteration
// must be emitted unquoted; quoting them turns them into literal strings.

const MACRO_RE = /^@[A-Za-z]\w*(\('(?:[^']|'')*'\))?(\s*[+-]\s*\d+)?$/;

function isMacro(value) {
  return typeof value === "string" && MACRO_RE.test(value.trim());
}

function wiqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

// For fields that accept macros (AssignedTo, IterationPath).
function wiqlValue(value) {
  return isMacro(value) ? value.trim() : wiqlString(value);
}

module.exports = { isMacro, wiqlString, wiqlValue };
