import { describe, expect, it } from "vitest";
import { Bash } from "../../Bash.js";

// Expected outputs recorded from GNU coreutils 9.7 sort (glibc).
const INPUT = "printf 'b\\nB\\n_x\\na\\nA\\n' | ";

async function run(script: string) {
  const result = await new Bash().exec(script);
  expect(result.stderr).toBe("");
  expect(result.exitCode).toBe(0);
  return result;
}

describe("sort collation follows the locale", () => {
  it("uses byte order for C, POSIX and C.UTF-8", async () => {
    for (const locale of ["C", "POSIX", "C.UTF-8"]) {
      const result = await run(`${INPUT}LC_ALL=${locale} sort`);
      expect(result.stdout).toBe("A\nB\n_x\na\nb\n");
    }
  });

  it("uses byte order when no locale variable is set", async () => {
    const result = await run(`${INPUT}sort`);
    expect(result.stdout).toBe("A\nB\n_x\na\nb\n");
  });

  it("reads LC_ALL before LC_COLLATE before LANG", async () => {
    const result = await run(
      `${INPUT}LANG=en_US.UTF-8 LC_COLLATE=C sort; echo ==; ${INPUT}LC_ALL=C LANG=en_US.UTF-8 sort`,
    );
    expect(result.stdout).toBe("A\nB\n_x\na\nb\n==\nA\nB\n_x\na\nb\n");
  });

  it("orders code points above U+FFFF after the rest of the BMP", async () => {
    const result = await run(
      "printf '\u{1F600}\\n\u{FF21}\\nz\\n' | LC_ALL=C.UTF-8 sort",
    );
    expect(result.stdout).toBe("z\n\u{FF21}\n\u{1F600}\n");
  });

  it("applies the order to keys, ties and -V", async () => {
    const result = await run(
      "printf 'k b\\nk B\\n' | sort -k1,1; echo ==; printf 'f_9\\nRESULT.json\\na\\n' | sort -V",
    );
    expect(result.stdout).toBe("k B\nk b\n==\nRESULT.json\na\nf_9\n");
  });
});
