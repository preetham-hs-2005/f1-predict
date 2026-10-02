import test from "node:test";
import assert from "node:assert/strict";
import { appUrl } from "./appUrl.js";

test("production email links require an HTTPS public origin", () => {
  const priorEnvironment = process.env.NODE_ENV;
  const priorUrl = process.env.APP_URL;
  try {
    process.env.NODE_ENV = "production";
    delete process.env.APP_URL;
    assert.equal(appUrl(), "https://f1predict.dev");
    process.env.APP_URL = "http://example.com";
    assert.throws(() => appUrl());
    process.env.APP_URL = "https://example.com/";
    assert.equal(appUrl(), "https://example.com");
  } finally {
    if (priorEnvironment === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = priorEnvironment;
    if (priorUrl === undefined) delete process.env.APP_URL; else process.env.APP_URL = priorUrl;
  }
});
