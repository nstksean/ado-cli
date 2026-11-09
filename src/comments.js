// Read-only work item comment listing.
const { request } = require("./api");

function enc(ctx) { return encodeURIComponent(ctx.project); }

function shapeComment(c) {
  return {
    id: c.id,
    by: c.createdBy?.displayName || null,
    mail: c.createdBy?.uniqueName || null,
    createdDate: c.createdDate,
    format: c.format || null,
    text: c.text,
  };
}

async function fetchAllComments(ctx, id) {
  const base = `${ctx.base}/${enc(ctx)}/_apis/wit/workItems/${id}/comments?api-version=7.1-preview.4&$expand=renderedText`;
  const all = [];
  let token;
  do {
    const url = token ? `${base}&continuationToken=${encodeURIComponent(token)}` : base;
    const data = await request(ctx, url);
    all.push(...(data.comments || []));
    token = data.continuationToken;
  } while (token);
  return all;
}

/**
 * List comments oldest first. since: keep comments created after this ISO time.
 * meId: with othersAfterMe, keep only others' comments after my latest one.
 */
async function listComments(ctx, { id, since, othersAfterMe = false, meId }) {
  const raw = await fetchAllComments(ctx, id);
  return filterComments(raw, { since, othersAfterMe, meId }).map(shapeComment);
}

function filterComments(raw, { since, othersAfterMe = false, meId } = {}) {
  const sorted = [...raw].sort((a, b) => Date.parse(a.createdDate) - Date.parse(b.createdDate));
  let out = sorted;
  if (since) {
    const t = Date.parse(since);
    if (Number.isNaN(t)) throw new Error(`--since is not a valid ISO date: ${since}`);
    out = out.filter((c) => Date.parse(c.createdDate) > t);
  }
  if (othersAfterMe) {
    if (!meId) throw new Error("othersAfterMe requires meId");
    const isMe = (c) => (c.createdBy?.id || "").toLowerCase() === meId.toLowerCase();
    const mine = sorted.filter(isMe);
    const lastMine = mine.length ? Date.parse(mine[mine.length - 1].createdDate) : -Infinity;
    out = out.filter((c) => !isMe(c) && Date.parse(c.createdDate) > lastMine);
  }
  return out;
}

module.exports = { listComments, filterComments, shapeComment };
