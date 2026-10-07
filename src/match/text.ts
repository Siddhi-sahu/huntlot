const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Whole-word, case-insensitive match. "node.js" also matches "nodejs" / "node js"; plurals allowed. */
export function termRegex(term: string): RegExp {
  const body = escape(term.toLowerCase()).replace(/\\\./g, "[.\\s]?").replace(/ /g, "[\\s-]?");
  return new RegExp(`(?<![a-z0-9])${body}s?(?![a-z0-9])`, "i");
}

export function hasTerm(text: string, term: string): boolean {
  return termRegex(term).test(text);
}

export function matching(text: string, terms: string[]): string[] {
  return terms.filter((t) => hasTerm(text, t));
}

/** Smallest "N years" figure in the text, e.g. "2+ years of experience" -> 2. */
export function minYearsAsked(text: string): number | undefined {
  const years = [...text.matchAll(/(\d{1,2})\s*(?:\+|plus)?\s*(?:(?:-|–|to)\s*\d{1,2}\s*)?\+?\s*years?/gi)]
    .map((m) => Number(m[1]))
    .filter((n) => n <= 15);
  return years.length ? Math.min(...years) : undefined;
}
