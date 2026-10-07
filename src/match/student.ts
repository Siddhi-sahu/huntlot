// Postings that only accept people who are currently studying.
// Kept as a list so it's easy to see (and extend) what counts.
const PATTERNS: RegExp[] = [
  /currently (enrolled|pursuing|studying|a student)/i,
  /(must|should|need to) be (a |an )?(current(ly)? )?(enrolled|full[- ]time student|student)/i,
  /enrolled in an? (accredited )?(degree|bachelor'?s?|master'?s?|university|college|undergraduate|graduate|phd)/i,
  /pursuing an? (bachelor|master|undergraduate|graduate|degree|b\.?\s?tech|m\.?\s?tech|phd|b\.?e\b|m\.?s\b)/i,
  /returning to (school|university|college|your studies)/i,
  /(expected|anticipated) graduation/i,
  /class of 20\d\d/i,
  /(pre-?final|penultimate)[- ]year students?/i,
  /rising (junior|senior)s?/i,
  /co-?op (term|program|student|placement)/i,
  /student status/i,
  /working student|werkstudent|eingeschriebener? student/i,
  /\b(msc|phd|master'?s|bachelor'?s)( ?\/ ?(msc|phd))? internships?\b/i,
];

// "2027 graduates", "Recent graduate (2027)", "graduating in 2027", "2027 batch"
const GRAD_YEAR = /(?:\b(20\d\d)\s*(?:grads?|graduates?|batch|pass[- ]?outs?)\b)|(?:\b(?:graduat\w*|grads?|batch|pass[- ]?out)\b\W{0,3}(?:in |of |by |before |between )?\(?(20\d\d))/gi;

/** The phrase that marks a posting as students-only, or null. `now` is a parameter so tests stay stable. */
export function studentOnlyPhrase(text: string, now = new Date()): string | null {
  for (const p of PATTERNS) {
    const m = text.match(p);
    if (m) return m[0];
  }
  // A graduation year that hasn't happened yet means they want people still studying.
  for (const m of text.matchAll(GRAD_YEAR)) {
    if (Number(m[1] ?? m[2]) >= now.getFullYear()) return m[0];
  }
  return null;
}
