import { describe, expect, it } from "vitest";
import { Bash } from "../../Bash.js";

// Expected outputs recorded from GNU grep 3.12 (GNU bash 5.3, C.UTF-8).
// Traversal order is the file system's, so multi-file results are sorted.
const SETUP =
  "mkdir -p d/s; printf 'x\\n' > d/a; printf 'x\\n' > d/s/b; printf 'x\\n' > f; ";

async function run(script: string) {
  return new Bash().exec(SETUP + script);
}

describe("grep -r file names (GNU)", () => {
  it("prints a lone file operand without its name", async () => {
    const result = await run("grep -r x f; grep -rn x f; cd d; grep -r x s/b");
    expect(result.stdout).toBe("x\n1:x\nx\n");
    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(0);
  });

  it("names files found under a directory operand", async () => {
    const result = await run(
      "grep -r x d | sort; cd d; grep -r x ./s; grep -r x ../d | sort",
    );
    expect(result.stdout).toBe(
      "d/a:x\nd/s/b:x\n./s/b:x\n../d/a:x\n../d/s/b:x\n",
    );
    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(0);
  });

  it("names every file when there are several operands", async () => {
    const result = await run("grep -r x f d/a; grep -rc x f d/s");
    expect(result.stdout).toBe("f:x\nd/a:x\nf:1\nd/s/b:1\n");
    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(0);
  });

  it("applies -h to recursive output", async () => {
    const result = await run("grep -rh x d | sort");
    expect(result.stdout).toBe("x\nx\n");
    expect(result.stderr).toBe("");
  });
});
