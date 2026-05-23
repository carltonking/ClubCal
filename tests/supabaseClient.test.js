import { describe, it, expect, vi, beforeEach } from "vitest";

beforeEach(() => {
  window.supabase = { createClient: vi.fn(() => ({})) };
});

describe("isSupabaseConfigured", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns true with real-looking credentials", async () => {
    const mod = await import("../src/services/supabaseClient.js");
    expect(mod.isSupabaseConfigured()).toBe(true);
  });

  it("returns false when URL is placeholder", async () => {
    window.__CLUBCAL_CONFIG__ = {
      SUPABASE_URL: "https://YOUR_PROJECT.supabase.co",
      SUPABASE_ANON_KEY: "sb_publishable_testkey123456789"
    };
    const mod = await import("../src/services/supabaseClient.js");
    expect(mod.isSupabaseConfigured()).toBe(false);
    delete window.__CLUBCAL_CONFIG__;
  });

  it("returns false when anon key is placeholder", async () => {
    window.__CLUBCAL_CONFIG__ = {
      SUPABASE_URL: "https://edcnllalkavncijrewno.supabase.co",
      SUPABASE_ANON_KEY: "YOUR_SUPABASE_ANON_KEY"
    };
    const mod = await import("../src/services/supabaseClient.js");
    expect(mod.isSupabaseConfigured()).toBe(false);
    delete window.__CLUBCAL_CONFIG__;
  });

  it("falls back to built-in URL when override is empty", async () => {
    // Empty string is falsy, so it falls back to the valid BUILT_IN_URL.
    // This tests the fallback chain, not an error.
    window.__CLUBCAL_CONFIG__ = {
      SUPABASE_URL: "",
      SUPABASE_ANON_KEY: "sb_publishable_testkey123456789"
    };
    const mod = await import("../src/services/supabaseClient.js");
    expect(mod.isSupabaseConfigured()).toBe(true);
    delete window.__CLUBCAL_CONFIG__;
  });

  it("returns false when URL does not start with https://", async () => {
    window.__CLUBCAL_CONFIG__ = {
      SUPABASE_URL: "http://insecure.supabase.co",
      SUPABASE_ANON_KEY: "sb_publishable_testkey123456789"
    };
    const mod = await import("../src/services/supabaseClient.js");
    expect(mod.isSupabaseConfigured()).toBe(false);
    delete window.__CLUBCAL_CONFIG__;
  });

  it("returns false when anon key is too short", async () => {
    window.__CLUBCAL_CONFIG__ = {
      SUPABASE_URL: "https://edcnllalkavncijrewno.supabase.co",
      SUPABASE_ANON_KEY: "short"
    };
    const mod = await import("../src/services/supabaseClient.js");
    expect(mod.isSupabaseConfigured()).toBe(false);
    delete window.__CLUBCAL_CONFIG__;
  });
});
