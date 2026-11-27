import assert from "node:assert/strict";
import { test } from "node:test";
import { assertPublicUrl, isPrivateIp } from "./guard";

test("private ranges blocked", () => {
  for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "::", "fc00::1", "fd12::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:10.0.0.1", "::ffff:a9fe:a9fe"])
    assert.equal(isPrivateIp(ip), true, ip);
});

test("public addresses allowed", () => {
  for (const ip of ["8.8.8.8", "1.1.1.1", "172.32.0.1", "100.63.0.1", "2606:4700:4700::1111", "::ffff:8.8.8.8"])
    assert.equal(isPrivateIp(ip), false, ip);
});

test("assertPublicUrl rejects bad urls", async () => {
  for (const u of ["ftp://example.com/", "http://user:pw@example.com/", "http://127.0.0.1/", "http://[::1]/", "http://169.254.169.254/latest", "https://example.com:8443/", "http://localhost/", "file:///etc/passwd"])
    await assert.rejects(() => assertPublicUrl(u), u);
  await assert.doesNotReject(() => assertPublicUrl("http://8.8.8.8:80/"));
});
