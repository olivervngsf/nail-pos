import { afterEach, describe, expect, it, vi } from "vitest";

/** A pretend Android app that answers "tapCheck" the way the phone would. */
function fakeApp(version: string, answer: Record<string, unknown>) {
  const sent: Record<string, unknown>[] = [];
  const app = {
    onmessage: null as ((e: { data: string }) => void) | null,
    postMessage: (s: string) => {
      const m = JSON.parse(s);
      sent.push(m);
      setTimeout(() => app.onmessage?.({ data: JSON.stringify({ id: m.id, ok: true, ...answer }) }), 0);
    },
  };
  vi.stubGlobal("window", { PolishOSApp: app });
  vi.stubGlobal("navigator", { userAgent: `Mozilla/5.0 (Linux; Android 14) Chrome/130 PolishOSApp/${version}` });
  return sent;
}

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

describe("Tap to Pay check", () => {
  it("never asks an app older than 1.2 (PS10 app 1.1)", async () => {
    const sent = fakeApp("1.1", { supported: true });
    const { canTapToPay } = await import("./reader");
    expect(await canTapToPay()).toEqual({ supported: false });
    expect(sent).toHaveLength(0);
  });

  it("asks the phone once and remembers", async () => {
    const sent = fakeApp("1.2", { supported: true, nfcOff: true });
    const { canTapToPay } = await import("./reader");
    expect(await canTapToPay()).toEqual({ supported: true, reason: undefined, nfcOff: true });
    await canTapToPay();
    expect(sent).toEqual([expect.objectContaining({ reader: "tapCheck" })]);
  });

  it("passes on why a phone can't take taps", async () => {
    fakeApp("1.2", { supported: false, reason: "This phone can't take cards by tap." });
    const { canTapToPay } = await import("./reader");
    expect(await canTapToPay()).toMatchObject({ supported: false, reason: "This phone can't take cards by tap." });
  });
});
