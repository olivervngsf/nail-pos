import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { assertPublicHost, isPrivateIp } from "./safeFetch";

describe("isPrivateIp", () => {
  it("refuses private, loopback, link-local, shared and mapped addresses", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1"])
      expect(isPrivateIp(ip), ip).toBe(true);
  });
  it("allows public addresses", () => {
    for (const ip of ["8.8.8.8", "104.16.1.1", "2606:4700::1111"]) expect(isPrivateIp(ip), ip).toBe(false);
  });
  it("refuses names that point inside", async () => {
    await expect(assertPublicHost("localhost")).rejects.toThrow();
    await expect(assertPublicHost("127.0.0.1")).rejects.toThrow();
    await expect(assertPublicHost("[::1]")).rejects.toThrow();
  });
});
