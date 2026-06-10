import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

type ClubRow = {
  id: string;
  club_name: string;
};

type CalendarRow = {
  id: string;
  name: string;
};

type EventRow = {
  id: string;
  club_id: string | null;
  title: string;
  date: string;
  start_time: string;
  end_time: string;
  address: string | null;
  room: string | null;
  description: string | null;
  created_at: string | null;
  updated_at: string | null;
  sequence: number | null;
  cancelled: boolean | null;
  recurrence: string | null;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

// RFC 5545 line folding: each line must not exceed 75 octets.
// Continuation lines start with a single space.
function foldLine(value: string): string {
  const maxLen = 75;
  if (value.length <= maxLen) return value;

  const lines: string[] = [];
  let remaining = value;
  while (remaining.length > 0) {
    if (lines.length === 0) {
      lines.push(remaining.substring(0, maxLen));
      remaining = remaining.substring(maxLen);
    } else {
      // continuation: leave 1 char for the leading space
      const chunk = remaining.substring(0, maxLen - 1);
      lines.push(" " + chunk);
      remaining = remaining.substring(maxLen - 1);
    }
  }
  return lines.join("\r\n");
}

function escapeICS(value: string | null | undefined) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

// Floating time (RFC 5545 form 1): YYYYMMDDTHHMMSS with no timezone
// marker. Calendar apps render it at the same wall-clock time for every
// subscriber regardless of their device timezone, which is what we want
// for a campus event at a specific school. Matches the format produced
// by the client-side downloadICS helper in src/utils/ics.js.
function fmt(dateStr: string, timeStr: string) {
  const clean = String(timeStr || "")
    .substring(0, 5)
    .replace(":", "");
  return `${String(dateStr).replace(/-/g, "")}T${clean}00`;
}

function fmtUtcTimestamp(value: string | null | undefined) {
  const date = new Date(value || Date.now());
  return date.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

function shouldKeepInFeed(eventItem: EventRow) {
  if (!eventItem.cancelled) return true;
  const reference = eventItem.updated_at || eventItem.created_at;
  if (!reference) return true;
  const ageMs = Date.now() - new Date(reference).getTime();
  return ageMs <= 30 * 24 * 60 * 60 * 1000;
}

function buildEventBlock(eventItem: EventRow, clubName: string) {
  const description = escapeICS(eventItem.description || "");
  const location = escapeICS([eventItem.address, eventItem.room].filter(Boolean).join(", "));
  const lastModified = fmtUtcTimestamp(eventItem.updated_at || eventItem.created_at);
  const dtstamp = fmtUtcTimestamp(new Date().toISOString()); // RFC 5545 requires DTSTAMP
  const sequence = Number.isFinite(eventItem.sequence) ? Number(eventItem.sequence) : 0;

  const lines = [
    "BEGIN:VEVENT",
    `UID:${escapeICS(`${eventItem.id}@clubcal.app`)}`,
    `DTSTAMP:${dtstamp}`,
    `SUMMARY:${escapeICS(`${eventItem.title} - ${clubName}`)}`,
    `DTSTART:${fmt(eventItem.date, eventItem.start_time)}`,
    `DTEND:${fmt(eventItem.date, eventItem.end_time)}`,
    `LAST-MODIFIED:${lastModified}`,
    `SEQUENCE:${sequence}`,
    `LOCATION:${location}`,
    `DESCRIPTION:${description}`,
    `STATUS:${eventItem.cancelled ? "CANCELLED" : "CONFIRMED"}`,
    "END:VEVENT"
  ];

  // Recurrence: a single VEVENT plus an RRULE; clients expand the series.
  // The value is structured (built from a constrained picker, not free text),
  // so it is emitted verbatim. Inserted before END:VEVENT.
  if (eventItem.recurrence) {
    lines.splice(lines.length - 1, 0, `RRULE:${eventItem.recurrence}`);
  }

  return lines.map((line) => foldLine(line)).join("\r\n");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(request.url);
  const clubId = url.searchParams.get("club");
  const calendarId = url.searchParams.get("calendar") || null;

  if (!clubId) {
    return new Response("Missing club query parameter.", {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" }
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response("Supabase environment is not configured.", {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" }
    });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false }
  });

  const { data: club, error: clubError } = await supabase
    .from("clubs")
    .select("id, club_name")
    .eq("id", clubId)
    .single<ClubRow>();

  if (clubError) {
    return new Response(clubError.message, {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" }
    });
  }

  let calendarName = club.club_name;

  if (calendarId) {
    const { data: calRow, error: calError } = await supabase
      .from("calendars")
      .select("id, name")
      .eq("id", calendarId)
      .eq("club_id", clubId)
      .single<CalendarRow>();

    if (calError || !calRow) {
      return new Response("Calendar not found.", {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" }
      });
    }
    calendarName = `${club.club_name} — ${calRow.name}`;
  }

  let eventsQuery = supabase.from("events").select("*").eq("club_id", clubId);

  if (calendarId) {
    eventsQuery = eventsQuery.eq("calendar_id", calendarId);
  }

  const { data: events, error: eventsError } = await eventsQuery;

  if (eventsError) {
    return new Response(eventsError.message, {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" }
    });
  }

  const headerLines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Club Cal//Club Calendar Feed//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-PUBLISHED-TTL:PT1H",
    `X-WR-CALNAME:${escapeICS(calendarName)}`,
    `X-WR-CALDESC:${escapeICS(`Club Cal feed for ${calendarName}`)}`
  ];

  const eventBlocks = ((events || []) as EventRow[])
    .filter((eventItem) => shouldKeepInFeed(eventItem))
    .sort((a, b) => `${a.date}T${a.start_time}`.localeCompare(`${b.date}T${b.start_time}`))
    .map((eventItem) => buildEventBlock(eventItem, calendarName));

  const allLines = [...headerLines, ...eventBlocks, "END:VCALENDAR"];
  const calendarBody = allLines.map((line) => foldLine(line)).join("\r\n");

  return new Response(calendarBody, {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "text/calendar; charset=utf-8",
      // Allow short shared/CDN caching: external calendar clients only poll
      // ~hourly (see X-PUBLISHED-TTL:PT1H), so serving a cached feed for up to
      // an hour avoids a full service-role query + rebuild on every poll.
      // Cancellations still propagate within the hour and the 30-day
      // STATUS:CANCELLED grace window covers slower clients.
      "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
      "Content-Disposition": `inline; filename="${club.id}.ics"`
    }
  });
});
