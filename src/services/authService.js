import { supabase, SUPABASE_FUNCTIONS_BASE_URL, SUPABASE_ANON_KEY } from "./supabaseClient.js";
import { mapClub, setError } from "../utils/helpers.js";
import { store } from "../state/store.js";

export async function fetchClubByEmail(email) {
  // Supabase Auth lowercases the session email, and the clubs unique index is
  // on lower(email), so always look up by the normalized form. Otherwise a
  // mixed-case signup ("Foo@x.com") would never match its own session email.
  const normalizedEmail = String(email || "")
    .trim()
    .toLowerCase();
  const { data, error } = await supabase.from("clubs").select("*").eq("email", normalizedEmail).limit(1).maybeSingle();

  if (error) throw error;
  return data || null;
}

export async function fetchPendingClubs() {
  const adminToken = sessionStorage.getItem("clubcal.adminToken") || "";
  const response = await fetch(`${SUPABASE_FUNCTIONS_BASE_URL}/admin-club-action`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Admin-Token": adminToken,
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`
    },
    body: JSON.stringify({ action: "list" })
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(body || `Failed to fetch pending clubs (${response.status}).`);
  }

  const result = await response.json();
  return (result?.clubs || []).map(mapClub);
}

export async function signUpClub(payload, signupForm) {
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email: payload.email,
    password: payload.password
  });

  if (authError) {
    setError(signupForm, "email", authError.message);
    return null;
  }

  const userId = authData?.user?.id;
  if (!userId) {
    setError(signupForm, "email", "Signup failed. Please try again.");
    return null;
  }

  const { error: insertError } = await supabase.from("clubs").insert({
    user_id: userId,
    club_name: payload.clubName,
    school: payload.school,
    // Store the normalized email so it always matches the lowercased session
    // email later (see fetchClubByEmail).
    email: String(payload.email || "")
      .trim()
      .toLowerCase(),
    status: "pending"
  });

  if (insertError) {
    setError(signupForm, "email", insertError.message);
    return null;
  }

  return authData;
}

export async function signInClub(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    throw new Error("Invalid email or password.");
  }

  const clubRow = await fetchClubByEmail(email);
  if (!clubRow) {
    throw new Error("No approved club found for this email.");
  }
  if (clubRow.status === "denied") {
    // A denied application must not regain dashboard access. Pending clubs are
    // still allowed in so they can see their "Pending" status while they wait.
    await supabase.auth.signOut().catch(() => {});
    throw new Error("This club application was denied.");
  }

  store.setAuth(data?.session || null, mapClub(clubRow));
  return store.state.activeClub;
}

export async function restoreSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data?.session?.user?.email) return;

  const clubRow = await fetchClubByEmail(data.session.user.email).catch(() => null);
  if (!clubRow) return;
  if (clubRow.status === "denied") {
    await supabase.auth.signOut().catch(() => {});
    store.clearAuth();
    return;
  }
  store.setAuth(data.session, mapClub(clubRow));
}

export async function signOutClub() {
  await supabase.auth.signOut();
  store.clearAuth();
}

export async function updateClubProfile(clubId, updates) {
  const { data, error } = await supabase.from("clubs").update(updates).eq("id", clubId).select().single();

  if (error) throw error;
  return mapClub(data);
}

// Admin approve/reject actions run through the `admin-club-action` edge
// function so that (a) the admin secret lives on the server, not in the
// browser bundle, and (b) the update uses the service role to bypass the
// clubs_update_own RLS policy. The client passes the admin token via the
// `X-Admin-Token` header; the function verifies it against ADMIN_SECRET.

async function callAdminAction(action, clubId, reason) {
  const adminToken = sessionStorage.getItem("clubcal.adminToken") || "";
  const response = await fetch(`${SUPABASE_FUNCTIONS_BASE_URL}/admin-club-action`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Admin-Token": adminToken,
      // Supabase Edge Functions require an apikey/Authorization header by
      // default, even if the function itself does its own auth.
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`
    },
    body: JSON.stringify({ action, clubId, reason })
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(body || `Admin action failed (${response.status}).`);
  }
}

export async function approveClub(clubId) {
  await callAdminAction("approve", clubId);
}

export async function rejectClub(clubId, reason) {
  await callAdminAction("reject", clubId, reason);
}
