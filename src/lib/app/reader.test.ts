import { afterEach, describe, expect, it, vi } from "vitest";

/** A pretend Android app that answers "tapCheck" the way the phone would. */
function fakeApp(version: string, answer: Record<string, unknown>, ua = `Mozilla/5.0 (Linux; Android 14) Chrome/130 PolishOSApp/${version}`) {
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
  vi.stubGlobal("navigator", { userAgent: ua });
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
    expect(await canTapToPay()).toEqual({ supported: true, reason: undefined, nfcOff: true, ios: false, icon: undefined });
    await canTapToPay();
    expect(sent).toEqual([expect.objectContaining({ reader: "tapCheck" })]);
  });

  it("passes on why a phone can't take taps", async () => {
    fakeApp("1.2", { supported: false, reason: "This phone can't take cards by tap." });
    const { canTapToPay } = await import("./reader");
    expect(await canTapToPay()).toMatchObject({ supported: false, reason: "This phone can't take cards by tap." });
  });
});

const ios = (v: string) => `Mozilla/5.0 (iPhone) Mobile/15E148 Safari/604.1 PolishOSApp/${v} PolishOS-iOS`;

describe("Tap to Pay on iPhone", () => {
  it("keeps Apple's symbol from the app (a PNG only)", async () => {
    fakeApp("1.3", { supported: true, ios: true, icon: "data:image/png;base64,AAAA" }, ios("1.3"));
    const { canTapToPay } = await import("./reader");
    expect(await canTapToPay()).toMatchObject({ supported: true, ios: true, icon: "data:image/png;base64,AAAA" });
  });

  it("drops anything that isn't a PNG picture", async () => {
    fakeApp("1.3", { supported: true, icon: "javascript:alert(1)" }, ios("1.3"));
    const { canTapToPay } = await import("./reader");
    expect(await canTapToPay()).toMatchObject({ supported: true, ios: true, icon: undefined });
  });

  it("an iPhone app 1.2 (no symbol yet) is still Tap to Pay on iPhone", async () => {
    fakeApp("1.2", { supported: true }, ios("1.2"));
    const { canTapToPay } = await import("./reader");
    expect(await canTapToPay()).toMatchObject({ supported: true, ios: true });
  });
});

describe("Tap to Pay errors", () => {
  it("turns the app's codes into our own words", async () => {
    const { tapErrorKey } = await import("./reader");
    expect(tapErrorKey("passcode")).toBe("tapErr.passcode");
    expect(tapErrorKey("icloud")).toBe("tapErr.icloud");
    expect(tapErrorKey("declined")).toBe("tapErr.declined");
  });

  it("no internet wins over any code", async () => {
    const { tapErrorKey } = await import("./reader");
    expect(tapErrorKey("passcode", false)).toBe("tapErr.offline");
    expect(tapErrorKey(undefined, false)).toBe("tapErr.offline");
  });

  it("unknown codes show the app's own words", async () => {
    const { tapErrorKey } = await import("./reader");
    expect(tapErrorKey("unknown")).toBeNull();
    expect(tapErrorKey("canceled")).toBeNull();
    expect(tapErrorKey(42)).toBeNull();
  });

  it("the app's error code reaches the page", async () => {
    const app = {
      onmessage: null as ((e: { data: string }) => void) | null,
      postMessage: (s: string) => {
        const m = JSON.parse(s);
        setTimeout(() => app.onmessage?.({ data: JSON.stringify({ id: m.id, error: "Set a passcode", code: "passcode" }) }), 0);
      },
    };
    vi.stubGlobal("window", { PolishOSApp: app });
    vi.stubGlobal("navigator", { userAgent: ios("1.3") });
    const { appCall } = await import("./bridge");
    await expect(appCall({ reader: "connect" })).rejects.toMatchObject({ message: "Set a passcode", code: "passcode" });
  });
});

describe("Tap to Pay on iPhone: terms only in Settings", () => {
  it("a checkout payment never asks for Apple's terms on an iPhone", async () => {
    const sent = fakeApp("1.3", {}, ios("1.3"));
    const { takeCard } = await import("./reader");
    await takeCard({ id: "pr1", secret: "pi_secret", locationId: "tml_1", test: true }, () => {}, true);
    expect(sent.find((m) => m.pay)).toMatchObject({ pay: "pi_secret", tap: true, terms: false });
  });

  it("Android keeps the old message (no terms flag)", async () => {
    const sent = fakeApp("1.2", {});
    const { takeCard } = await import("./reader");
    await takeCard({ id: "pr1", secret: "pi_secret", locationId: "tml_1", test: true }, () => {}, true);
    expect(sent.find((m) => m.pay)).not.toHaveProperty("terms");
  });

  it("turned on after a tap worked, off again after Turn off", async () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) });
    fakeApp("1.3", {}, ios("1.3"));
    const { tapOnHere, turnOnTapDemo, turnOffTap } = await import("./reader");
    expect(tapOnHere()).toBe(false);
    turnOnTapDemo();
    expect(tapOnHere()).toBe(true);
    await turnOffTap();
    expect(tapOnHere()).toBe(false);
  });
});

describe("card key errors", () => {
  it("puts our own reason back when Stripe's kit hides it", async () => {
    const { explainAppError } = await import("./reader");
    const e = explainAppError(new Error("Connecting to the reader failed because the app completed fetchConnectionToken with an error."));
    expect(e.message).toMatch(/PolishOS couldn't get a card key/);
    expect(e.code).toBe("token");
  });

  it("leaves other errors alone", async () => {
    const { explainAppError } = await import("./reader");
    const e = Object.assign(new Error("Set a passcode"), { code: "passcode" });
    expect(explainAppError(e)).toBe(e);
  });
});
