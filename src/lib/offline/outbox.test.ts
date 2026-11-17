import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_REFUSALS, _resetForTests, enqueue, getState, registerHandler, retryParked, syncNow } from "./outbox";

const setOnline = (v: boolean) => Object.defineProperty(globalThis.navigator, "onLine", { value: v, configurable: true });

describe("outbox", () => {
  beforeEach(async () => {
    await _resetForTests();
    setOnline(true);
  });

  it("keeps writes while offline and sends them once, in order, when back online", async () => {
    const sent: string[] = [];
    registerHandler("test.write", async (item) => void sent.push((item.payload as { n: string }).n));
    setOnline(false);
    await enqueue("test.write", { n: "a" });
    await enqueue("test.write", { n: "b" });
    await syncNow();
    expect(sent).toEqual([]);
    expect(getState().pending).toBe(2);
    expect(getState().online).toBe(false);

    setOnline(true);
    await syncNow();
    expect(sent).toEqual(["a", "b"]);
    expect(getState().pending).toBe(0);
    await syncNow();
    expect(sent).toEqual(["a", "b"]); // nothing sent twice
  });

  it("keeps a failed write for the next try and stops so order is kept", async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error("server down")).mockResolvedValue(undefined);
    registerHandler("test.write", fn);
    setOnline(false);
    await enqueue("test.write", { n: 1 });
    await syncNow();
    setOnline(true);
    await syncNow();
    expect(getState().pending).toBe(1);
    expect(getState().lastError).toBe("server down");
    await syncNow();
    expect(getState().pending).toBe(0);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn.mock.calls[0][0].clientId).toBe(fn.mock.calls[1][0].clientId); // same id = server can apply once
  });

  it("refuses duplicate client ids", async () => {
    registerHandler("test.write", async () => {});
    setOnline(false);
    await enqueue("test.write", {}, "same-id");
    await expect(enqueue("test.write", {}, "same-id")).rejects.toThrow();
  });

  it("sets aside an item the server keeps refusing, so later writes still go through", async () => {
    const sent: string[] = [];
    registerHandler("test.write", async (item) => {
      const n = (item.payload as { n: string }).n;
      if (n === "bad") throw new Error("discount needs a manager PIN");
      sent.push(n);
    });
    await enqueue("test.write", { n: "bad" });
    await enqueue("test.write", { n: "good" });
    for (let i = 0; i < MAX_REFUSALS; i++) await syncNow();
    expect(sent).toEqual(["good"]);
    expect(getState().pending).toBe(0);
    expect(getState().parked).toBe(1);
    await retryParked(); // app start: one more try
    expect(getState().pending).toBe(1);
    expect(getState().parked).toBe(0);
  });

  it("never sets aside an item that fails for network reasons", async () => {
    registerHandler("test.write", async () => { throw new TypeError("Failed to fetch"); });
    await enqueue("test.write", { n: 1 });
    for (let i = 0; i < MAX_REFUSALS + 2; i++) await syncNow();
    expect(getState().pending).toBe(1);
    expect(getState().parked).toBe(0);
  });
});
