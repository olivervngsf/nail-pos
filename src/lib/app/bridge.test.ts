import { afterEach, describe, expect, it, vi } from "vitest";
import { appCall, appHasPrinter, appTell, appVersion, inApp, inIosApp, onAppEvent } from "./bridge";

/** A pretend Android app: remembers what the page sent and lets the test answer. */
function fakeApp(agent = "Mozilla/5.0 (Linux; Android 14) Chrome/130 PolishOSApp/1.1") {
  const sent: Record<string, unknown>[] = [];
  const app = {
    onmessage: null as ((e: { data: string }) => void) | null,
    postMessage: (s: string) => { sent.push(JSON.parse(s)); },
  };
  vi.stubGlobal("window", { PolishOSApp: app });
  vi.stubGlobal("navigator", { userAgent: agent });
  return { sent, say: (m: unknown) => app.onmessage?.({ data: JSON.stringify(m) }) };
}

afterEach(() => vi.unstubAllGlobals());

describe("app bridge", () => {
  it("knows when it is outside the app", async () => {
    vi.stubGlobal("window", {});
    expect(inApp()).toBe(false);
    expect(appVersion()).toBe(0);
    await expect(appCall({ print: "x" })).rejects.toThrow();
  });

  it("reads the app version (the first app had no number = 1)", () => {
    fakeApp();
    expect(appVersion()).toBe(1.1);
    fakeApp("Mozilla/5.0 (Linux; Android 14) Chrome/130");
    expect(appVersion()).toBe(1);
  });

  it("knows the iPhone app (no built-in printer there)", () => {
    fakeApp("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148 Safari/604.1 PolishOSApp/1.2 PolishOS-iOS");
    expect(appVersion()).toBe(1.2);
    expect(inIosApp()).toBe(true);
    expect(appHasPrinter()).toBe(false);
    fakeApp();
    expect(inIosApp()).toBe(false);
    expect(appHasPrinter()).toBe(true);
  });

  it("matches an answer to its question", async () => {
    const app = fakeApp();
    const a = appCall<{ name: string }>({ reader: "status" });
    const b = appCall({ print: "AAAA" });
    expect(app.sent).toHaveLength(2);
    app.say({ id: app.sent[1].id, error: "Turn Bluetooth on, then print again." });
    app.say({ id: app.sent[0].id, ok: true, name: "Stripe Reader M2" });
    await expect(b).rejects.toThrow("Turn Bluetooth on");
    expect((await a).name).toBe("Stripe Reader M2");
  });

  it("passes on what the app says by itself, until told to stop", () => {
    const app = fakeApp();
    const heard: unknown[] = [];
    const stop = onAppEvent("reader", (e) => heard.push(e.text));
    app.say({ event: "reader", text: "Tap, insert or swipe the card on the reader." });
    app.say({ event: "token", ask: 1 }); // another kind: not for this listener
    stop();
    app.say({ event: "reader", text: "late" });
    expect(heard).toEqual(["Tap, insert or swipe the card on the reader."]);
  });

  it("sends a note that needs no answer", () => {
    const app = fakeApp();
    appTell({ tokenFor: 3, secret: "pst_test_x" });
    expect(app.sent[0]).toEqual({ tokenFor: 3, secret: "pst_test_x" });
  });
});
