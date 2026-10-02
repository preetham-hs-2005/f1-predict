import test from "node:test";
import assert from "node:assert/strict";
import type { Request, Response, NextFunction } from "express";
import { authMiddleware, requireVerifiedEmail } from "./auth.js";
import { User } from "../models/User.js";
import { generateToken } from "../utils/jwt.js";

test("password reset token version invalidates an older session", async () => {
  process.env.JWT_SECRET = "test-only-secret";
  const token = generateToken({ userId: "507f1f77bcf86cd799439011", email: "test@example.com", name: "Test", role: "user", tokenVersion: 0 });
  const original = User.findById;
  User.findById = async () => ({ tokenVersion: 1 } as Awaited<ReturnType<typeof User.findById>>);
  let status = 0;
  let nextCalled = false;
  const response = { status(code: number) { status = code; return this; }, json() { return this; } } as unknown as Response;
  try {
    await authMiddleware({ headers: { authorization: `Bearer ${token}` } } as Request, response, (() => { nextCalled = true; }) as NextFunction);
    assert.equal(status, 401);
    assert.equal(nextCalled, false);
  } finally {
    User.findById = original;
  }
});

test("prediction write gate rejects legacy and unverified accounts", async () => {
  const original = User.findById;
  let status = 0;
  let nextCalled = false;
  const response = { status(code: number) { status = code; return this; }, json() { return this; } } as unknown as Response;
  const request = { user: { userId: "507f1f77bcf86cd799439011" } } as Request;
  try {
    User.findById = async () => ({ email: "fan@example.com" } as Awaited<ReturnType<typeof User.findById>>);
    await requireVerifiedEmail(request, response, (() => { nextCalled = true; }) as NextFunction);
    assert.equal(status, 403);
    assert.equal(nextCalled, false);

    User.findById = async () => ({ emailVerifiedAt: new Date() } as Awaited<ReturnType<typeof User.findById>>);
    await requireVerifiedEmail(request, response, (() => { nextCalled = true; }) as NextFunction);
    assert.equal(nextCalled, true);
  } finally {
    User.findById = original;
  }
});
