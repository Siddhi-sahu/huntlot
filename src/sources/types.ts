export type SourceName = "greenhouse" | "lever" | "ashby" | "himalayas" | "remotive" | "remoteok";

/** A job as fetched from a source, normalised to one shape. Nothing here depends on who's looking. */
export interface RawJob {
  source: SourceName;
  company: string;
  externalId: string;
  title: string;
  location: string;
  remote: boolean;
  /** Countries/regions the source says you must be in, when it gives a structured list. [] = anywhere. */
  regions?: string[];
  employmentType?: string;
  url: string;
  applyUrl?: string;
  description: string; // plain text
  postedAt?: Date;
  salaryText?: string;
  salaryMinMonthlyInr?: number;
}

export async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { "user-agent": "huntlot/0.1 (personal job search)" },
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return (await res.json()) as T;
}

const entities: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", nbsp: " " };

export function htmlToText(html: string): string {
  const decode = (s: string) => s.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, e: string) => entities[e] ?? "");
  // Greenhouse double-encodes its HTML, so decode before stripping tags too
  return decode(
    decode(html)
      .replace(/<(br|\/p|\/li|\/h\d|\/div)[^>]*>/gi, "\n")
      .replace(/<li[^>]*>/gi, "• ")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/• *\n+\s*/g, "• ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
}

/** Normalise the many ways sources write job types. */
export function normaliseEmploymentType(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  const t = raw.toLowerCase().replace(/[\s_-]/g, "");
  if (t.includes("intern")) return "intern";
  if (t.includes("contract") || t.includes("freelance") || t.includes("temporary")) return "contract";
  if (t.includes("parttime")) return "part-time";
  if (t.includes("fulltime") || t.includes("permanent")) return "full-time";
  return raw.toLowerCase();
}

// Rough FX so foreign salaries can be compared to your ₹ floor. Good enough for a filter.
const INR_PER: Record<string, number> = { INR: 1, USD: 88, EUR: 103, GBP: 118, CAD: 64, AUD: 58, SGD: 68 };

/** Convert a pay amount to INR per month, or undefined if we can't tell. */
export function toMonthlyInr(amount: number, currency: string, interval: string): number | undefined {
  const rate = INR_PER[currency.toUpperCase()];
  if (!rate || !amount) return undefined;
  const i = interval.toLowerCase();
  const monthly = i.includes("year") || i.includes("annual") ? amount / 12
    : i.includes("month") ? amount
    : i.includes("hour") ? amount * 160
    : undefined;
  return monthly === undefined ? undefined : Math.round(monthly * rate);
}
