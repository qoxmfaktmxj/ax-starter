import { describe, expect, it } from "vitest";
import {
  loginSeason,
  parseSeason,
  seasonPhrase,
} from "../../apps/web/app/login/login-season";

// 한국 시간 자정 경계를 UTC로 적는다 (KST = UTC+9).
const kst = (iso: string) => new Date(`${iso}+09:00`);

describe("loginSeason", () => {
  it.each([
    ["2027-01-01T00:00:00", "newyear"],
    ["2027-01-31T23:59:59", "newyear"],
    ["2027-02-01T00:00:00", "ice"],
    ["2027-02-28T23:59:59", "ice"],
    ["2027-03-01T00:00:00", "blossom"],
    ["2027-04-30T23:59:59", "blossom"],
    ["2027-05-01T00:00:00", "green"],
    ["2027-05-31T23:59:59", "green"],
    ["2027-06-01T00:00:00", "summer"],
    ["2027-08-31T23:59:59", "summer"],
    ["2027-09-01T00:00:00", "green"],
    ["2027-09-30T23:59:59", "green"],
    ["2027-10-01T00:00:00", "autumn"],
    ["2027-11-30T23:59:59", "autumn"],
    ["2027-12-01T00:00:00", "christmas"],
    ["2027-12-25T23:59:59", "christmas"],
    ["2027-12-26T00:00:00", "yearend"],
    ["2027-12-31T23:59:59", "yearend"],
  ])("%s KST is %s", (iso, season) => {
    expect(loginSeason(kst(iso))).toBe(season);
  });

  it("uses Korean time, not the server clock's UTC date", () => {
    // UTC로는 아직 12/25지만 한국은 12/26 00:00이다.
    expect(loginSeason(new Date("2027-12-25T15:00:00Z"))).toBe("yearend");
    // UTC로는 2/28이지만 한국은 3/1이다.
    expect(loginSeason(new Date("2027-02-28T15:00:00Z"))).toBe("blossom");
  });
});

describe("seasonPhrase", () => {
  it("wishes a happy new year in January", () => {
    expect(seasonPhrase("newyear", kst("2027-01-10T09:00:00"))).toBe(
      "Happy New Year",
    );
  });

  it("names the coming year at the end of December", () => {
    expect(seasonPhrase("yearend", kst("2026-12-28T09:00:00"))).toBe(
      "See you in 2027",
    );
    expect(seasonPhrase("yearend", kst("2027-12-31T23:59:59"))).toBe(
      "See you in 2028",
    );
  });

  it("has no phrase outside the two greeting seasons", () => {
    expect(seasonPhrase("green", kst("2027-05-10T09:00:00"))).toBeNull();
    expect(seasonPhrase("christmas", kst("2027-12-10T09:00:00"))).toBeNull();
  });
});

describe("parseSeason", () => {
  it("accepts only known season keys", () => {
    expect(parseSeason("christmas")).toBe("christmas");
    expect(parseSeason("winter")).toBeNull();
    expect(parseSeason(undefined)).toBeNull();
    expect(parseSeason(["christmas", "green"])).toBeNull();
  });
});
