const test = require("node:test");
const assert = require("node:assert/strict");
const {
  findBareMentions, assertNoBareMentions, planImages,
  replaceImagePlaceholders, attachmentUrlWithName, parseWidth,
} = require("../src/comment-body");

const G = "fd74dfa5-6400-6bc4-b942-9294d18d4a20";

test("bare @guid is detected (any case)", () => {
  assert.deepEqual(findBareMentions(`hi @${G} there`), [G]);
  assert.deepEqual(findBareMentions(`@${G.toUpperCase()}`), [G.toUpperCase()]);
  assert.throws(() => assertNoBareMentions(`@${G}`), /Refusing to post/);
});

test("markdown @<guid> is allowed", () => {
  assert.deepEqual(findBareMentions(`@<${G}> please check`), []);
  assert.doesNotThrow(() => assertNoBareMentions(`@<${G.toUpperCase()}>`));
});

test("guid inside data-vss-mention is allowed", () => {
  const html = `<a href="#" data-vss-mention="version:2.0,${G}">@Eunice</a>`;
  assert.deepEqual(findBareMentions(html), []);
  const odd = `<a data-vss-mention='version:2.0,@${G}'>@Eunice</a>`;
  assert.deepEqual(findBareMentions(odd), []);
});

test("bare mention next to a valid one is still caught", () => {
  assert.deepEqual(findBareMentions(`@<${G}> and @${G}`), [G]);
});

test("guid without @ is not a mention", () => {
  assert.deepEqual(findBareMentions(`id ${G}`), []);
});

test("placeholders are replaced with <img> at the given width", () => {
  const out = replaceImagePlaceholders(
    "<p>a</p>{{img:a.png}}<p>b</p>{{img:a.png}}",
    { "a.png": "https://x/att/1?fileName=a.png" },
    720,
  );
  assert.equal(
    out,
    '<p>a</p><img src="https://x/att/1?fileName=a.png" width="720"><p>b</p><img src="https://x/att/1?fileName=a.png" width="720">',
  );
});

test("unreplaced placeholder throws", () => {
  assert.throws(() => replaceImagePlaceholders("{{img:b.png}}", { "a.png": "u" }, 720), /Unreplaced/);
});

test("planImages matches placeholders to --image basenames", () => {
  const plan = planImages("{{img:a.png}} {{img:b.png}}", ["/tmp/x/a.png", "b.png"]);
  assert.deepEqual(plan, [{ path: "/tmp/x/a.png", name: "a.png" }, { path: "b.png", name: "b.png" }]);
  assert.throws(() => planImages("{{img:a.png}}", []), /No --image/);
  assert.throws(() => planImages("text", ["a.png"]), /not referenced/);
  assert.throws(() => planImages("{{img:a.png}}", ["x/a.png", "y/a.png"]), /Duplicate/);
  assert.deepEqual(planImages("no images", []), []);
});

test("attachment URL gets fileName like card.py", () => {
  assert.equal(attachmentUrlWithName("https://x/att/1", "a b.png"), "https://x/att/1?fileName=a%20b.png");
  assert.equal(attachmentUrlWithName("https://x/att/1?fileName=a.png", "a.png"), "https://x/att/1?fileName=a.png");
});

test("parseWidth accepts positive integers only", () => {
  assert.equal(parseWidth("720"), 720);
  assert.throws(() => parseWidth("0"));
  assert.throws(() => parseWidth("12px"));
});
