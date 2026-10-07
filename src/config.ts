import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { parse } from "yaml";
import { z } from "zod";

const root = resolve(import.meta.dirname, "..");
const words = z.array(z.string());

const ProfileSchema = z.object({
  name: z.string(),
  email: z.string(),
  phone: z.string(),
  country: z.string(),
  links: z.record(z.string(), z.string()),
  resume_pdf: z.string(),
  about: z.string(),
  education: z.array(z.object({ degree: z.string(), school: z.string(), years: z.string() }).loose()),
  targets: z.object({
    remote: z.boolean(),
    locations: z.object({ preferred: words, ok: words }),
    employment_types: words,
    roles: words,
    exclude_titles: words,
    exclude_companies: words,
    min_salary_monthly_inr: z.number(),
    exclude_student_only: z.boolean(),
  }),
  skills: z.object({ core: words, familiar: words, exposure: words }),
  answers: z.record(z.string(), z.string()),
});
export type Profile = z.infer<typeof ProfileSchema>;

const BoardSchema = z.object({
  name: z.string(),
  source: z.enum(["greenhouse", "lever", "ashby"]),
  slug: z.string(),
});
export type Board = z.infer<typeof BoardSchema>;

const FeedsSchema = z.object({
  himalayas: z.object({ queries: words, pages: z.number().int().min(1) }).optional(),
  remotive: z.object({ categories: words }).optional(),
  remoteok: z.object({}).optional(),
});
export type Feeds = z.infer<typeof FeedsSchema>;

function readYaml(file: string): unknown {
  return parse(readFileSync(resolve(root, file), "utf8"));
}

export function loadProfile(): Profile {
  if (!existsSync(resolve(root, "profile.yaml")))
    throw new Error("No profile.yaml yet. Create it with:  cp example-profile.yaml profile.yaml  (then fill it in)");
  const profile = ProfileSchema.parse(readYaml("profile.yaml"));
  profile.resume_pdf = profile.resume_pdf.replace(/^~/, homedir());
  return profile;
}

export function loadSources(): { boards: Board[]; feeds: Feeds } {
  return z.object({ boards: z.array(BoardSchema), feeds: FeedsSchema.default({}) }).parse(readYaml("sources.yaml"));
}
