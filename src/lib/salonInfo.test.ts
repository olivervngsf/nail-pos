import { describe, expect, it } from "vitest";
import { fullWeek, groupMenu, infoProblem, itemProblem, sampleInfo } from "./salonInfo";

describe("salon info", () => {
  it("fills missing days and checks hours", () => {
    const w = fullWeek([{ weekday: 2, on: false, open: "", close: "" }]);
    expect(w).toHaveLength(7);
    expect(w[2].on).toBe(false);
    expect(infoProblem({ name: " ", hours: w })).toBe("name");
    expect(infoProblem({ name: "Lotus", hours: w.map((h) => ({ ...h, open: "19:00", close: "09:00" })) })).toBe("hours");
    expect(infoProblem({ name: "Lotus", hours: w })).toBe("");
  });
  it("checks one menu item", () => {
    const menu = sampleInfo().services;
    const first = menu[0];
    expect(itemProblem({ ...first }, menu)).toBe("");
    expect(itemProblem({ ...first, id: "new", name: first.name.toUpperCase() }, menu)).toBe("dup");
    expect(itemProblem({ ...first, minutes: 2 }, menu)).toBe("minutes");
    expect(itemProblem({ ...first, cents: -1 }, menu)).toBe("price");
    expect(groupMenu(menu)[0][0]).toBe(first.cat);
  });
});
