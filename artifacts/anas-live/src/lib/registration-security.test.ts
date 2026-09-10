import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL(
    "../../../../supabase/migrations/0001_anas_live.sql",
    import.meta.url,
  ),
  "utf8",
);
const registrationFunction = migration.slice(
  migration.indexOf("create or replace function public.register_participant"),
  migration.indexOf("create or replace function public.session_participant_id"),
);

describe("registration SQL security contract", () => {
  it("uses insert-and-unique-violation semantics instead of an upsert", () => {
    expect(registrationFunction).toContain(
      "exception when unique_violation then\n    raise exception 'already_registered'",
    );
    expect(registrationFunction).not.toContain("on conflict");
  });

  it("never mutates or revokes an existing participant session", () => {
    expect(registrationFunction).not.toContain("update public.participants");
    expect(registrationFunction).not.toContain(
      "update public.participant_sessions",
    );
    expect(
      registrationFunction.match(/insert into public\.participant_sessions/g),
    ).toHaveLength(1);
  });

  it("keeps phone uniqueness as the concurrency authority", () => {
    expect(migration).toMatch(/phone_normalized text not null unique/);
  });

  it("fixes search_path and revokes PUBLIC on every SECURITY DEFINER function", () => {
    const securityDefinerCount =
      migration.match(/security definer/g)?.length ?? 0;
    const fixedSearchPathCount =
      migration.match(/security definer set search_path=/g)?.length ?? 0;
    const explicitPublicRevokes =
      migration.match(/revoke all on function [^;]+ from public,/g)?.length ??
      0;
    expect(securityDefinerCount).toBe(13);
    expect(fixedSearchPathCount).toBe(securityDefinerCount);
    expect(explicitPublicRevokes).toBe(securityDefinerCount);
  });
});
