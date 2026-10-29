import { describe, expect, it } from "vitest";
import { Bash } from "../../Bash.js";

// Expected outputs recorded from GNU coreutils 9.7 sort -V (C and C.UTF-8),
// and 9.11 for en_US.UTF-8.
async function run(script: string) {
  const result = await new Bash().exec(script);
  expect(result.stderr).toBe("");
  expect(result.exitCode).toBe(0);
  return result;
}

describe("sort -V (GNU version order)", () => {
  it("puts ~ before everything, even the end of a part", async () => {
    const result = await run(
      "printf '1.0\\na1a\\n1.0~rc1\\na1~rc\\n1.0~~\\n1.0~\\n' | sort -V",
    );
    expect(result.stdout).toBe("1.0~~\n1.0~\n1.0~rc1\n1.0\na1~rc\na1a\n");
  });

  it("sorts letters before other characters whatever the locale", async () => {
    const input = "printf 'f_9\\nRESULT.json\\na\\nx+1\\nxa\\n' | ";
    for (const locale of ["C", "C.UTF-8", "en_US.UTF-8"]) {
      const result = await run(`${input}LC_ALL=${locale} sort -V`);
      expect(result.stdout).toBe("RESULT.json\na\nf_9\nxa\nx+1\n");
    }
  });

  it("compares file suffixes last", async () => {
    const result = await run(
      "printf '1.0.a\\n1.0A\\n1.0\\nfoo.txt\\nfooA.txt\\nfoo.tar.gz\\nfoo1.tar.gz\\nfoo10.tar.gz\\nfoo2.tar.gz\\n' | sort -V",
    );
    expect(result.stdout).toBe(
      "1.0\n1.0.a\n1.0A\nfoo.tar.gz\nfoo.txt\nfoo1.tar.gz\nfoo2.tar.gz\nfoo10.tar.gz\nfooA.txt\n",
    );
  });

  it("puts dot names first and compares numbers of any length by value", async () => {
    const result = await run(
      "printf 'b\\n.\\n..\\n.z\\na010\\na9\\na0010x\\nn123456789012345678901234567891\\nn123456789012345678901234567890\\n' | sort -V",
    );
    expect(result.stdout).toBe(
      ".\n..\n.z\na9\na010\na0010x\nb\n" +
        "n123456789012345678901234567890\nn123456789012345678901234567891\n",
    );
  });
});
