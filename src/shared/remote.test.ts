import assert from "node:assert/strict";
import { test } from "node:test";
import {
  lanIpv4,
  parseCloudflaredUrl,
  phoneLink,
  requestToken,
  tokenFromAuthorization,
  tokensEqual,
} from "./remote.ts";

test("tokensEqual is length-safe", () => {
  assert.equal(tokensEqual("abcd", "abcd"), true);
  assert.equal(tokensEqual("abcd", "abce"), false);
  assert.equal(tokensEqual("abcd", "abc"), false);
  assert.equal(tokensEqual("", "x"), false);
});

test("requestToken reads Bearer and query", () => {
  assert.equal(tokenFromAuthorization("Bearer secret-token"), "secret-token");
  assert.equal(requestToken({ url: "/api/events?token=abc" }), "abc");
  assert.equal(requestToken({ url: "/api/events?t=from-t" }), "from-t");
  assert.equal(
    requestToken({ authorization: "Bearer header-one", url: "/api/events?token=query" }),
    "header-one",
  );
});

test("lanIpv4 skips loopback and IPv6", () => {
  assert.deepEqual(
    lanIpv4({
      lo0: [{ address: "127.0.0.1", internal: true }],
      en0: [
        { address: "192.168.1.20", internal: false },
        { address: "fe80::1", internal: false },
      ],
      en1: [{ address: "192.168.1.20", internal: false }],
    }),
    ["192.168.1.20"],
  );
});

test("phoneLink puts the token in the hash", () => {
  assert.equal(
    phoneLink("http://192.168.1.20:47821", "tok"),
    "http://192.168.1.20:47821/#t=tok",
  );
});

test("parseCloudflaredUrl reads a trycloudflare host", () => {
  assert.equal(
    parseCloudflaredUrl("ok https://random-words-here.trycloudflare.com\n"),
    "https://random-words-here.trycloudflare.com",
  );
  assert.equal(parseCloudflaredUrl("https://evil.example/trycloudflare.com"), undefined);
});
