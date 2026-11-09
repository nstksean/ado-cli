// End-to-end comment flow against a local fake ADO server (never real ADO).
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { addComment, addCommentWithImages } = require("../src/workitem");
const { listComments } = require("../src/comments");

function fakeAdo(handler) {
  const calls = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const call = { method: req.method, url: req.url, type: req.headers["content-type"], body: Buffer.concat(chunks) };
      calls.push(call);
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(handler(call, calls.length)));
    });
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => {
    const ctx = { base: `http://127.0.0.1:${server.address().port}/org`, project: "IQ Tech", auth: "Basic x" };
    resolve({ ctx, calls, close: () => server.close() });
  }));
}

function tmpImage(name, bytes) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ado-cli-test-"));
  const p = path.join(dir, name);
  fs.writeFileSync(p, bytes);
  return p;
}

test("images are uploaded as raw octet-stream and placed in an html comment", async () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff]);
  const img = tmpImage("shot.png", png);
  const ado = await fakeAdo((call) => (call.url.includes("/attachments")
    ? { id: "att1", url: "https://dev.azure.com/org/_apis/wit/attachments/att1" }
    : { id: 99, workItemId: 1, format: "html", text: JSON.parse(call.body).text }));
  try {
    const r = await addCommentWithImages(ado.ctx, { id: 1, text: "<p>see</p>{{img:shot.png}}", images: [img], width: 640 });
    const [up, post] = ado.calls;
    assert.equal(up.method, "POST");
    assert.match(up.url, /\/_apis\/wit\/attachments\?fileName=shot\.png&api-version=7\.1$/);
    assert.equal(up.type, "application/octet-stream");
    assert.deepEqual(up.body, png);
    assert.match(post.url, /comments\?format=html&/);
    assert.equal(post.type, "application/json");
    assert.equal(
      JSON.parse(post.body).text,
      '<p>see</p><img src="https://dev.azure.com/org/_apis/wit/attachments/att1?fileName=shot.png" width="640">',
    );
    assert.equal(r.id, 99);
  } finally { ado.close(); }
});

test("dry-run makes no request at all", async () => {
  const img = tmpImage("a.png", "x");
  const r = await addCommentWithImages(null, { id: 1, text: "{{img:a.png}}", images: [img], dryRun: true });
  assert.equal(r.dryRun, true);
  assert.equal(r.body, '<img src="dry-run://attachment/a.png" width="720">');
  assert.deepEqual(r.files.map((f) => [f.name, f.bytes]), [["a.png", 1]]);
});

test("bare mention is refused before any request", async () => {
  const ado = await fakeAdo(() => ({}));
  const bare = "@" + "fd74dfa5-6400-6bc4-b942-9294d18d4a20";
  try {
    await assert.rejects(addComment(ado.ctx, { id: 1, text: `hi ${bare}` }), /Refusing/);
    await assert.rejects(addCommentWithImages(null, { id: 1, text: bare, dryRun: true }), /Refusing/);
    assert.equal(ado.calls.length, 0);
  } finally { ado.close(); }
});

test("listComments follows continuationToken and filters", async () => {
  const me = "aaaaaaaa-0000-0000-0000-000000000000";
  const pages = [
    { comments: [
      { id: 3, createdBy: { id: "b", displayName: "B", uniqueName: "b@x" }, createdDate: "2026-11-03T00:00:00Z", format: "markdown", text: "3" },
      { id: 2, createdBy: { id: me.toUpperCase(), displayName: "Me", uniqueName: "me@x" }, createdDate: "2026-11-02T00:00:00Z", format: "html", text: "2" },
    ], continuationToken: "tok 1" },
    { comments: [
      { id: 1, createdBy: { id: "b", displayName: "B", uniqueName: "b@x" }, createdDate: "2026-11-01T00:00:00Z", format: "html", text: "1" },
    ] },
  ];
  const ado = await fakeAdo((call) => pages[call.url.includes("continuationToken=") ? 1 : 0]);
  try {
    const all = await listComments(ado.ctx, { id: 7 });
    assert.deepEqual(all.map((c) => c.id), [1, 2, 3]);
    assert.deepEqual(Object.keys(all[0]), ["id", "by", "mail", "createdDate", "format", "text"]);
    assert.match(ado.calls[0].url, /workItems\/7\/comments\?api-version=7\.1-preview\.4&\$expand=renderedText$/);
    assert.match(ado.calls[1].url, /&continuationToken=tok%201$/);

    const since = await listComments(ado.ctx, { id: 7, since: "2026-11-01T12:00:00Z" });
    assert.deepEqual(since.map((c) => c.id), [2, 3]);
    const others = await listComments(ado.ctx, { id: 7, othersAfterMe: true, meId: me });
    assert.deepEqual(others.map((c) => c.id), [3]);
  } finally { ado.close(); }
});
