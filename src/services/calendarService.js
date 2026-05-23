import { supabase } from "./supabaseClient.js";
import { store } from "../state/store.js";

export async function fetchCalendarsForClub(clubId) {
  const { data, error } = await supabase
    .from("calendars")
    .select("*")
    .eq("club_id", clubId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function createCalendar(name) {
  const { data, error } = await supabase
    .from("calendars")
    .insert({ club_id: store.state.activeClub.id, name: name.trim() })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteCalendar(calendarId) {
  const { error } = await supabase.from("calendars").delete().eq("id", calendarId);

  if (error) throw error;
}
