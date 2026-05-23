import { escapeICS } from "./helpers.js";

const pad = (value) => String(value).padStart(2, "0");

// Floating time: RFC 5545 "form 1" (YYYYMMDDTHHMMSS, no trailing Z, no
// TZID). Calendar apps interpret this as "local wall-clock time on the
// observer's device." For campus events that's what creators and
// attendees both intuit — 6pm means 6pm at the school, not "6pm PST
// converted to UTC converted back to the attendee's timezone."
export function toICSDate(dateString, timeString) {
  const clean = String(timeString || "").substring(0, 5); // strip seconds if present
  return `${String(dateString).replace(/-/g, "")}T${clean.replace(":", "")}00`;
}

// DTSTAMP still uses UTC, per spec (it's a "record created at" marker,
// not an event time).
function utcStamp(date = new Date()) {
  return (
    [date.getUTCFullYear(), pad(date.getUTCMonth() + 1), pad(date.getUTCDate())].join("") +
    "T" +
    [pad(date.getUTCHours()), pad(date.getUTCMinutes()), pad(date.getUTCSeconds())].join("") +
    "Z"
  );
}

export function createICSContent(eventItem, clubName) {
  const uid = `${eventItem.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`}@clubcal.app`;
  const dtstamp = utcStamp();
  const descriptionLines = [
    eventItem.description || "",
    `Attire: ${eventItem.attire || "Not specified"}`,
    `RSVP: ${eventItem.rsvp_url || "N/A"}`
  ]
    .filter(Boolean)
    .join("\n");
  const location = [eventItem.address, eventItem.room].filter(Boolean).join(", ");

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ClubCal//ClubCal//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART:${toICSDate(eventItem.date, eventItem.start_time)}`,
    `DTEND:${toICSDate(eventItem.date, eventItem.end_time)}`,
    `SUMMARY:${escapeICS(`${eventItem.title} – ${clubName}`)}`,
    `DESCRIPTION:${escapeICS(descriptionLines)}`,
    `LOCATION:${escapeICS(location)}`,
    `X-ATTIRE:${escapeICS(eventItem.attire || "")}`,
    `X-CLUB:${escapeICS(clubName)}`,
    "END:VEVENT",
    "END:VCALENDAR"
  ].join("\r\n");
}

export function downloadICS(eventItem, clubName, triggerButton) {
  const content = createICSContent(eventItem, clubName);
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const slug = `${clubName}-${eventItem.title}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  anchor.href = url;
  anchor.download = `${slug || "clubcal-event"}.ics`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);

  if (triggerButton) {
    triggerButton.classList.remove("calendar-pulse");
    void triggerButton.offsetWidth;
    triggerButton.classList.add("calendar-pulse");
  }
}
