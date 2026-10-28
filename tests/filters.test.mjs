import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isLocationEligible,
  isLocationRestricted,
  isRemoteJob,
  filterJobs,
  deduplicate,
} from "../lib/filters.js";

test("countries on your list are accepted, abbreviations included", () => {
  for (const place of [
    "Berlin, Germany",
    "Dubai, UAE",
    "UK",
    "Remote - USA",
    "Singapore",
  ]) {
    assert.equal(isLocationEligible(place).ok, true, place);
  }
});

test("countries below your pay floor are rejected", () => {
  for (const place of [
    "Lagos, Nigeria",
    "Mumbai, India",
    "Manila, Philippines",
  ]) {
    assert.equal(isLocationEligible(place).ok, false, place);
  }
});

test("remote and worldwide jobs are accepted, and so is a blank location", () => {
  for (const place of ["Remote", "Worldwide", "Remote, EMEA", "Anywhere", ""]) {
    assert.equal(isLocationEligible(place).ok, true, place || "(blank)");
  }
});

test("jobs tied to specific countries or regions are flagged, open ones are not", () => {
  for (const place of [
    "Remote - USA",
    "Remote, AMER",
    "Remote - Canada",
    "Remote - UK",
  ]) {
    assert.equal(isLocationRestricted(place), true, place);
  }
  for (const place of [
    "Remote",
    "Remote, EMEA",
    "Remote, Global",
    "Worldwide",
  ]) {
    assert.equal(isLocationRestricted(place), false, place);
  }
});

test("remote-only boards are always remote, even with just a country name", () => {
  assert.equal(
    isRemoteJob({
      source: "himalayas",
      location: "United States",
      title: "Dev",
    }),
    true,
  );
  assert.equal(
    isRemoteJob({
      source: "greenhouse",
      location: "Berlin, Germany",
      title: "Dev",
      description: "",
    }),
    false,
  );
  assert.equal(
    isRemoteJob({
      source: "greenhouse",
      location: "",
      title: "Dev",
      description: "This is a fully remote role.",
    }),
    true,
  );
});

test("filterJobs drops ineligible countries and adds the restricted flag", () => {
  const out = filterJobs([
    { source: "ashby", title: "Dev", location: "Remote - USA" },
    { source: "ashby", title: "Dev", location: "Lagos, Nigeria" },
    { source: "ashby", title: "Dev", location: "Remote, EMEA" },
  ]);
  assert.equal(out.length, 2);
  assert.equal(out[0].locationRestricted, true);
  assert.equal(out[1].locationRestricted, false);
});

test("deduplicate removes known links, repeats and jobs with no link", () => {
  const out = deduplicate(
    [{ link: "a" }, { link: "b" }, { link: "b" }, { link: "" }, { link: "c" }],
    new Set(["a"]),
  );
  assert.deepEqual(
    out.map((j) => j.link),
    ["b", "c"],
  );
});
