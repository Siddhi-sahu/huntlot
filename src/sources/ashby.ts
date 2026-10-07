import type { Board } from "../config.js";
import { getJson, normaliseEmploymentType, toMonthlyInr, type RawJob } from "./types.js";

interface AshbyJob {
  id: string;
  title: string;
  location: string;
  secondaryLocations?: { location: string }[];
  isRemote?: boolean;
  workplaceType?: string;
  employmentType?: string;
  jobUrl: string;
  applyUrl: string;
  descriptionPlain: string;
  publishedAt: string;
  isListed?: boolean;
  compensation?: {
    compensationTierSummary?: string | null;
    summaryComponents?: { compensationType: string; interval: string; currencyCode: string; minValue: number | null }[];
  };
}

export async function fetchAshby(b: Board): Promise<RawJob[]> {
  const { jobs } = await getJson<{ jobs: AshbyJob[] }>(
    `https://api.ashbyhq.com/posting-api/job-board/${b.slug}?includeCompensation=true`,
  );
  return jobs
    .filter((j) => j.isListed !== false)
    .map((j) => {
      const locations = [j.location, ...(j.secondaryLocations ?? []).map((l) => l.location)];
      const salary = j.compensation?.summaryComponents?.find((x) => x.compensationType === "Salary");
      return {
        source: "ashby",
        company: b.name,
        externalId: j.id,
        title: j.title.trim(),
        location: locations.join(" / "),
        remote: Boolean(j.isRemote) || j.workplaceType === "Remote",
        employmentType: normaliseEmploymentType(j.employmentType),
        url: j.jobUrl,
        applyUrl: j.applyUrl,
        description: j.descriptionPlain ?? "",
        postedAt: new Date(j.publishedAt),
        salaryText: j.compensation?.compensationTierSummary ?? undefined,
        salaryMinMonthlyInr:
          salary?.minValue != null ? toMonthlyInr(salary.minValue, salary.currencyCode, salary.interval) : undefined,
      };
    });
}
