import { describe, expect, it } from "vitest";
import { Bash } from "../../Bash.js";

// Expected outputs recorded from ripgrep 15.1.0 (output not to a terminal).
const SETUP =
  "printf 'a\\nx\\nb\\nx\\nx\\nc\\nd\\n' > f1; printf 'x\\ny\\nz\\nx\\n' > f2; ";

async function run(script: string) {
  const result = await new Bash().exec(SETUP + script);
  expect(result.stderr).toBe("");
  return result;
}

describe("rg context groups across files", () => {
  it("separates the files' context groups with --", async () => {
    const result = await run("rg --sort path -n -A1 x f1 f2");
    expect(result.stdout).toBe(
      "f1:2:x\nf1-3-b\nf1:4:x\nf1:5:x\nf1-6-c\n--\nf2:1:x\nf2-2-y\n--\nf2:4:x\n",
    );
    expect(result.exitCode).toBe(0);
  });

  it("uses a blank line, not --, between files in heading mode", async () => {
    const result = await run("rg --sort path --heading -n -B1 x f1 f2");
    expect(result.stdout).toBe(
      "f1\n1-a\n2:x\n3-b\n4:x\n5:x\n\nf2\n1:x\n--\n3-z\n4:x\n",
    );
  });

  it("prints no separator for zero context or counts", async () => {
    const zero = await run("rg --sort path -n -A0 x f1 f2");
    expect(zero.stdout).toBe("f1:2:x\nf1:4:x\nf1:5:x\nf2:1:x\nf2:4:x\n");
    const count = await run("rg --sort path -c -A1 x f1 f2");
    expect(count.stdout).toBe("f1:3\nf2:2\n");
  });
});
