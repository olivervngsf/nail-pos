import { describe, expect, it } from "vitest";
import { addError, addLoad, giveBack, takeVitals } from "./vitals";

describe("vitals counts", () => {
  it("counts loads, slow ones and errors, then starts again", () => {
    expect(takeVitals()).toBeNull();
    addLoad(1200); addLoad(3500); addLoad(-5); addLoad(Infinity); addError("boom");
    const v = takeVitals()!;
    expect(v).toMatchObject({ loads: 2, loadMs: 4700, slow: 1, errors: 1, lastError: "boom" });
    expect(takeVitals()).toBeNull();
    giveBack(v);
    expect(takeVitals()).toMatchObject({ loads: 2, slow: 1 });
  });
});
