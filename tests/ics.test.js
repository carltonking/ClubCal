import { describe, it, expect, vi } from "vitest";

vi.mock("../src/services/supabaseClient.js", () => ({
  SUPABASE_FUNCTIONS_BASE_URL: "https://functions.example.com/v1"
}));

const { toICSDate, createICSContent } = await import("../src/utils/ics.js");

describe("toICSDate", () => {
  it("formats date and time to ICS floating time", () => {
    expect(toICSDate("2026-05-22", "14:30")).toBe("20260522T143000");
  });

  it("strips seconds from time string", () => {
    expect(toICSDate("2026-05-22", "09:05:45")).toBe("20260522T090500");
  });

  it("handles single-digit months and days", () => {
    expect(toICSDate("2026-01-02", "08:00")).toBe("20260102T080000");
  });
});

describe("createICSContent", () => {
  const eventItem = {
    id: "evt-1",
    date: "2026-06-15",
    start_time: "18:00",
    end_time: "20:00",
    title: "Chess Tournament",
    description: "Annual tournament",
    attire: "Casual",
    rsvp_url: "https://example.com/rsvp",
    address: "Student Union",
    room: "Ballroom A"
  };

  const clubName = "Chess Club";

  it("produces valid ICS envelope", () => {
    const ics = createICSContent(eventItem, clubName);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("VERSION:2.0");
    expect(ics).toContain("PRODID:-//ClubCal//ClubCal//EN");
    expect(ics).toContain("END:VCALENDAR");
  });

  it("includes VEVENT with correct fields", () => {
    const ics = createICSContent(eventItem, clubName);
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("END:VEVENT");
    expect(ics).toContain("UID:evt-1@clubcal.app");
    expect(ics).toContain("DTSTART:20260615T180000");
    expect(ics).toContain("DTEND:20260615T200000");
    expect(ics).toContain("SUMMARY:Chess Tournament – Chess Club");
    expect(ics).toContain("LOCATION:Student Union\\, Ballroom A");
    expect(ics).toContain("X-ATTIRE:Casual");
    expect(ics).toContain("X-CLUB:Chess Club");
  });

  it("includes description with attire and RSVP", () => {
    const ics = createICSContent(eventItem, clubName);
    expect(ics).toContain("DESCRIPTION:Annual tournament\\nAttire: Casual\\nRSVP: https://example.com/rsvp");
  });

  it("handles missing optional fields gracefully", () => {
    const minimal = {
      id: "evt-2",
      date: "2026-07-01",
      start_time: "09:00",
      end_time: "10:00",
      title: "Meeting",
      address: "Online"
    };
    const ics = createICSContent(minimal, "Club");
    expect(ics).toContain("DTSTART:20260701T090000");
    expect(ics).toContain("UID:evt-2@clubcal.app");
  });
});
