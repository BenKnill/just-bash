/**
 * The order of GNU `sort -V` and `ls -v`, as the GNU coreutils manual
 * describes it under "Version sort ordering". It does not depend on the
 * locale.
 *
 * - The empty string sorts first, then ".", then "..", then other names
 *   starting with ".", then everything else.
 * - A file suffix, the longest tail matching (\.[A-Za-z~][A-Za-z0-9~]*)*$
 *   that does not start at the first character, is set aside. The strings
 *   are compared without their suffixes, and again whole only if that ties.
 * - Each comparison alternates between a run of non-digits, compared
 *   character by character with "~" before anything (even the end of the
 *   run), then the end of the run, then letters, then everything else, and a
 *   run of digits, compared by numeric value with leading zeros ignored.
 */

const isDigit = (c: number): boolean => c >= 0x30 && c <= 0x39;

const isLetter = (c: number): boolean =>
  (c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a);

/** Characters allowed after the first one of a suffix part. */
const isSuffixChar = (c: number): boolean =>
  isDigit(c) || isLetter(c) || c === 0x7e;

/** Rank of the character at i in a non-digit run; the run ends at a digit. */
function rank(s: string, i: number): number {
  if (i >= s.length) return 0;
  let c = s.charCodeAt(i);
  if (isDigit(c)) return 0;
  if (c === 0x7e) return -1;
  if (isLetter(c)) return c;
  // Other characters sort after letters, in code point (UTF-8 byte) order;
  // surrogates (characters above U+FFFF) go after U+E000..U+FFFF.
  if (c >= 0xd800) c = c >= 0xe000 ? c - 0x800 : c + 0x2000;
  return c + 0x100;
}

/** Compares a and b as alternating non-digit and digit runs. */
function compareRuns(a: string, b: string): number {
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    while (
      (i < a.length && !isDigit(a.charCodeAt(i))) ||
      (j < b.length && !isDigit(b.charCodeAt(j)))
    ) {
      const diff = rank(a, i) - rank(b, j);
      if (diff !== 0) return diff;
      i++;
      j++;
    }
    while (i < a.length && a.charCodeAt(i) === 0x30) i++;
    while (j < b.length && b.charCodeAt(j) === 0x30) j++;
    let endA = i;
    let endB = j;
    while (endA < a.length && isDigit(a.charCodeAt(endA))) endA++;
    while (endB < b.length && isDigit(b.charCodeAt(endB))) endB++;
    // Without leading zeros, the longer number is the larger one
    if (endA - i !== endB - j) return endA - i - (endB - j);
    for (; i < endA; i++, j++) {
      const diff = a.charCodeAt(i) - b.charCodeAt(j);
      if (diff !== 0) return diff;
    }
  }
  return 0;
}

/** Start of the file suffix of s, or s.length when it has none. */
function suffixStart(s: string): number {
  let start = s.length;
  for (;;) {
    let k = start;
    while (k > 1 && isSuffixChar(s.charCodeAt(k - 1))) k--;
    const c = s.charCodeAt(k);
    if (
      k >= 2 &&
      k < start &&
      s.charCodeAt(k - 1) === 0x2e &&
      (isLetter(c) || c === 0x7e)
    ) {
      start = k - 1;
    } else {
      return start;
    }
  }
}

/** "", ".", ".." and other dot names sort before the rest, in that order. */
function priority(s: string): number {
  if (s === "") return 0;
  if (s === ".") return 1;
  if (s === "..") return 2;
  return s.startsWith(".") ? 3 : 4;
}

/** Compares two strings in GNU version order (negative, zero or positive). */
export function compareVersions(a: string, b: string): number {
  const pa = priority(a);
  const pb = priority(b);
  if (pa !== pb) return pa - pb;
  if (pa < 3) return 0;
  const endA = suffixStart(a);
  const endB = suffixStart(b);
  const result = compareRuns(a.slice(0, endA), b.slice(0, endB));
  if (result !== 0 || (endA === a.length && endB === b.length)) return result;
  return compareRuns(a, b);
}
