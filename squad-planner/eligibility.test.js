import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyPlayer } from "./eligibility.js";

const config = {
  brackets: [
    { id: "neurim-a", label: "נערים א'", referenceBirthYear: 2011, exceptionQuota: 3 },
    { id: "neurim-b", label: "נערים ב'", referenceBirthYear: 2012, exceptionQuota: 3 },
    { id: "yeladim-a", label: "ילדים א'", referenceBirthYear: 2013, exceptionQuota: 2 },
  ],
};

test("player born mid-year gets only their natural bracket", () => {
  const result = classifyPlayer({ birthDate: "2012-05-15" }, config);
  assert.equal(result.natural.id, "neurim-b");
  assert.equal(result.bridge, null);
  assert.equal(result.bridgeType, null);
});

test("player born in December auto-bridges to the next younger bracket", () => {
  const result = classifyPlayer({ birthDate: "2012-12-20" }, config);
  assert.equal(result.natural.id, "neurim-b");
  assert.equal(result.bridge.id, "yeladim-a");
  assert.equal(result.bridgeType, "auto");
});

test("player born Sept-Nov is an exception candidate for the next younger bracket", () => {
  const result = classifyPlayer({ birthDate: "2012-09-01" }, config);
  assert.equal(result.natural.id, "neurim-b");
  assert.equal(result.bridge.id, "yeladim-a");
  assert.equal(result.bridgeType, "exception");

  const resultNov = classifyPlayer({ birthDate: "2012-11-30" }, config);
  assert.equal(resultNov.bridge.id, "yeladim-a");
  assert.equal(resultNov.bridgeType, "exception");
});

test("player born in other months (not Sep-Dec) has no bridge", () => {
  const result = classifyPlayer({ birthDate: "2012-08-31" }, config);
  assert.equal(result.bridge, null);
  assert.equal(result.bridgeType, null);
});

test("no younger bracket configured means no bridge even if born in December", () => {
  const smallConfig = { brackets: [{ id: "only", label: "Only", referenceBirthYear: 2012, exceptionQuota: 1 }] };
  const result = classifyPlayer({ birthDate: "2012-12-15" }, smallConfig);
  assert.equal(result.natural.id, "only");
  assert.equal(result.bridge, null);
});

test("player with no matching natural bracket returns null natural", () => {
  const result = classifyPlayer({ birthDate: "2005-06-01" }, config);
  assert.equal(result.natural, null);
});
