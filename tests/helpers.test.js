import { describe, it, expect, vi } from "vitest";

vi.mock("../src/services/supabaseClient.js", () => ({
  SUPABASE_FUNCTIONS_BASE_URL: "https://functions.example.com/v1"
}));

const {
  escapeICS,
  escapeHTML,
  getClubFeedUrl,
  getClubFeedWebcalUrl,
  getCalendarFeedUrl,
  getCalendarFeedWebcalUrl,
  toWebcalUrl,
  clearErrors,
  setError,
  formatLocalDate,
  formatTimestamp,
  formatTimeRange,
  categoryClass,
  mapClub,
  mapEvent,
  buildRRule,
  parseRRule
} = await import("../src/utils/helpers.js");

describe("escapeHTML", () => {
  it("escapes &, <, >, \", and '", () => {
    expect(escapeHTML(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&#39;");
  });

  it("handles null and undefined", () => {
    expect(escapeHTML(null)).toBe("");
    expect(escapeHTML(undefined)).toBe("");
  });

  it("passes through safe strings", () => {
    expect(escapeHTML("hello world")).toBe("hello world");
    expect(escapeHTML("123")).toBe("123");
  });

  it("coerces numbers", () => {
    expect(escapeHTML(42)).toBe("42");
  });
});

describe("escapeICS", () => {
  it("escapes backslash, newline, comma, semicolon", () => {
    expect(escapeICS("a\\b\nc,d;e")).toBe("a\\\\b\\nc\\,d\\;e");
  });

  it("handles null/undefined", () => {
    expect(escapeICS(null)).toBe("");
    expect(escapeICS(undefined)).toBe("");
  });
});

describe("toWebcalUrl", () => {
  it("replaces https with webcal", () => {
    expect(toWebcalUrl("https://example.com/feed")).toBe("webcal://example.com/feed");
  });

  it("leaves non-https URLs", () => {
    expect(toWebcalUrl("http://example.com/feed")).toBe("http://example.com/feed");
  });

  it("handles empty input", () => {
    expect(toWebcalUrl("")).toBe("");
  });
});

describe("getClubFeedUrl", () => {
  it("builds club feed URL", () => {
    const url = getClubFeedUrl("club-123");
    expect(url).toBe("https://functions.example.com/v1/ical-feed?club=club-123");
  });
});

describe("getClubFeedWebcalUrl", () => {
  it("builds webcal club feed URL", () => {
    const url = getClubFeedWebcalUrl("club-123");
    expect(url).toBe("webcal://functions.example.com/v1/ical-feed?club=club-123");
  });
});

describe("getCalendarFeedUrl", () => {
  it("builds calendar feed URL", () => {
    const url = getCalendarFeedUrl("club-123", "cal-456");
    expect(url).toBe("https://functions.example.com/v1/ical-feed?club=club-123&calendar=cal-456");
  });
});

describe("getCalendarFeedWebcalUrl", () => {
  it("builds webcal calendar feed URL", () => {
    const url = getCalendarFeedWebcalUrl("club-123", "cal-456");
    expect(url).toBe("webcal://functions.example.com/v1/ical-feed?club=club-123&calendar=cal-456");
  });
});

describe("clearErrors", () => {
  it("clears all error elements in scope", () => {
    const scope = document.createElement("div");
    scope.innerHTML = `
      <div data-error-for="name">Old error</div>
      <div data-error-for="email">Old email error</div>
      <div class="other">Not an error</div>
    `;
    clearErrors(scope);
    const errors = scope.querySelectorAll("[data-error-for]");
    errors.forEach((el) => {
      expect(el.textContent).toBe("");
    });
  });
});

describe("setError", () => {
  it("sets error text on matching element", () => {
    const scope = document.createElement("div");
    scope.innerHTML = `<div data-error-for="name"></div>`;
    setError(scope, "name", "Required");
    expect(scope.querySelector('[data-error-for="name"]').textContent).toBe("Required");
  });

  it("does nothing if no matching element", () => {
    expect(() => setError(document.createElement("div"), "missing", "Error")).not.toThrow();
  });
});

describe("formatLocalDate", () => {
  it("formats a date string showing month and year", () => {
    const result = formatLocalDate("2026-05-22");
    expect(result).toContain("May");
    expect(result).toContain("2026");
    expect(result).toMatch(/^\w{3}, May \d{1,2}, 2026$/);
  });

  it("returns TBD for empty input", () => {
    expect(formatLocalDate("")).toBe("TBD");
    expect(formatLocalDate(null)).toBe("TBD");
  });
});

describe("formatTimestamp", () => {
  it("formats a timestamp", () => {
    const result = formatTimestamp("2026-05-22T14:30:00");
    expect(result).toContain("May");
    expect(result).toContain("2026");
  });

  it("returns TBD for empty input", () => {
    expect(formatTimestamp("")).toBe("TBD");
  });
});

describe("formatTimeRange", () => {
  it("formats date and time range", () => {
    const result = formatTimeRange("2026-05-22", "14:00", "16:00");
    expect(result).toContain("May");
    expect(result).toContain("2026");
    expect(result).toContain("·");
    expect(result).toMatch(/^\w{3}, May \d{1,2}, 2026/);
  });
});

describe("formatTimeRange default message", () => {
  it("returns default message for missing inputs", () => {
    expect(formatTimeRange("", "", "")).toBe("Select a date and time.");
    expect(formatTimeRange(null, null, null)).toBe("Select a date and time.");
  });
});

describe("categoryClass", () => {
  it("returns expected class for known categories", () => {
    expect(categoryClass("Social")).toBe("category-social");
    expect(categoryClass("Academic")).toBe("category-academic");
  });

  it("handles lowercase and non-alphabetic input", () => {
    expect(categoryClass("other")).toBe("category-other");
    expect(categoryClass("")).toBe("category-other");
  });
});

describe("mapClub", () => {
  it("maps database row to club object", () => {
    const row = {
      id: "abc-123",
      club_name: "Chess Club",
      school: "State University",
      email: "chess@state.edu",
      status: "approved",
      created_at: "2026-01-15T00:00:00Z"
    };
    const club = mapClub(row);
    expect(club).toEqual({
      id: "abc-123",
      clubName: "Chess Club",
      school: "State University",
      email: "chess@state.edu",
      status: "approved",
      createdAt: "2026-01-15T00:00:00Z"
    });
  });
});

describe("mapEvent", () => {
  it("maps database row to event object", () => {
    const row = {
      id: "evt-1",
      club_id: "club-1",
      calendar_id: "cal-1",
      title: "Tournament",
      date: "2026-06-01",
      start_time: "10:00",
      end_time: "12:00",
      address: "Student Center",
      room: "Room 200",
      attire: "Casual",
      category: "Sports",
      description: "Fun event",
      rsvp_url: "https://example.com/rsvp",
      created_at: "2026-05-01T00:00:00Z",
      download_count: 5,
      sequence: 3,
      cancelled: true,
      recurrence: "FREQ=WEEKLY;UNTIL=20261231T235959Z"
    };
    const event = mapEvent(row);
    expect(event).toEqual({
      id: "evt-1",
      club_id: "club-1",
      calendar_id: "cal-1",
      title: "Tournament",
      date: "2026-06-01",
      start_time: "10:00",
      end_time: "12:00",
      address: "Student Center",
      room: "Room 200",
      attire: "Casual",
      category: "Sports",
      description: "Fun event",
      rsvp_url: "https://example.com/rsvp",
      created_at: "2026-05-01T00:00:00Z",
      download_count: 5,
      sequence: 3,
      cancelled: true,
      recurrence: "FREQ=WEEKLY;UNTIL=20261231T235959Z"
    });
  });

  it("provides defaults for missing fields", () => {
    const row = {
      id: "evt-1",
      title: "Minimal",
      date: "2026-06-01",
      start_time: "10:00",
      end_time: "12:00",
      address: "Here",
      category: "Meeting"
    };
    const event = mapEvent(row);
    expect(event.calendar_id).toBeNull();
    expect(event.room).toBe("");
    expect(event.attire).toBe("");
    expect(event.description).toBe("");
    expect(event.rsvp_url).toBe("");
    expect(event.download_count).toBe(0);
    expect(event.cancelled).toBe(false);
    expect(event.sequence).toBe(0);
    expect(event.recurrence).toBeNull();
  });
});

describe("buildRRule", () => {
  it("returns null for no/unknown repeat", () => {
    expect(buildRRule("", "2026-12-31")).toBeNull();
    expect(buildRRule(null, null)).toBeNull();
    expect(buildRRule("yearly", null)).toBeNull();
  });

  it("builds FREQ without UNTIL", () => {
    expect(buildRRule("weekly", "")).toBe("FREQ=WEEKLY");
    expect(buildRRule("Daily", null)).toBe("FREQ=DAILY");
  });

  it("builds FREQ with UNTIL", () => {
    expect(buildRRule("monthly", "2026-12-31")).toBe("FREQ=MONTHLY;UNTIL=20261231T235959Z");
  });

  it("ignores malformed until dates", () => {
    expect(buildRRule("weekly", "not-a-date")).toBe("FREQ=WEEKLY");
  });
});

describe("parseRRule", () => {
  it("returns empties for null", () => {
    expect(parseRRule(null)).toEqual({ repeat: "", until: "" });
    expect(parseRRule("")).toEqual({ repeat: "", until: "" });
  });

  it("parses FREQ and UNTIL", () => {
    expect(parseRRule("FREQ=WEEKLY;UNTIL=20261231T235959Z")).toEqual({
      repeat: "weekly",
      until: "2026-12-31"
    });
  });

  it("parses FREQ without UNTIL", () => {
    expect(parseRRule("FREQ=DAILY")).toEqual({ repeat: "daily", until: "" });
  });

  it("round-trips with buildRRule", () => {
    const rule = buildRRule("monthly", "2027-01-15");
    expect(parseRRule(rule)).toEqual({ repeat: "monthly", until: "2027-01-15" });
  });
});
