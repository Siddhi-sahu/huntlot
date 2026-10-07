import type { Board } from "../config.js";
import { getJson, htmlToText, normaliseEmploymentType, toMonthlyInr, type RawJob } from "./types.js";

interface LeverJob {
  id: string;
  text: string;
  categories: { location?: string; allLocations?: string[]; commitment?: string };
  workplaceType?: string;
  hostedUrl: string;
  applyUrl: string;
  descriptionPlain?: string;
  lists?: { text: string; content: string }[];
  additionalPlain?: string;
  createdAt: number;
  salaryRange?: { min: number; max: number; currency: string; interval: string };
}

export async function fetchLever(b: Board): Promise<RawJob[]> {
  const jobs = await getJson<LeverJob[]>(`https://api.lever.co/v0/postings/${b.slug}?mode=json`);
  return jobs.map((j) => {
    const locations = j.categories.allLocations?.length ? j.categories.allLocations : [j.categories.location ?? ""];
    const lists = (j.lists ?? []).map((l) => `${l.text}\n${htmlToText(l.content)}`).join("\n\n");
    const s = j.salaryRange;
    return {
      source: "lever",
      company: b.name,
      externalId: j.id,
      title: j.text.trim(),
      location: locations.join(" / "),
      remote: j.workplaceType === "remote" || /remote|anywhere/i.test(locations.join(" ")),
      employmentType: normaliseEmploymentType(j.categories.commitment),
      url: j.hostedUrl,
      applyUrl: j.applyUrl,
      description: [j.descriptionPlain, lists, j.additionalPlain].filter(Boolean).join("\n\n"),
      postedAt: new Date(j.createdAt),
      salaryText: s ? `${s.currency} ${s.min}–${s.max} / ${s.interval}` : undefined,
      salaryMinMonthlyInr: s ? toMonthlyInr(s.min, s.currency, s.interval) : undefined,
    };
  });
}
