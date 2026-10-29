---
"just-bash": patch
---

`sort` collates by byte (code point) order under the C, POSIX and C.UTF-8 locales and when no locale variable is set, as GNU sort does, instead of always using a case-folded locale comparison. Other locales keep the locale-aware comparison. **Behaviour change:** with no `LC_ALL`, `LC_COLLATE` or `LANG` set, sort output now puts upper case before lower case.
