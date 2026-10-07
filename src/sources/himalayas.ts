import type { Feeds } from "../config.js";
import { getJson, htmlToText, normaliseEmploymentType, toMonthlyInr, type RawJob } from "./types.js";

// https://himalayas.app/api — remote jobs only, with a search endpoint.
interface HJob {
  guid: string;
  title: string;
  companyName: string;
  employmentType?: string;
  minSalary?: number | null;
  currency?: string;
  salaryPeriod?: string;
  locationRestrictions: string[];
  description: string;
  pubDate: number; // unix seconds
  applicationLink: string;
}

export async function fetchHimalayas(cfg: NonNullable<Feeds["himalayas"]>): Promise<RawJob[]> {
  const jobs = new Map<string, RawJob>();
  // Each query twice: jobs open worldwide, and jobs open to India specifically.
  for (const q of cfg.queries) {
    for (const scope of ["worldwide=true", "country=India"]) {
      for (let page = 1; page <= cfg.pages; page++) {
        const url = `https://himalayas.app/jobs/api/search?q=${encodeURIComponent(q)}&${scope}&page=${page}`;
        const { jobs: batch } = await getJson<{ jobs: HJob[] }>(url);
        for (const j of batch) jobs.set(j.guid, toRaw(j));
        if (batch.length < 20) break;
      }
    }
  }
  return [...jobs.values()];
}

function toRaw(j: HJob): RawJob {
  return {
    source: "himalayas",
    company: j.companyName,
    externalId: j.guid,
    title: j.title.trim(),
    location: j.locationRestrictions.length ? `Remote (${j.locationRestrictions.join(", ")})` : "Remote (worldwide)",
    remote: true,
    regions: j.locationRestrictions,
    employmentType: normaliseEmploymentType(j.employmentType),
    url: j.applicationLink,
    applyUrl: j.applicationLink,
    description: htmlToText(j.description),
    postedAt: new Date(j.pubDate * 1000),
    salaryText: j.minSalary ? `${j.currency} ${j.minSalary}+ / ${j.salaryPeriod}` : undefined,
    salaryMinMonthlyInr: j.minSalary ? toMonthlyInr(j.minSalary, j.currency ?? "", j.salaryPeriod ?? "") : undefined,
  };
}
