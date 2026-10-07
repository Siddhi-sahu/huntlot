import { describe, expect, it } from "vitest";
import { loadProfile } from "../src/config.js";
import { remoteScope } from "../src/match/location.js";
import { rejectReason, scoreJob, type MatchInput } from "../src/match/score.js";
import { studentOnlyPhrase } from "../src/match/student.js";
import { hasTerm, minYearsAsked } from "../src/match/text.js";

const profile = loadProfile();
const job = (over: Partial<MatchInput>): MatchInput => ({
  source: "lever", company: "X", externalId: "1", title: "Backend Engineer", location: "Bangalore",
  remote: false, remoteScope: "onsite", url: "", description: "", ...over,
});

describe("text matching", () => {
  it("matches whole words and variants", () => {
    expect(hasTerm("We use NodeJS and Postgres", "node.js")).toBe(true);
    expect(hasTerm("Strong REST APIs", "rest api")).toBe(true);
    expect(hasTerm("postgresql", "sql")).toBe(false);
    expect(hasTerm("SDE II", "sde i")).toBe(false);
  });
  it("finds the smallest years requirement", () => {
    expect(minYearsAsked("3-5 years of experience, or 2+ years in Go")).toBe(2);
    expect(minYearsAsked("no experience needed")).toBeUndefined();
  });
});

describe("remote scope", () => {
  const r = (location: string, extra: object = {}) => remoteScope({ remote: true, location, description: "", ...extra });
  it("trusts structured region lists", () => {
    expect(r("Remote", { regions: [] })).toBe("worldwide");
    expect(r("Remote", { regions: ["India", "Singapore"] })).toBe("india");
    expect(r("Remote", { regions: ["United States"] })).toBe("foreign");
  });
  it("reads location text", () => {
    expect(r("Remote, Global")).toBe("worldwide");
    expect(r("Remote - APAC")).toBe("india");
    expect(r("Remote, AMER")).toBe("foreign");
    expect(r("Remote")).toBe("unknown");
    expect(r("Remote", { description: "You must be based in the US." })).toBe("foreign");
  });
  it("treats hybrid and non-remote as onsite", () => {
    expect(remoteScope({ remote: false, location: "Pune", description: "" })).toBe("onsite");
    expect(r("Hybrid - Bangalore")).toBe("onsite");
  });
});

describe("students-only detection", () => {
  const now = new Date("2026-10-06");
  it.each([
    "Recent graduate (2027) with a degree in Computer Science",
    "- 2027 graduates of Circuital branches only",
    "You must be currently enrolled in a degree program",
    "Customer Support Engineer (Working Student)",
    "MSc/PhD Internships at Tether aim to provide students",
  ])("flags %j", (text) => expect(studentOnlyPhrase(text, now)).not.toBeNull());

  it.each([
    "Ideally you've already graduated, but if you still have years left of school, apply",
    "Final-year undergraduate student, fresh graduate, or engineer with <1 year of experience",
    "Graduated in 2024 or earlier",
    "We value skills over degrees",
  ])("allows %j", (text) => expect(studentOnlyPhrase(text, now)).toBeNull());
});

describe("filters", () => {
  it("drops senior and level-II titles", () => {
    expect(rejectReason(job({ title: "Senior Backend Engineer" }), profile)).toMatch(/title/);
    expect(rejectReason(job({ title: "SDE II - Platform" }), profile)).toMatch(/title/);
    expect(rejectReason(job({ title: "SDE I - Platform" }), profile)).toBeNull();
  });
  it("drops non-engineering roles and excluded companies", () => {
    expect(rejectReason(job({ title: "Talent Acquisition Intern" }), profile)).toMatch(/engineering/);
    expect(rejectReason(job({ company: "Canonical" }), profile)).toMatch(/company/);
  });
  it("handles where the job is", () => {
    expect(rejectReason(job({ location: "Noida" }), profile)).toBeNull();
    expect(rejectReason(job({ location: "Lucknow" }), profile)).toMatch(/onsite/);
    expect(rejectReason(job({ remoteScope: "foreign", location: "Remote, US" }), profile)).toMatch(/not open to India/);
    expect(rejectReason(job({ remoteScope: "worldwide", location: "Remote" }), profile)).toBeNull();
  });
  it("drops stated pay under the minimum but keeps unknown pay", () => {
    expect(rejectReason(job({ salaryMinMonthlyInr: 15000 }), profile)).toMatch(/salary/);
    expect(rejectReason(job({}), profile)).toBeNull();
  });
  it("drops student-only postings", () => {
    expect(rejectReason(job({ title: "Software Engineer - New Grad", description: "2027 graduates only" }), profile)).toMatch(/students/);
  });
});

describe("scoring", () => {
  it("puts remote first, then preferred cities", () => {
    const remote = scoreJob(job({ remoteScope: "worldwide" }), profile).score;
    const noida = scoreJob(job({ location: "Noida" }), profile).score;
    const pune = scoreJob(job({ location: "Pune" }), profile).score;
    expect(remote).toBeGreaterThan(noida);
    expect(noida).toBeGreaterThan(pune);
  });
  it("ranks an entry-level Node/Postgres backend job well above a 5-year one", () => {
    const good = scoreJob(job({ title: "Backend Engineer Intern", remoteScope: "worldwide", description: "TypeScript, Node.js, PostgreSQL, Redis, Docker" }), profile);
    const meh = scoreJob(job({ title: "Software Engineer", description: "5+ years of Java" }), profile);
    expect(good.score).toBeGreaterThan(75);
    expect(meh.score).toBeLessThan(30);
  });
});
