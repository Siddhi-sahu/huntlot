import { getJson, htmlToText, toMonthlyInr, type RawJob } from "./types.js";

// https://remoteok.com/api — latest ~100 remote jobs. Their terms: link back to the posting, which we do (url).
interface ROJob {
  id?: string;
  legal?: string; // the first element is a terms notice, not a job
  company: string;
  position: string;
  location: string;
  description: string;
  date: string;
  url: string;
  apply_url: string;
  salary_min: number;
  tags: string[];
}

export async function fetchRemoteOk(): Promise<RawJob[]> {
  const items = await getJson<ROJob[]>("https://remoteok.com/api");
  return items
    .filter((j) => j.id && !j.legal)
    .map((j) => {
      const where = j.location?.trim() ?? "";
      return {
        source: "remoteok" as const,
        company: j.company,
        externalId: j.id!,
        title: j.position.trim(),
        location: `Remote (${where || "worldwide"})`,
        remote: true,
        regions: !where || /worldwide|anywhere|remote/i.test(where) ? [] : [where],
        url: j.url,
        applyUrl: j.apply_url || j.url,
        description: htmlToText(j.description) + (j.tags?.length ? `\n\nTags: ${j.tags.join(", ")}` : ""),
        postedAt: new Date(j.date),
        salaryMinMonthlyInr: j.salary_min ? toMonthlyInr(j.salary_min, "USD", "year") : undefined,
        salaryText: j.salary_min ? `USD ${j.salary_min}+ / year` : undefined,
      };
    });
}
