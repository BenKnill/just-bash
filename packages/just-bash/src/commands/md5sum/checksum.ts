/**
 * Shared checksum utilities for md5sum, sha1sum, sha256sum and shasum.
 * Uses WebCrypto API for SHA algorithms, pure JS for MD5.
 * Output, --check and its diagnostics follow GNU coreutils 9.7.
 */

import { decodeBytesToUtf8, latin1FromBytes } from "../../encoding.js";
import { rethrowFatalExecutionError } from "../../fatal-execution-error.js";
import type {
  ExecResult,
  RuntimeCommand,
  RuntimeCommandContext,
} from "../../types.js";
import { fsErrorReason } from "../../utils/file-reader.js";
import { hasHelpFlag, showHelp, unknownOption } from "../help.js";

export type HashAlgorithm = "md5" | "sha1" | "sha256" | "sha384" | "sha512";

// Map prevents prototype pollution
const WEBCRYPTO_ALGORITHMS = new Map<string, string>([
  ["sha1", "SHA-1"],
  ["sha256", "SHA-256"],
  ["sha384", "SHA-384"],
  ["sha512", "SHA-512"],
]);

/** Names used by --tag lines ("SHA256 (file) = hash"). */
export const TAG_NAMES: Map<HashAlgorithm, string> = new Map([
  ["md5", "MD5"],
  ["sha1", "SHA1"],
  ["sha256", "SHA256"],
  ["sha384", "SHA384"],
  ["sha512", "SHA512"],
]);

/** Hex digest length of each algorithm. */
export const HEX_LENGTHS: Map<HashAlgorithm, number> = new Map([
  ["md5", 32],
  ["sha1", 40],
  ["sha256", 64],
  ["sha384", 96],
  ["sha512", 128],
]);

// Pure JS MD5 implementation (WebCrypto doesn't support MD5)
function md5(bytes: Uint8Array): string {
  function rotateLeft(x: number, n: number): number {
    return (x << n) | (x >>> (32 - n));
  }

  const K = new Uint32Array([
    0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee, 0xf57c0faf, 0x4787c62a,
    0xa8304613, 0xfd469501, 0x698098d8, 0x8b44f7af, 0xffff5bb1, 0x895cd7be,
    0x6b901122, 0xfd987193, 0xa679438e, 0x49b40821, 0xf61e2562, 0xc040b340,
    0x265e5a51, 0xe9b6c7aa, 0xd62f105d, 0x02441453, 0xd8a1e681, 0xe7d3fbc8,
    0x21e1cde6, 0xc33707d6, 0xf4d50d87, 0x455a14ed, 0xa9e3e905, 0xfcefa3f8,
    0x676f02d9, 0x8d2a4c8a, 0xfffa3942, 0x8771f681, 0x6d9d6122, 0xfde5380c,
    0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70, 0x289b7ec6, 0xeaa127fa,
    0xd4ef3085, 0x04881d05, 0xd9d4d039, 0xe6db99e5, 0x1fa27cf8, 0xc4ac5665,
    0xf4292244, 0x432aff97, 0xab9423a7, 0xfc93a039, 0x655b59c3, 0x8f0ccc92,
    0xffeff47d, 0x85845dd1, 0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1,
    0xf7537e82, 0xbd3af235, 0x2ad7d2bb, 0xeb86d391,
  ]);
  const S = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5,
    9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11,
    16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10,
    15, 21,
  ];

  // Padding
  const bitLen = bytes.length * 8;
  const paddingLen = (bytes.length % 64 < 56 ? 56 : 120) - (bytes.length % 64);
  const padded = new Uint8Array(bytes.length + paddingLen + 8);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, bitLen >>> 0, true);
  view.setUint32(padded.length - 4, Math.floor(bitLen / 0x100000000), true);

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;

  for (let i = 0; i < padded.length; i += 64) {
    const M = new Uint32Array(16);
    for (let j = 0; j < 16; j++) {
      M[j] = view.getUint32(i + j * 4, true);
    }

    let A = a0,
      B = b0,
      C = c0,
      D = d0;

    for (let j = 0; j < 64; j++) {
      let F: number, g: number;
      if (j < 16) {
        F = (B & C) | (~B & D);
        g = j;
      } else if (j < 32) {
        F = (D & B) | (~D & C);
        g = (5 * j + 1) % 16;
      } else if (j < 48) {
        F = B ^ C ^ D;
        g = (3 * j + 5) % 16;
      } else {
        F = C ^ (B | ~D);
        g = (7 * j) % 16;
      }
      F = (F + A + K[j] + M[g]) >>> 0;
      A = D;
      D = C;
      C = B;
      B = (B + rotateLeft(F, S[j])) >>> 0;
    }

    a0 = (a0 + A) >>> 0;
    b0 = (b0 + B) >>> 0;
    c0 = (c0 + C) >>> 0;
    d0 = (d0 + D) >>> 0;
  }

  const result = new Uint8Array(16);
  new DataView(result.buffer).setUint32(0, a0, true);
  new DataView(result.buffer).setUint32(4, b0, true);
  new DataView(result.buffer).setUint32(8, c0, true);
  new DataView(result.buffer).setUint32(12, d0, true);

  return Array.from(result)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function computeHash(
  algorithm: HashAlgorithm,
  data: Uint8Array,
): Promise<string> {
  if (algorithm === "md5") {
    return md5(data);
  }

  const algoName = WEBCRYPTO_ALGORITHMS.get(algorithm);
  if (!algoName) {
    throw new Error(`Unknown algorithm: ${algorithm}`);
  }
  const hashBuffer = await globalThis.crypto.subtle.digest(
    algoName,
    new Uint8Array(data).buffer as ArrayBuffer,
  );
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** GNU quotes names in diagnostics when they hold shell-special characters. */
export function quoteName(name: string): string {
  if (/^[A-Za-z0-9._/+\-:,@%=^~]+$/.test(name)) return name;
  if (!name.includes("'")) return `'${name}'`;
  return `"${name.replace(/(["\\$`])/g, "\\$1")}"`;
}

