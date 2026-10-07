import { loadProfile, type Profile } from "./config.js";
import { ensureUser } from "./db/jobs.js";

/** Single-user for now: "you" are whoever profile.yaml describes. A web app would get this from a login. */
export async function currentUser(): Promise<{ id: number; profile: Profile }> {
  const profile = loadProfile();
  return { id: await ensureUser(profile.email), profile };
}
