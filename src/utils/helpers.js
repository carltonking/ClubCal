import { SUPABASE_FUNCTIONS_BASE_URL } from "../services/supabaseClient.js";

export function escapeICS(text) {
  return String(text || "")
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

export function escapeHTML(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function getClubFeedUrl(clubId) {
  return `${SUPABASE_FUNCTIONS_BASE_URL}/ical-feed?club=${encodeURIComponent(clubId)}`;
}

export function getClubFeedWebcalUrl(clubId) {
  return toWebcalUrl(getClubFeedUrl(clubId));
}

export function getCalendarFeedUrl(clubId, calendarId) {
  return `${SUPABASE_FUNCTIONS_BASE_URL}/ical-feed?club=${encodeURIComponent(clubId)}&calendar=${encodeURIComponent(calendarId)}`;
}

export function getCalendarFeedWebcalUrl(clubId, calendarId) {
  return toWebcalUrl(getCalendarFeedUrl(clubId, calendarId));
}

export function toWebcalUrl(url) {
  return String(url || "").replace(/^https:\/\//i, "webcal://");
}

export function clearErrors(scope) {
  scope.querySelectorAll("[data-error-for]").forEach((el) => {
    el.textContent = "";
  });
}

export function setError(scope, key, message) {
  const el = scope.querySelector(`[data-error-for="${key}"]`);
  if (el) el.textContent = message;
}

export function formatLocalDate(dateString) {
  if (!dateString) return "TBD";
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(dateString));
}

export function formatTimestamp(dateString) {
  if (!dateString) return "TBD";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(dateString));
}

export function formatTimeRange(dateString, startTime, endTime) {
  if (!dateString || !startTime || !endTime) return "Select a date and time.";
  const start = new Date(`${dateString}T${startTime}`);
  const end = new Date(`${dateString}T${endTime}`);
  const formatter = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });
  return `${formatLocalDate(dateString)} · ${formatter.format(start)} - ${formatter.format(end)}`;
}

export function categoryClass(category) {
  const slug = String(category || "other").toLowerCase();
  return `category-${slug.replace(/[^a-z]+/g, "-")}`;
}

export function mapClub(row) {
  return {
    id: row.id,
    clubName: row.club_name,
    school: row.school,
    email: row.email,
    status: row.status,
    createdAt: row.created_at
  };
}

export function mapEvent(row) {
  return {
    id: row.id,
    club_id: row.club_id,
    calendar_id: row.calendar_id || null,
    title: row.title,
    date: row.date,
    start_time: row.start_time,
    end_time: row.end_time,
    address: row.address,
    room: row.room || "",
    attire: row.attire || "",
    category: row.category,
    description: row.description || "",
    rsvp_url: row.rsvp_url || "",
    created_at: row.created_at,
    download_count: row.download_count || 0,
    cancelled: Boolean(row.cancelled),
    sequence: Number.isFinite(row.sequence) ? row.sequence : 0,
    recurrence: row.recurrence || null
  };
}

// Recurrence helpers. We only support a constrained set of repeat patterns and
// build the RFC 5545 RRULE ourselves, so the value emitted into .ics is always
// well-formed (never user free text).
const RRULE_FREQ = { daily: "DAILY", weekly: "WEEKLY", monthly: "MONTHLY" };

export function buildRRule(repeat, untilDate) {
  const freq = RRULE_FREQ[String(repeat || "").toLowerCase()];
  if (!freq) return null;
  let rule = `FREQ=${freq}`;
  if (untilDate) {
    const until = String(untilDate).replace(/-/g, "");
    if (/^\d{8}$/.test(until)) {
      rule += `;UNTIL=${until}T235959Z`;
    }
  }
  return rule;
}

export function parseRRule(rrule) {
  if (!rrule) return { repeat: "", until: "" };
  const freqMatch = String(rrule).match(/FREQ=([A-Z]+)/);
  const reverse = { DAILY: "daily", WEEKLY: "weekly", MONTHLY: "monthly" };
  const repeat = freqMatch ? reverse[freqMatch[1]] || "" : "";
  const untilMatch = String(rrule).match(/UNTIL=(\d{4})(\d{2})(\d{2})/);
  const until = untilMatch ? `${untilMatch[1]}-${untilMatch[2]}-${untilMatch[3]}` : "";
  return { repeat, until };
}

// Stable per-browser id used to de-duplicate download counts server-side
// (see record_event_download). Best-effort: forgeable by clearing storage.
export function getClientDownloadToken() {
  const KEY = "clubcal_download_token";
  try {
    let token = localStorage.getItem(KEY);
    if (!token) {
      token =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(KEY, token);
    }
    return token;
  } catch {
    return "";
  }
}
