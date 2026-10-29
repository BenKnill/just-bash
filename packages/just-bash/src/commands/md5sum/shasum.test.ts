import { describe, expect, it } from "vitest";
import { Bash } from "../../Bash.js";

// Expected outputs recorded from shasum 6.04 (Perl Digest::SHA) and GNU
// coreutils 9.7 sha256sum on Ubuntu 26.04.
const HELLO256 =
  "5891b5b522d5df086d0ff0b110fbd9d21bb4fc7163af34d08286a2e846f6be03";
const HELLO1 = "f572d396fae9206628714fb2ce00f72e94f2258f";
const EMPTY256 =
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

async function run(script: string) {
  return new Bash().exec(`printf 'hello\\n' > a; printf '' > e; ${script}`);
}

describe("shasum", () => {
  it("defaults to SHA-1 and supports -a 256/384/512", async () => {
    const result = await run(
      "shasum a; shasum -a 256 a e; shasum -a256 a; shasum --algorithm=256 a; shasum -a 384 a; shasum -a 512 a",
    );
    expect(result.stdout).toBe(
      `${HELLO1}  a\n${HELLO256}  a\n${EMPTY256}  e\n${HELLO256}  a\n${HELLO256}  a\n` +
        "1d0f284efe3edea4b9ca3bd514fa134b17eae361ccc7a1eefeff801b9bd6604e01f21f6bf249ef030599f0c218f2ba8c  a\n" +
        "e7c22b994c59d9cf2b48e549b1e24666636045930d3da7c1acb299d1c3b7f931f94aae41edda2c2b207a36e10f8bcb8d45223e54878f5b316e7ce3b6bc019629  a\n",
    );
    expect(result.exitCode).toBe(0);
  });

  it("reads stdin and marks binary mode and BSD tags", async () => {
    const result = await run(
      "printf hi | shasum -a 256; shasum -b -a 256 a; shasum -a 256 --tag a",
    );
    expect(result.stdout).toBe(
      "8f434346648f6b96df89dda901c5176b10a6d83961dd3c1ac88b59b2dc327aa4  -\n" +
        `${HELLO256} *a\nSHA256 (a) = ${HELLO256}\n`,
    );
  });

  it("reports unreadable inputs and continues", async () => {
    const result = await run(
      "mkdir d; shasum -a 256 nope a; echo rc=$?; shasum -a 256 d; echo rc=$?",
    );
    expect(result.stdout).toBe(`${HELLO256}  a\nrc=1\nrc=1\n`);
    expect(result.stderr).toBe(
      "shasum: nope: No such file or directory\nshasum: d: Is a directory\n",
    );
  });

  it("checks lists, inferring each line's algorithm", async () => {
    const result = await run(
      "shasum -a 256 a e > S; shasum -a 256 -c S; echo rc=$?; shasum -c S; echo rc=$?; " +
        "printf 'hello2\\n' > a; shasum -a 256 -c S; echo rc=$?; " +
        "shasum -a 256 -c -q S; echo rc=$?; shasum -a 256 -c -s S; echo rc=$?",
    );
    expect(result.stdout).toBe(
      "a: OK\ne: OK\nrc=0\na: OK\ne: OK\nrc=0\na: FAILED\ne: OK\nrc=1\na: FAILED\nrc=1\nrc=1\n",
    );
    expect(result.stderr).toBe(
      "shasum: WARNING: 1 computed checksum did NOT match\n".repeat(2),
    );
  });

  it("reports missing targets and stops at a missing list with status 2", async () => {
    const result = await run(
      "shasum -a 256 a e > S; rm e; shasum -a 256 -c S; echo rc=$?; shasum -c S nolist; echo rc=$?; shasum -c nolist S; echo rc=$?",
    );
    expect(result.stdout).toBe(
      "a: OK\ne: FAILED open or read\nrc=1\na: OK\ne: FAILED open or read\nrc=2\nrc=2\n",
    );
    expect(result.stderr).toBe(
      "shasum: e: No such file or directory\n" +
        "shasum: WARNING: 1 listed file could not be read\n" +
        "shasum: e: No such file or directory\n" +
        "shasum: WARNING: 1 listed file could not be read\n" +
        "shasum: nolist: No such file or directory\n" +
        "shasum: nolist: No such file or directory\n",
    );
  });

  it("requires two separator characters and SHA-length digests", async () => {
    const result = await run(
      "shasum -a 256 a | sed 's/  / /' | shasum -a 256 -c; echo rc=$?; md5sum a > M5; shasum -c M5; echo rc=$?; " +
        "printf 'SHA1 (a) = f572d396fae9206628714fb2ce00f72e94f2258f\\n' | shasum -a 256 -c; echo rc=$?",
    );
    expect(result.stdout).toBe("rc=1\nrc=1\na: OK\nrc=0\n");
    expect(result.stderr).toBe(
      "shasum: standard input: no properly formatted SHA checksum lines found\n" +
        "shasum: M5: no properly formatted SHA checksum lines found\n",
    );
  });

  it("counts improperly formatted lines, failing only with --strict", async () => {
    const result = await run(
      "shasum a > S; printf 'junk\\n' >> S; shasum -c S; echo rc=$?; shasum -c --strict S; echo rc=$?",
    );
    expect(result.stdout).toBe("a: OK\nrc=0\na: OK\nrc=1\n");
    expect(result.stderr).toBe(
      "shasum: WARNING: 1 line is improperly formatted\n".repeat(2),
    );
  });

  it("rejects unknown options and algorithms like shasum", async () => {
    const result = await run(
      "shasum -z a; echo rc=$?; shasum -a 7 a; echo rc=$?",
    );
    expect(result.stdout).toBe("rc=1\nrc=1\n");
    expect(result.stderr).toBe(
      "Unknown option: z\nType shasum -h for help\nshasum: Unrecognized algorithm\nType shasum -h for help\n",
    );
  });

  it("says loudly that SHA-224 and SHA-512/t are unavailable", async () => {
    const result = await run("shasum -a 224 a; echo rc=$?");
    expect(result.stdout).toBe("rc=1\n");
    expect(result.stderr).toBe("shasum: algorithm 224 is not supported here\n");
  });
});

