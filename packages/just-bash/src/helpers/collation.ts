/**
 * String collation that follows the locale environment the way glibc does.
 *
 * In the C and POSIX locales, and in C.UTF-8, strings collate by byte (for
 * UTF-8, by code point): "A" < "B" < "_x" < "a". Other locales use the host's
 * locale-aware comparison, an approximation of glibc's tables. With no locale
 * variable set, the C locale applies, as for a process started with an empty
 * environment.
 */

export type Collate = (a: string, b: string) => number;

/** The effective LC_COLLATE value: LC_ALL, then LC_COLLATE, then LANG. */
export function collationLocale(env: Map<string, string>): string {
  return env.get("LC_ALL") || env.get("LC_COLLATE") || env.get("LANG") || "";
}

/** True when the locale collates by byte: unset, C, POSIX or C.<codeset>. */
export function isByteCollation(env: Map<string, string>): boolean {
  const locale = collationLocale(env);
  return (
    locale === "" || locale === "C" || locale === "POSIX" || /^C\./.test(locale)
  );
}

/**
 * Compare by Unicode code point, which for UTF-8 text is byte order.
 * UTF-16 code units already order BMP characters correctly; surrogates
 * (characters above U+FFFF) must sort after U+E000..U+FFFF.
 */
export function compareCodePoints(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    let ca = a.charCodeAt(i);
    let cb = b.charCodeAt(i);
    if (ca !== cb) {
      if (ca >= 0xd800) ca = ca >= 0xe000 ? ca - 0x800 : ca + 0x2000;
      if (cb >= 0xd800) cb = cb >= 0xe000 ? cb - 0x800 : cb + 0x2000;
      return ca - cb;
    }
  }
  return a.length - b.length;
}

const localeCompare: Collate = (a, b) => a.localeCompare(b);

/** The collation function for this environment. */
export function getCollate(env: Map<string, string>): Collate {
  return isByteCollation(env) ? compareCodePoints : localeCompare;
}
