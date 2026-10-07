import { z } from "zod";
import type { Profile } from "../config.js";
import type { JobRow } from "../db/jobs.js";
import { chatJson } from "./client.js";

/**
 * What the model tells us about one job. Stored as-is in user_jobs.ai.
 * Field order matters: models write JSON top to bottom, so the facts and reasoning come first
 * and `fit` comes last, after the model has "thought" about the job.
 */
export const Assessment = z.object({
  summary: z.string().describe("One sentence about the JOB (not the candidate): what you'd be doing"),
  years_required: z.number().int().min(0).max(30).nullable()
    .describe("Minimum years of experience the posting states as a number. null if it states none"),
  employment_type: z.enum(["full-time", "intern", "contract", "part-time", "unclear"]),
  open_to_india: z.enum(["yes", "no", "unclear"]).describe("Can someone living in India get this job?"),
  students_only: z.boolean().describe("True only if applicants must currently be enrolled students"),
  education_gate: z.enum(["none", "degree_preferred", "degree_required", "cs_degree_required"]),
  missing: z.array(z.string()).describe("Requirements the posting states that the candidate clearly lacks (max 5)"),
  red_flags: z.array(z.string()).describe("Problems with the JOB: unpaid, vague, scam signs, unrealistic asks (max 3)"),
  why: z.string().describe("One or two sentences: why it does or doesn't fit this candidate"),
  fit: z.number().int().min(0).max(100)
    .describe("0-100. 80+: strong match, apply. 50-79: worth applying. 20-49: stretch. Below 20: not a fit"),
});
export type Assessment = z.infer<typeof Assessment>;

const SYSTEM = `You screen job postings for one candidate.
Rules:
- Use only facts written in the posting and the candidate profile. Never invent requirements: if the posting doesn't state years of experience, years_required is null and you must not mention years.
- Score like a realistic recruiter. "fit" is an integer from 0 to 100 (not 0-1). Roles stating 3+ years required are usually below 40 for this candidate; matching entry-level roles are 60+.
- open_to_india: "no" if applicants are limited to other countries/regions (e.g. "US only", "must be based in EU", needs US work authorization); "yes" if it says worldwide/anywhere or includes India/APAC; otherwise "unclear".

`;

function candidate(p: Profile): string {
  const s = p.skills;
  return [
    `Lives in ${p.country}. Not a student. Prefers remote work; open to full-time, internships, contracts.`,
    `Education: ${p.education.map((e) => `${e.degree} (${e.years})`).join("; ")}.`,
    `Experience: ${p.about}`,
    `Strong: ${s.core.join(", ")}. Familiar: ${s.familiar.join(", ")}. Some exposure: ${s.exposure.join(", ")}.`,
  ].join("\n");
}

export function assessJob(job: JobRow, profile: Profile) {
  const user = `CANDIDATE
${candidate(profile)}

JOB
Title: ${job.title}
Company: ${job.company}
Location: ${job.location}
Type: ${job.employment_type ?? "not stated"}
${job.salary_text ? `Pay: ${job.salary_text}\n` : ""}
${job.description.slice(0, 6000)}`;
  return chatJson({ purpose: "assess", system: SYSTEM, user, schema: Assessment });
}

/** If the assessment rules a job out, the reason to hide it; otherwise null. */
export function aiHideReason(a: Assessment, p: Profile): string | null {
  if (p.targets.exclude_student_only && a.students_only) return "ai: students only";
  if (a.open_to_india === "no") return "ai: not open to India";
  return null;
}
