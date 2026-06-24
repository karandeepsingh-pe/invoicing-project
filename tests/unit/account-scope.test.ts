import { describe, expect, it } from "vitest";
import { UserRole } from "@prisma/client";
import { accountScopeWhere, type SessionInfo } from "@/lib/auth/scope";

const base = { userId: "u1", name: null };

describe("accountScopeWhere", () => {
  it("admin sees everything (empty where)", () => {
    const session: SessionInfo = { ...base, email: "admin@ovationwps.com", role: UserRole.ADMIN };
    expect(accountScopeWhere(session)).toEqual({});
  });

  it("SDM is scoped to accounts owned by their email (case-insensitive)", () => {
    const session: SessionInfo = { ...base, email: "sdm@ovationwps.com", role: UserRole.SDM };
    expect(accountScopeWhere(session)).toEqual({
      sdmEmail: { equals: "sdm@ovationwps.com", mode: "insensitive" },
    });
  });
});
