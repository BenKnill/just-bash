/**
 * shasum - Perl Digest::SHA's command (shasum 6.04), as shipped with macOS
 * and Debian/Ubuntu. Digests and --check use the shared checksum code;
 * options, messages and exit statuses follow shasum rather than GNU.
 */

import type {
  ExecResult,
  RuntimeCommand,
  RuntimeCommandContext,
} from "../../types.js";
import { showHelp } from "../help.js";
import {
  type CheckDialect,
  type CheckOptions,
  checkLists,
  type HashAlgorithm,
  type HashLineOptions,
  hashInputs,
} from "./checksum.js";

const help = {
  name: "shasum",
  summary: "print or check SHA checksums",
  usage: "shasum [OPTION]... [FILE]...",
  options: [
    "-a, --algorithm   1 (default), 256, 384, 512",
    "-b, --binary      read in binary mode",
    "-c, --check       read SHA sums from the FILEs and check them",
    "    --tag         create a BSD-style checksum",
    "-t, --text        read in text mode (default)",
    "-q, --quiet       don't print OK for each successfully verified file",
    "-s, --status      don't output anything, status code shows success",
    "    --strict      exit non-zero for improperly formatted checksum lines",
    "-h, --help        display this help and exit",
  ],
};

// Map prevents prototype pollution
const ALGORITHMS = new Map<string, HashAlgorithm>([
  ["1", "sha1"],
  ["256", "sha256"],
  ["384", "sha384"],
  ["512", "sha512"],
]);
/** Valid for shasum, but WebCrypto has no SHA-224 or SHA-512/t. */
const UNSUPPORTED = new Set(["224", "512224", "512256"]);

/** shasum -c picks each line's algorithm from its digest length. */
const BY_LENGTH = new Map<number, HashAlgorithm>([
  [40, "sha1"],
  [64, "sha256"],
  [96, "sha384"],
  [128, "sha512"],
]);

const dialect: CheckDialect = {
  name: "shasum",
  algorithmFor: (line) => {
    if (line.tagAlgorithm !== undefined) {
      return line.tagAlgorithm === "md5" ? null : line.tagAlgorithm;
    }
    return BY_LENGTH.get(line.hash.length) ?? null;
  },
  noLinesMessage: "no properly formatted SHA checksum lines found",
  quoteListName: false,
  escapedDisplay: false,
  missingList: { exitCode: 2, stop: true },
  quoteNames: false,
  separatorRequired: true,
};

function usageError(message: string): ExecResult {
  return {
    stdout: "",
    stderr: `${message}\nType shasum -h for help\n`,
    exitCode: 1,
  };
}

export const shasumCommand: RuntimeCommand = {
  name: "shasum",

  async execute(
    args: string[],
    ctx: RuntimeCommandContext,
  ): Promise<ExecResult> {
    let algorithmName = "1";
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

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (!parseOptions || arg === "-" || !arg.startsWith("-")) {
        files.push(arg);
        continue;
      }
      if (arg === "--") {
        parseOptions = false;
        continue;
      }
      if (arg.startsWith("--")) {
        const [long, inline] = arg.slice(2).split(/=(.*)/s, 2);
        if (long === "algorithm") {
          const value = inline ?? args[++i];
          if (value === undefined) {
            return usageError("Option algorithm requires an argument");
          }
          algorithmName = value;
        } else if (long === "check") check = true;
        else if (long === "binary") lineOptions.binary = true;
        else if (long === "text") lineOptions.binary = false;
        else if (long === "tag") lineOptions.tag = true;
        else if (long === "quiet") checkOptions.quiet = true;
        else if (long === "status") checkOptions.status = true;
        else if (long === "strict") checkOptions.strict = true;
        else if (long === "help") return showHelp(help);
        else return usageError(`Unknown option: ${long}`);
        continue;
      }
      // Bundled short options, as Getopt::Long's bundling allows: -a256, -ca 256
      for (let j = 1; j < arg.length; j++) {
        const flag = arg[j];
        if (flag === "a") {
          const value = arg.length > j + 1 ? arg.slice(j + 1) : args[++i];
          if (value === undefined) {
            return usageError("Option a requires an argument");
          }
          algorithmName = value;
          break;
        }
        if (flag === "c") check = true;
        else if (flag === "b") lineOptions.binary = true;
        else if (flag === "t") lineOptions.binary = false;
        else if (flag === "q") checkOptions.quiet = true;
        else if (flag === "s") checkOptions.status = true;
        else if (flag === "h") return showHelp(help);
        else return usageError(`Unknown option: ${flag}`);
      }
    }

    if (UNSUPPORTED.has(algorithmName)) {
      return {
        stdout: "",
        stderr: `shasum: algorithm ${algorithmName} is not supported here\n`,
        exitCode: 1,
      };
    }
    const algorithm = ALGORITHMS.get(algorithmName);
    if (!algorithm) {
      return usageError("shasum: Unrecognized algorithm");
    }

    if (files.length === 0) files.push("-");
    if (check) return checkLists(ctx, dialect, files, checkOptions);
    return hashInputs(ctx, "shasum", algorithm, files, lineOptions, false);
  },
};

import type { CommandFuzzInfo } from "../fuzz-flags-types.js";

export const flagsForFuzzing: CommandFuzzInfo = {
  name: "shasum",
  flags: [
    { flag: "-a", type: "value", valueHint: "string" },
    { flag: "-c", type: "boolean" },
    { flag: "-b", type: "boolean" },
  ],
  needsFiles: true,
};
