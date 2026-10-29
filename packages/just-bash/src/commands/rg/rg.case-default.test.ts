import { describe, expect, it } from "vitest";
import { Bash } from "../../Bash.js";

// Expected output recorded from ripgrep 15.1.0 with no config file.
describe("rg case sensitivity defaults", () => {
  it("is case-sensitive unless -S or -i is given", async () => {
    const result = await new Bash().exec(
      "printf 'Abc\\nabc\\n' > g; rg abc g; rg -S abc g; rg -i ABC g; rg -s abc g",
    );
    expect(result.stdout).toBe("abc\nAbc\nabc\nAbc\nabc\nabc\n");
    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(0);
  });
});
