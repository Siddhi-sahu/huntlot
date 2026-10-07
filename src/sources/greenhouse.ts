import type { Board } from "../config.js";
import { getJson, htmlToText, type RawJob } from "./types.js";

interface GhJob {
  id: number;
  title: string;
  location: { name: string };
  absolute_url: string;
  content: string;
  first_published?: string;
  updated_at: string;
}

export async function fetchGreenhouse(b: Board): Promise<RawJob[]> {
  const { jobs } = await getJson<{ jobs: GhJob[] }>(
    `https://boards-api.greenhouse.io/v1/boards/${b.slug}/jobs?content=true`,
  );
  return jobs.map((j) => ({
    source: "greenhouse",
    company: b.name,
    externalId: String(j.id),
    title: j.title.trim(),
    location: j.location?.name ?? "",
    remote: /remote|anywhere/i.test(j.location?.name ?? ""),
    url: j.absolute_url,
    applyUrl: j.absolute_url,
    description: htmlToText(j.content ?? ""),
    postedAt: new Date(j.first_published ?? j.updated_at),
  }));
}
