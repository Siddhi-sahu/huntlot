import type { Board, Feeds } from "../config.js";
import { fetchAshby } from "./ashby.js";
import { fetchGreenhouse } from "./greenhouse.js";
import { fetchHimalayas } from "./himalayas.js";
import { fetchLever } from "./lever.js";
import { fetchRemoteOk } from "./remoteok.js";
import { fetchRemotive } from "./remotive.js";
import type { RawJob, SourceName } from "./types.js";

/** One unit of fetching. `complete` = it returns everything that source has, so missing jobs can be marked closed. */
export interface Fetch {
  label: string;
  source: SourceName;
  company?: string;
  complete: boolean;
  run: () => Promise<RawJob[]>;
}

const boardFetchers = { greenhouse: fetchGreenhouse, lever: fetchLever, ashby: fetchAshby };

export function plan(boards: Board[], feeds: Feeds): Fetch[] {
  const fetches: Fetch[] = boards.map((b) => ({
    label: b.name, source: b.source, company: b.name, complete: true, run: () => boardFetchers[b.source](b),
  }));
  if (feeds.himalayas) fetches.push({ label: "Himalayas", source: "himalayas", complete: false, run: () => fetchHimalayas(feeds.himalayas!) });
  if (feeds.remotive) fetches.push({ label: "Remotive", source: "remotive", complete: false, run: () => fetchRemotive(feeds.remotive!) });
  if (feeds.remoteok) fetches.push({ label: "RemoteOK", source: "remoteok", complete: false, run: fetchRemoteOk });
  return fetches;
}

export type { RawJob, SourceName };