/** Reads a hash input; "-" is standard input. */
export async function readHashInput(
  ctx: RuntimeCommandContext,
  file: string,
): Promise<{ bytes: Uint8Array } | { error: string }> {
  if (file === "-") {
    return {
      bytes: Uint8Array.from(latin1FromBytes(ctx.stdin), (c) =>
        c.charCodeAt(0),
      ),
    };
  }
  try {
    const path = ctx.fs.resolvePath(ctx.cwd, file);
    const stat = await ctx.fs.stat(path);
    if (stat.isDirectory) return { error: "Is a directory" };
    return { bytes: await ctx.fs.readFileBuffer(path) };
  } catch (error) {
    rethrowFatalExecutionError(error);
    return { error: fsErrorReason(error) };
  }
}

async function readListText(
  ctx: RuntimeCommandContext,
  file: string,
): Promise<{ text: string } | { error: string }> {
  try {
    const path = ctx.fs.resolvePath(ctx.cwd, file);
    const stat = await ctx.fs.stat(path);
    if (stat.isDirectory) return { error: "Is a directory" };
    return { text: await ctx.fs.readFile(path) };
  } catch (error) {
    rethrowFatalExecutionError(error);
    return { error: fsErrorReason(error) };
  }
}

/** GNU marks a name holding a backslash or newline with a leading "\". */
function escapeName(name: string): { name: string; escaped: boolean } {
  if (!name.includes("\\") && !name.includes("\n")) {
    return { name, escaped: false };
  }
  return {
    name: name.replace(/\\/g, "\\\\").replace(/\n/g, "\\n"),
    escaped: true,
  };
}

function unescapeName(name: string): string {
  return name.replace(/\\(\\|n)/g, (_, c: string) => (c === "n" ? "\n" : "\\"));
}

export interface HashLineOptions {
  binary: boolean;
  tag: boolean;
}

/** One output line for a computed digest, as GNU md5sum/sha*sum print it. */
export function formatHashLine(
  algorithm: HashAlgorithm,
  hash: string,
  file: string,
  options: HashLineOptions,
): string {
  const { name, escaped } = escapeName(file);
  const prefix = escaped ? "\\" : "";
  if (options.tag) {
    return `${prefix}${TAG_NAMES.get(algorithm)} (${name}) = ${hash}\n`;
  }
  return `${prefix}${hash} ${options.binary ? "*" : " "}${name}\n`;
}

export interface ParsedCheckLine {
  /** Algorithm named by a --tag line, if any. */
  tagAlgorithm?: HashAlgorithm;
  hash: string;
  file: string;
  /** The name as printed in results (GNU keeps the escape). */
  display: string;
}

/** Parses one --check line: GNU "HASH  FILE" / "HASH *FILE", or a --tag line. */
export function parseCheckLine(
  line: string,
  escapedDisplay: boolean,
  separatorRequired = false,
): ParsedCheckLine | null {
  let text = line.endsWith("\r") ? line.slice(0, -1) : line;
  const escaped = text.startsWith("\\");
  if (escaped) text = text.slice(1);
  const tagged = text.match(/^([A-Z0-9]+) ?\((.*)\) ?= ([0-9a-fA-F]+)$/);
  if (tagged) {
    let tagAlgorithm: HashAlgorithm | undefined;
    for (const [algorithm, tagName] of TAG_NAMES) {
      if (tagName === tagged[1]) tagAlgorithm = algorithm;
    }
    if (!tagAlgorithm) return null;
    const file = escaped ? unescapeName(tagged[2]) : tagged[2];
    return {
      tagAlgorithm,
      hash: tagged[3].toLowerCase(),
      file,
      display: escaped && escapedDisplay ? `\\${tagged[2]}` : file,
    };
  }
  // A space or tab follows the digest. GNU then takes an optional " " or "*"
  // mode character; shasum requires one.
  const plain = separatorRequired
    ? text.match(/^([0-9a-fA-F]+)[ \t]([ *])(.+)$/)
    : text.match(/^([0-9a-fA-F]+)[ \t]([ *]?)(.+)$/);
  if (!plain) return null;
  const file = escaped ? unescapeName(plain[3]) : plain[3];
  return {
    hash: plain[1].toLowerCase(),
    file,
    display: escaped && escapedDisplay ? `\\${plain[3]}` : file,
  };
}

