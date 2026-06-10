import { supabase } from "./supabaseClient.js";
import { mapEvent, getClientDownloadToken } from "../utils/helpers.js";
import { store } from "../state/store.js";

export async function fetchEventsForClub(clubId, sortField = "created_at", ascending = false) {
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("club_id", clubId)
    .order(sortField, { ascending });

  if (error) throw error;
  return (data || []).map(mapEvent);
}

export async function fetchDiscoverySchools() {
  const { data, error } = await supabase.from("clubs").select("school").eq("status", "approved");

  if (error) throw error;
  return [...new Set((data || []).map((row) => row.school).filter(Boolean))];
}

export async function fetchActiveClubsBySchool(school) {
  // Bound the discovery payload: cap the number of clubs and the number of
  // embedded events per club (ordered earliest-first). Prevents one school's
  // page from pulling every event for every club in a single response.
  const { data, error } = await supabase
    .from("clubs")
    .select("*, events(*)")
    .eq("school", school)
    .eq("status", "approved")
    .order("date", { foreignTable: "events", ascending: true })
    .limit(100, { foreignTable: "events" })
    .limit(200);

  if (error) throw error;
  return data || [];
}

export async function createEvent(payload) {
  const { data, error } = await supabase
    .from("events")
    .insert({
      club_id: store.state.activeClub.id,
      calendar_id: payload.calendarId || null,
      title: payload.title,
      date: payload.date,
      start_time: payload.startTime,
      end_time: payload.endTime,
      address: payload.address,
      room: payload.room || null,
      attire: payload.attire || null,
      category: payload.category,
      description: payload.description || null,
      rsvp_url: payload.rsvp || null,
      recurrence: payload.recurrence || null,
      download_count: 0
    })
    .select()
    .single();

  if (error) throw error;
  return mapEvent(data);
}

export async function updateEvent(eventId, payload) {
  const { data, error } = await supabase.rpc("update_event", {
    event_id: eventId,
    p_title: payload.title,
    p_date: payload.date,
    p_start_time: payload.startTime,
    p_end_time: payload.endTime,
    p_address: payload.address,
    p_room: payload.room || null,
    p_attire: payload.attire || null,
    p_category: payload.category,
    p_description: payload.description || null,
    p_rsvp_url: payload.rsvp || null,
    p_calendar_id: payload.calendarId || null,
    p_recurrence: payload.recurrence || null
  });

  if (error) throw error;
  // The RPC enforces club ownership in its WHERE clause; a non-owner (or a
  // missing event) matches zero rows and returns null. Surface that clearly
  // instead of letting mapEvent(null) throw a cryptic error.
  if (!data) throw new Error("You can only edit events for your own club.");
  return mapEvent(data);
}

export async function deleteEvent(eventId) {
  // Soft-delete: mark as cancelled so iCal feed publishes STATUS:CANCELLED
  const { error } = await supabase.rpc("cancel_event", { event_id: eventId });

  if (error) throw error;
}

export async function fetchEvent(eventId) {
  const { data, error } = await supabase.from("events").select("*").eq("id", eventId).single();

  if (error) throw error;
  return mapEvent(data);
}

export async function updateEventDownloadCount(eventItem) {
  // Atomic, de-duplicated increment via `record_event_download` (defined in
  // 20260611_add_download_dedup). The per-browser client token means repeated
  // downloads of the same event from one browser count once, which keeps the
  // Insights numbers honest without a read-modify-write race.
  const { data, error } = await supabase.rpc("record_event_download", {
    event_id: eventItem.id,
    client_token: getClientDownloadToken()
  });

  if (error) throw error;

  const nextCount = typeof data === "number" ? data : (eventItem.download_count || 0) + 1;
  eventItem.download_count = nextCount;
  return nextCount;
}
