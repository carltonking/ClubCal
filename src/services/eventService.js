import { supabase } from "./supabaseClient.js";
import { mapEvent } from "../utils/helpers.js";
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
  const { data, error } = await supabase
    .from("clubs")
    .select("*, events(*)")
    .eq("school", school)
    .eq("status", "approved");

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
      download_count: 0
    })
    .select()
    .single();

  if (error) throw error;
  return mapEvent(data);
}

export async function deleteEvent(eventId) {
  const { error } = await supabase.from("events").delete().eq("id", eventId);

  if (error) throw error;
}

export async function updateEventDownloadCount(eventItem) {
  // Atomic increment via the `increment_event_download_count` Postgres
  // function (defined in the 20260416_add_download_count_rpc migration).
  // This avoids the read-modify-write race that would drop increments
  // when two users download the same event at the same time.
  const { data, error } = await supabase.rpc("increment_event_download_count", {
    event_id: eventItem.id
  });

  if (error) throw error;

  const nextCount = typeof data === "number" ? data : (eventItem.download_count || 0) + 1;
  eventItem.download_count = nextCount;
  return nextCount;
}