export interface CheckOptions {
  quiet: boolean;
  status: boolean;
  strict: boolean;
  ignoreMissing: boolean;
}

export interface CheckDialect {
  name: string;
  /** Picks the algorithm for a line, or null when the line is unusable. */
  algorithmFor: (line: ParsedCheckLine) => HashAlgorithm | null;
  /** Message after "NAME: FILE: " when a list has no usable line. */
  noLinesMessage: string;
  /** Quote the list name in that message (GNU) or not (shasum). */
  quoteListName: boolean;
  /** Results show a backslash-escaped name with its leading "\" (GNU). */
  escapedDisplay: boolean;
  /** Exit status when a list cannot be opened; shasum stops there. */
  missingList: { exitCode: number; stop: boolean };
  /** Quote file names in diagnostics (GNU) or print them as given (shasum). */
  quoteNames: boolean;
  /** Require a mode character (" " or "*") after the separator (shasum). */
  separatorRequired: boolean;
  /** Skip empty lines silently (GNU); shasum counts them as improper. */
  skipEmptyLines: boolean;
}

const plural = (n: number, one: string, many: string): string =>
  n === 1 ? `${n} ${one}` : `${n} ${many}`;

/** Runs --check over the given checksum lists. */
export async function checkLists(
  ctx: RuntimeCommandContext,
  dialect: CheckDialect,
  lists: string[],
  options: CheckOptions,
): Promise<ExecResult> {
  let stdout = "";
  let stderr = "";
  let exitCode = 0;
  for (const list of lists) {
    let content: string;
    if (list === "-") {
      content = decodeBytesToUtf8(ctx.stdin);
    } else {
      // The list is text (hash + name); decode UTF-8 so non-ASCII names
      // survive.
      const read = await readListText(ctx, list);
      if ("error" in read) {
        const shown = dialect.quoteNames ? quoteName(list) : list;
        stderr += `${dialect.name}: ${shown}: ${read.error}\n`;
        exitCode = Math.max(exitCode, dialect.missingList.exitCode);
        if (dialect.missingList.stop) return { stdout, stderr, exitCode };
        continue;
      }
      content = read.text;
    }
    const listName = list === "-" ? "standard input" : list;
    let improper = 0;
    let unreadable = 0;
    let mismatched = 0;
    let verified = 0;
    let usable = 0;
    const lines = content.split("\n");
    if (lines[lines.length - 1] === "") lines.pop();
    for (const line of lines) {
      // Both GNU and shasum skip comment lines; GNU also skips empty ones.
      if (line.startsWith("#")) continue;
      if (dialect.skipEmptyLines && (line === "" || line === "\r")) continue;
      const parsed = parseCheckLine(
        line,
        dialect.escapedDisplay,
        dialect.separatorRequired,
      );
      const algorithm = parsed ? dialect.algorithmFor(parsed) : null;
      if (
        !parsed ||
        !algorithm ||
        parsed.hash.length !== HEX_LENGTHS.get(algorithm)
      ) {
        improper++;
        continue;
      }
      usable++;
      const input = await readHashInput(ctx, parsed.file);
      if ("error" in input) {
        if (
          options.ignoreMissing &&
          input.error === "No such file or directory"
        )
          continue;
        const shown = dialect.quoteNames ? quoteName(parsed.file) : parsed.file;
        stderr += `${dialect.name}: ${shown}: ${input.error}\n`;
        if (!options.status)
          stdout += `${parsed.display}: FAILED open or read\n`;
        unreadable++;
        continue;
      }
      const ok = (await computeHash(algorithm, input.bytes)) === parsed.hash;
      if (ok) verified++;
      else mismatched++;
      if (!options.status && !(ok && options.quiet)) {
        stdout += `${parsed.display}: ${ok ? "OK" : "FAILED"}\n`;
      }
    }
    const shownList = dialect.quoteListName ? quoteName(listName) : listName;
    if (usable === 0) {
      stderr += `${dialect.name}: ${shownList}: ${dialect.noLinesMessage}\n`;
      exitCode = Math.max(exitCode, 1);
      continue;
    }
    if (!options.status) {
      if (improper > 0) {
        stderr += `${dialect.name}: WARNING: ${plural(improper, "line is", "lines are")} improperly formatted\n`;
      }
      if (unreadable > 0) {
        stderr += `${dialect.name}: WARNING: ${plural(unreadable, "listed file", "listed files")} could not be read\n`;
      }
      if (mismatched > 0) {
        stderr += `${dialect.name}: WARNING: ${plural(mismatched, "computed checksum", "computed checksums")} did NOT match\n`;
      }
      if (options.ignoreMissing && verified === 0) {
        stderr += `${dialect.name}: ${shownList}: no file was verified\n`;
      }
    }
    if (
      mismatched > 0 ||
      unreadable > 0 ||
      (options.strict && improper > 0) ||
      (options.ignoreMissing && verified === 0)
    ) {
      exitCode = Math.max(exitCode, 1);
    }
  }
  return { stdout, stderr, exitCode };
}

