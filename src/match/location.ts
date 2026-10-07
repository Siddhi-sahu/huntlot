import type { RawJob } from "../sources/types.js";
import { matching } from "./text.js";

export type RemoteScope = "worldwide" | "india" | "foreign" | "unknown" | "onsite";

const ANYWHERE = ["worldwide", "anywhere", "global", "globally", "any country", "any location"];
const INCLUDES_INDIA = ["india", "asia", "apac", "south asia", "ist", "utc+5:30", "gmt+5:30"];
const FOREIGN = [
  "us", "usa", "u.s.", "united states", "canada", "uk", "united kingdom", "europe", "eu", "emea", "amer", "americas",
  "north america", "latam", "latin america", "germany", "france", "spain", "netherlands", "poland", "portugal",
  "brazil", "mexico", "argentina", "australia", "new zealand", "japan", "singapore", "philippines", "ireland",
];
// Phrases in the description that lock a "remote" job to another country.
const FOREIGN_ONLY_PHRASES =
  /(must|need to|required to) (be )?(be )?(based|located|reside|living) in (the )?(us|u\.s\.|usa|united states|canada|uk|united kingdom|europe|eu)\b|authori[sz]ed to work in (the )?(us|u\.s\.|united states|canada|uk|united kingdom)\b|us citizens? only|(est|pst|cet|bst) (time ?zone|hours) required/i;

/**
 * Can someone in India do this job from India? A property of the job, worked out once at fetch time.
 * Structured region lists (Himalayas, Remotive) are trusted first; otherwise we read the location text.
 */
export function remoteScope(job: Pick<RawJob, "remote" | "location" | "regions" | "description">): RemoteScope {
  if (!job.remote || /hybrid/i.test(job.location)) return "onsite";

  if (job.regions) {
    if (job.regions.length === 0) return "worldwide";
    const r = job.regions.join(", ");
    if (matching(r, ANYWHERE).length) return "worldwide";
    return matching(r, INCLUDES_INDIA).length ? "india" : "foreign";
  }

  const loc = job.location;
  if (matching(loc, INCLUDES_INDIA).length) return "india";
  if (matching(loc, ANYWHERE).length) return "worldwide";
  if (matching(loc, FOREIGN).length) return "foreign";
  if (FOREIGN_ONLY_PHRASES.test(job.description)) return "foreign";
  return "unknown"; // says "Remote" and nothing else; the AI check reads the description for clues
}

export type CityFit = "preferred" | "ok" | "no";

export function cityFit(location: string, prefs: { preferred: string[]; ok: string[] }): CityFit {
  if (matching(location, prefs.preferred).length) return "preferred";
  if (matching(location, prefs.ok).length) return "ok";
  return "no";
}
