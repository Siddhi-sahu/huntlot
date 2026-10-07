import type { Profile } from "../config.js";
import type { RawJob } from "../sources/index.js";
import { cityFit, type RemoteScope } from "./location.js";
import { studentOnlyPhrase } from "./student.js";
import { matching, minYearsAsked } from "./text.js";

const ENGINEERING = ["engineer", "developer", "sde", "swe", "programmer", "engineering", "devops", "sre"];
const BACKENDISH = ["backend", "back end", "back-end", "node.js", "api", "platform", "server", "infrastructure"];
const ENTRY_LEVEL = ["intern", "internship", "new grad", "graduate", "fresher", "junior", "jr", "entry", "trainee", "apprentice", "sde 1", "sde-1", "sde i", "engineer i", "associate"];

/** A job as the matcher sees it: what the source gave us plus the remote scope worked out at fetch time. */
export type MatchInput = RawJob & { remoteScope: RemoteScope };

/** Hard filters. Returns why a job is ruled out for you, or null to keep it. */
export function rejectReason(job: MatchInput, p: Profile): string | null {
  const t = p.targets;
  if (matching(job.company, t.exclude_companies).length) return `company: ${job.company}`;
  if (!matching(job.title, ENGINEERING).length && !matching(job.title, t.roles).length) return "not engineering";
  const excluded = matching(job.title, t.exclude_titles);
  if (excluded.length) return `title: ${excluded.join(", ")}`;
  if (job.employmentType && !t.employment_types.includes(job.employmentType)) return `type: ${job.employmentType}`;

  if (job.remoteScope === "foreign") return "remote, not open to India";
  if (job.remoteScope === "onsite" && cityFit(job.location, t.locations) === "no") return "onsite elsewhere";
  if (job.remoteScope !== "onsite" && !t.remote && cityFit(job.location, t.locations) === "no") return "remote (off in profile)";

  if (job.salaryMinMonthlyInr != null && job.salaryMinMonthlyInr < t.min_salary_monthly_inr)
    return `salary ₹${job.salaryMinMonthlyInr}/mo`;
  if (t.exclude_student_only) {
    const phrase = studentOnlyPhrase(`${job.title}\n${job.description}`);
    if (phrase) return `students only: "${phrase}"`;
  }
  return null;
}

export interface Score {
  score: number;
  reasons: string[];
  missing: string[]; // your core skills the posting doesn't mention (informational)
}

/** 0-100 fit score. Pure (no I/O), so it's easy to test and tweak. */
export function scoreJob(job: MatchInput, p: Profile): Score {
  const reasons: string[] = [];
  let s = 0;
  const add = (points: number, reason?: string) => {
    s += points;
    if (reason) reasons.push(reason);
  };
  const title = job.title;
  const desc = job.description;

  // Where (max 20): remote open to India first, then your cities
  if (job.remoteScope === "worldwide") add(20, "remote, worldwide");
  else if (job.remoteScope === "india") add(20, "remote, India ok");
  else if (job.remoteScope === "unknown") add(12, "remote (region unclear)");
  else if (cityFit(job.location, p.targets.locations) === "preferred") add(10, "preferred city");
  else add(6, "ok city");

  // Role (max 20)
  if (matching(title, BACKENDISH).length) add(20, "backend");
  else if (/software (engineer|developer)|\bsde\b|\bswe\b|full[- ]?stack|developer/i.test(title)) add(14, "dev role");
  else add(6, "other engineering");

  // Level (max 25)
  const level = matching(title, ENTRY_LEVEL);
  if (level.length) add(15, `entry level (${level[0]})`);
  else add(8);
  const yrs = minYearsAsked(desc);
  if (yrs === undefined) add(10);
  else if (yrs <= 1) add(10, `asks ${yrs}+ yrs`);
  else if (yrs === 2) add(3, "asks 2+ yrs");
  else add(-15, `asks ${yrs}+ yrs ⚠`);

  // Skills (max 35)
  const core = matching(desc, p.skills.core);
  const familiar = matching(desc, p.skills.familiar);
  const exposure = matching(desc, p.skills.exposure);
  add(Math.min(core.length * 5, 25), core.length ? `core: ${core.join(", ")}` : undefined);
  add(Math.min(familiar.length * 2, 8), familiar.length ? `also: ${familiar.join(", ")}` : undefined);
  add(Math.min(exposure.length, 2));

  if (job.employmentType && job.employmentType !== "full-time") reasons.push(job.employmentType);

  return {
    score: Math.max(0, Math.min(100, s)),
    reasons,
    missing: p.skills.core.filter((k) => !core.includes(k)),
  };
}