/** Computes and prints the digest of each input, reporting unreadable ones. */
export async function hashInputs(
  ctx: RuntimeCommandContext,
  name: string,
  algorithm: HashAlgorithm,
  files: string[],
  options: HashLineOptions,
  quoteNames = true,
): Promise<ExecResult> {
  let stdout = "";
  let stderr = "";
  let exitCode = 0;
  for (const file of files) {
    const input = await readHashInput(ctx, file);
    if ("error" in input) {
      // Errors go to stderr, so `md5sum a b > sums` stays clean
      stderr += `${name}: ${quoteNames ? quoteName(file) : file}: ${input.error}\n`;
      exitCode = 1;
      continue;
    }
    const hash = await computeHash(algorithm, input.bytes);
    stdout += formatHashLine(algorithm, hash, file, options);
  }
  return { stdout, stderr, exitCode };
}

export function createChecksumCommand(
  name: string,
  algorithm: HashAlgorithm,
  summary: string,
): RuntimeCommand {
  const help = {
    name,
    summary,
    usage: `${name} [OPTION]... [FILE]...`,
    options: [
      "-b, --binary   read in binary mode (marks lines with *)",
      "-c, --check    read checksums from FILEs and check them",
      "    --tag      create a BSD-style checksum",
      "-t, --text     read in text mode (default)",
      "    --ignore-missing  don't fail or report status for missing files",
      "    --quiet    don't print OK for each successfully verified file",
      "    --status   don't output anything, status code shows success",
      "    --strict   exit non-zero for improperly formatted checksum lines",
      "    --help     display this help and exit",
    ],
  };
  const dialect: CheckDialect = {
    name,
    algorithmFor: (line) =>
      line.tagAlgorithm === undefined || line.tagAlgorithm === algorithm
        ? algorithm
        : null,
    noLinesMessage: "no properly formatted checksum lines found",
    quoteListName: true,
    escapedDisplay: true,
    missingList: { exitCode: 1, stop: false },
    quoteNames: true,
    separatorRequired: false,
    skipEmptyLines: true,
  };

  return {
    name,
    async execute(
      args: string[],
      ctx: RuntimeCommandContext,
    ): Promise<ExecResult> {
      if (hasHelpFlag(args)) return showHelp(help);

      let check = false;
      const lineOptions: HashLineOptions = { binary: false, tag: false };
      const checkOptions: CheckOptions = {
        quiet: false,
        status: false,
        strict: false,
        ignoreMissing: false,
      };
      const files: string[] = [];
      let parseOptions = true;

      for (const arg of args) {
        if (!parseOptions || arg === "-" || !arg.startsWith("-")) {
          files.push(arg);
        } else if (arg === "--") parseOptions = false;
        else if (arg === "--check") check = true;
        else if (arg === "--binary") lineOptions.binary = true;
        else if (arg === "--text") lineOptions.binary = false;
        else if (arg === "--tag") lineOptions.tag = true;
        else if (arg === "--quiet") checkOptions.quiet = true;
        else if (arg === "--status") checkOptions.status = true;
        else if (arg === "--strict") checkOptions.strict = true;
        else if (arg === "--ignore-missing") checkOptions.ignoreMissing = true;
        else if (arg.startsWith("--")) return unknownOption(name, arg);
        else {
          for (const flag of arg.slice(1)) {
            if (flag === "c") check = true;
            else if (flag === "b") lineOptions.binary = true;
            else if (flag === "t") lineOptions.binary = false;
            else return unknownOption(name, `-${flag}`);
          }
        }
      }

      if (files.length === 0) files.push("-");

      if (check) return checkLists(ctx, dialect, files, checkOptions);
      return hashInputs(ctx, name, algorithm, files, lineOptions);
    },
  };
}
