import { describe, expect, it } from "vitest";
import { Bash } from "../../Bash.js";

// Expected outputs recorded from GNU grep 3.12 (GNU bash 5.3, C.UTF-8).
const SETUP =
  "printf 'a\\nx\\nb\\nx\\nx\\nc\\nd\\n' > f1; printf 'x\\ny\\nz\\nx\\n' > f2; ";

async function run(script: string) {
  const result = await new Bash().exec(SETUP + script);
  expect(result.stderr).toBe("");
  return result;
}

describe("grep context group separators (GNU)", () => {
  it("separates groups from different files with --", async () => {
    const result = await run("grep -n -A1 x f1 f2");
    expect(result.stdout).toBe(
      "f1:2:x\nf1-3-b\nf1:4:x\nf1:5:x\nf1-6-c\n--\nf2:1:x\nf2-2-y\n--\nf2:4:x\n",
    );
    expect(result.exitCode).toBe(0);
  });

  it("separates adjacent single-line groups in different files", async () => {
    const result = await run(
      "printf 'x\\n' > g1; printf 'x\\n' > g2; grep -A1 x g1 g2",
    );
    expect(result.stdout).toBe("g1:x\n--\ng2:x\n");
  });

  it("skips files without matches when separating groups", async () => {
    const result = await run("printf 'q\\n' > f3; grep -B1 x f1 f3 f2");
    expect(result.stdout).toBe(
      "f1-a\nf1:x\nf1-b\nf1:x\nf1:x\n--\nf2:x\n--\nf2-z\nf2:x\n",
    );
  });

  it("prints separators for an explicit zero context (-A0, -B0, -C0)", async () => {
    const a0 = await run("grep -n -A0 x f1");
    expect(a0.stdout).toBe("2:x\n--\n4:x\n5:x\n");
    const b0 = await run("grep -B0 x f1");
    expect(b0.stdout).toBe("x\n--\nx\nx\n");
    const c0 = await run("grep -C0 x f1 f2");
    expect(c0.stdout).toBe("f1:x\n--\nf1:x\nf1:x\n--\nf2:x\n--\nf2:x\n");
    const stdin = await run("cat f1 | grep -A0 x");
    expect(stdin.stdout).toBe("x\n--\nx\nx\n");
  });

  it("keeps the separator with -m across files", async () => {
    const result = await run("grep -m1 -A1 x f1 f2");
    expect(result.stdout).toBe("f1:x\nf1-b\n--\nf2:x\nf2-y\n");
  });

  it("prints no separators for -c or -l", async () => {
    const result = await run("grep -c -A1 x f1 f2; grep -l -A1 x f1 f2");
    expect(result.stdout).toBe("f1:3\nf2:2\nf1\nf2\n");
  });
});

describe("grep -o with context (GNU)", () => {
  it("prints separators but no context lines", async () => {
    const setup = "printf 'x\\na\\nb\\nc\\nx\\n' > f; printf 'x\\n' > g; ";
    const gap = await run(`${setup}grep -o -A1 x f`);
    expect(gap.stdout).toBe("x\n--\nx\n");
    const numbered = await run(`${setup}grep -o -n -A0 x f`);
    expect(numbered.stdout).toBe("1:x\n--\n5:x\n");
    const files = await run(`${setup}grep -o -A1 x f g`);
    expect(files.stdout).toBe("f:x\n--\nf:x\n--\ng:x\n");
    const contiguous = await run("grep -o -A1 x f1");
    expect(contiguous.stdout).toBe("x\nx\nx\n");
  });

  it("prints the matches in context lines under -v", async () => {
    const setup =
      "printf 'a\\nxbx\\nc\\nd\\ne\\nb\\n' > f; printf 'q\\nbb\\n' > g; ";
    const plain = await run(`${setup}grep -v -o -C1 b f`);
    expect(plain.stdout).toBe("b\nb\n");
    const numbered = await run(`${setup}grep -v -o -n -A1 b f g`);
    expect(numbered.stdout).toBe("f-2-b\nf-6-b\n--\ng-2-b\ng-2-b\n");
    const zero = await run(`${setup}grep -v -o -n -C0 b f`);
    expect(zero.stdout).toBe("--\n");
  });
});