describe("GNU checksum --check diagnostics", () => {
  it("writes warnings to stderr and supports --quiet and --status", async () => {
    const result = await run(
      "sha256sum a e > S; printf 'hello2\\n' > a; sha256sum -c S; echo rc=$?; " +
        "sha256sum -c --quiet S; echo rc=$?; sha256sum -c --status S; echo rc=$?",
    );
    expect(result.stdout).toBe(
      "a: FAILED\ne: OK\nrc=1\na: FAILED\nrc=1\nrc=1\n",
    );
    expect(result.stderr).toBe(
      "sha256sum: WARNING: 1 computed checksum did NOT match\n".repeat(2),
    );
  });

  it("reports unreadable targets, lists and directories", async () => {
    const result = await run(
      "sha256sum a e > S; rm e; mkdir d; sha256sum -c S; echo rc=$?; sha256sum -c nolist; echo rc=$?; sha256sum d; echo rc=$?",
    );
    expect(result.stdout).toBe(
      "a: OK\ne: FAILED open or read\nrc=1\nrc=1\nrc=1\n",
    );
    expect(result.stderr).toBe(
      "sha256sum: e: No such file or directory\n" +
        "sha256sum: WARNING: 1 listed file could not be read\n" +
        "sha256sum: nolist: No such file or directory\n" +
        "sha256sum: d: Is a directory\n",
    );
  });

  it("checks --tag lines and rejects lists without usable lines", async () => {
    const result = await run(
      "sha256sum --tag a; sha256sum --tag a > T; sha256sum -c T; echo rc=$?; " +
        "printf 'garbage\\n' > M; sha256sum -c M; echo rc=$?; " +
        "sha256sum a > S2; echo junk >> S2; sha256sum -c S2; echo rc=$?; " +
        "printf 'x\\n' | sha256sum -c; echo rc=$?",
    );
    expect(result.stdout).toBe(
      `SHA256 (a) = ${HELLO256}\na: OK\nrc=0\nrc=1\na: OK\nrc=0\nrc=1\n`,
    );
    expect(result.stderr).toBe(
      "sha256sum: M: no properly formatted checksum lines found\n" +
        "sha256sum: WARNING: 1 line is improperly formatted\n" +
        "sha256sum: 'standard input': no properly formatted checksum lines found\n",
    );
  });

  it("escapes names holding a backslash", async () => {
    const result = await run(
      "printf 'hi\\n' > 'b\\c'; sha256sum 'b\\c'; sha256sum 'b\\c' | sha256sum -c; shasum -a 256 'b\\c' | shasum -c",
    );
    expect(result.stdout).toBe(
      "\\98ea6e4f216f2fb4b69fff9b3a44842c38686ca685f3f55dc48c5d3fb1107be4  b\\\\c\n" +
        "\\b\\\\c: OK\nb\\c: OK\n",
    );
  });

  it("quotes names with spaces in GNU diagnostics only", async () => {
    const result = await run("sha256sum 'sp ace'; shasum -a 256 'sp ace'");
    expect(result.stderr).toBe(
      "sha256sum: 'sp ace': No such file or directory\nshasum: sp ace: No such file or directory\n",
    );
  });
});
