---
"just-bash": patch
---

Add `shasum` (`-a 1/256/384/512`, `-c`, `--tag`). `md5sum`, `sha1sum` and `sha256sum` report missing files and check-mode warnings on stderr, as GNU coreutils does, and accept `--quiet`, `--status`, `--strict` and `--ignore-missing`.
