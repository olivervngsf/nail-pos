import { describe, expect, it } from "vitest";
import { activityCsv, applyFilter, countKinds, demoActivity, facts, kindOf, needsLook, plainAction, toneOf } from "./activity";

describe("activity log", () => {
  it("sorts actions into kinds", () => {
    expect(kindOf("pin.wrong")).toBe("pin");
    expect(kindOf("desk.locked")).toBe("pin");
    expect(kindOf("pin.rules")).toBe("settings");
    expect(kindOf("pin.reset")).toBe("team");
    expect(kindOf("clock.in")).toBe("clock");
    expect(kindOf("clock.rules")).toBe("settings");
    expect(kindOf("ticket.refunded")).toBe("money");
    expect(kindOf("tips.signed")).toBe("money");
    expect(kindOf("client.phone_viewed")).toBe("clients");
    expect(kindOf("booking.page")).toBe("settings");
    expect(kindOf("print_settings.saved")).toBe("settings");
    expect(kindOf("salon.address")).toBe("settings");
    expect(kindOf("staff.added")).toBe("team");
    expect(kindOf("device.registered")).toBe("devices");
    expect(kindOf("support.on")).toBe("support");
    expect(kindOf("something.new")).toBe("other");
  });

  it("marks problems with a tone (never colour alone: the page adds a word)", () => {
    expect(toneOf("pin.locked")).toBe("bad");
    expect(toneOf("pin.wrong")).toBe("warn");
    expect(toneOf("clock.in")).toBe("ok");
    expect(toneOf("salon.info_saved")).toBe("info");
    expect(needsLook("clock.refused")).toBe(true);
    expect(needsLook("pin.ok")).toBe(false);
  });

  it("counts and filters", () => {
    const rows = demoActivity(new Date("2026-11-25T12:00:00"));
    const c = countKinds(rows);
    expect(c.all).toBe(rows.length);
    expect(c.clock).toBe(5);
    expect(applyFilter(rows, { kind: "pin", person: "", device: "" }).every((r) => kindOf(r.action) === "pin")).toBe(true);
    expect(applyFilter(rows, { kind: "all", person: "Kim Vo", device: "" }).length).toBe(2); // clocked in + pay changed for Kim
    expect(applyFilter(rows, { kind: "all", person: "", device: "Time clock" }).every((r) => r.device === "Time clock")).toBe(true);
  });

  it("shows detail facts in plain words and order", () => {
    expect(facts({ method: "card", total_cents: 4500, number: 1291, ticket: "uuid" })).toEqual([["number", "#1291"], ["total_cents", "$45.00"], ["method", "card"]]);
    expect(facts(null)).toEqual([]);
    expect(plainAction("gift.linked_by_client")).toBe("Gift linked by client");
  });

  it("builds a CSV with quotes where needed", () => {
    const rows = demoActivity(new Date("2026-11-25T12:00:00")).slice(0, 1);
    const csv = activityCsv(rows, () => "Refund, card", () => "2:41 PM");
    expect(csv.split("\n")[0]).toBe("Time,Kind,What,Who,Role,For,Device,Details");
    expect(csv).toContain('2:41 PM,money,"Refund, card",Bao Tran,manager,,Front desk iPad,number=#1291; total_cents=$45.00; method=card');
  });
});
