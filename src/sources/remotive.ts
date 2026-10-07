import type { Feeds } from "../config.js";
import { getJson, htmlToText, normaliseEmploymentType, type RawJob } from "./types.js";

// https://remotive.com/api — they ask for at most ~4 calls a day; jobs appear here with a 24h delay.
interface RJob {
  id: number;
  url: string;
  title: string;
  company_name: string;
  job_type: string;
  publication_date: string;
  candidate_required_location: string;
  salary: string;
  description: string;
}

export async function fetchRemotive(cfg: NonNullable<Feeds["remotive"]>): Promise<RawJob[]> {
  const out: RawJob[] = [];
  for (const category of cfg.categories) {
    const { jobs } = await getJson<{ jobs: RJob[] }>(`https://remotive.com/api/remote-jobs?category=${category}`);
    for (const j of jobs) {
      const where = j.candidate_required_location.trim();
      out.push({
        source: "remotive",
        company: j.company_name,
        externalId: String(j.id),
        title: j.title.trim(),
        location: `Remote (${where || "worldwide"})`,
        remote: true,
        regions: /worldwide|anywhere/i.test(where) || !where ? [] : where.split(/\s*[,/]\s*/),
        employmentType: normaliseEmploymentType(j.job_type),
        url: j.url,
        applyUrl: j.url,
        description: htmlToText(j.description),
        postedAt: new Date(j.publication_date),
        salaryText: j.salary || undefined,
      });
    }
  }
  return out;
}
