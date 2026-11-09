const test = require("node:test");
const assert = require("node:assert/strict");
const { isMacro, wiqlString, wiqlValue } = require("../src/wiql");

test("macros are emitted unquoted", () => {
  assert.equal(wiqlValue("@Me"), "@Me");
  assert.equal(wiqlValue("@CurrentIteration"), "@CurrentIteration");
  assert.equal(wiqlValue("@CurrentIteration + 1"), "@CurrentIteration + 1");
  assert.equal(wiqlValue("@Today - 7"), "@Today - 7");
  assert.equal(wiqlValue("@CurrentIteration('[IQ Tech]\\VoAI Team')"), "@CurrentIteration('[IQ Tech]\\VoAI Team')");
  assert.equal(wiqlValue(" @Me "), "@Me");
});

test("plain values are quoted and escaped", () => {
  assert.equal(wiqlValue("Sean Lin"), "'Sean Lin'");
  assert.equal(wiqlValue("IQ Tech\\Sprint 2026-22"), "'IQ Tech\\Sprint 2026-22'");
  assert.equal(wiqlValue("O'Brien"), "'O''Brien'");
});

test("anything that only looks like a macro stays quoted", () => {
  assert.equal(isMacro("@Me' OR 1=1"), false);
  assert.equal(wiqlValue("@Me' OR '1'='1"), "'@Me'' OR ''1''=''1'");
  assert.equal(wiqlValue("@Me @Today"), "'@Me @Today'");
  assert.equal(isMacro("Me"), false);
});

test("wiqlString never treats @ as a macro", () => {
  assert.equal(wiqlString("@release"), "'@release'");
});
