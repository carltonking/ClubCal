// Admin-only edge function for manually approving or rejecting a pending
// club. The client passes the admin token in the `X-Admin-Token` header;
// this function verifies it against the `ADMIN_SECRET` environment
// variable, then uses the service role to update the row.
//
// Required Supabase Function env vars:
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//   ADMIN_SECRET
//
// Expected request body:
//   { "action": "approve" | "reject", "clubId": "...", "reason"?: "..." }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const jsonHeaders = {
  ...corsHeaders,
  "Content-Type": "application/json; charset=utf-8"
};

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const adminSecret = Deno.env.get("ADMIN_SECRET");

  if (!supabaseUrl || !serviceRoleKey || !adminSecret) {
    return jsonResponse({ error: "Admin action is not configured on the server." }, 500);
  }

  const providedToken = request.headers.get("x-admin-token") || "";
  if (providedToken.length === 0 || providedToken !== adminSecret) {
    return jsonResponse({ error: "Unauthorized." }, 401);
  }

  const payload = (await request.json().catch(() => null)) as {
    action?: string;
    clubId?: string;
    reason?: string;
  } | null;

  if (!payload || typeof payload !== "object") {
    return jsonResponse({ error: "Invalid JSON body." }, 400);
  }

  const { action, clubId, reason } = payload;

  if (!clubId || typeof clubId !== "string") {
    return jsonResponse({ error: "Missing clubId." }, 400);
  }

  if (action !== "approve" && action !== "reject") {
    return jsonResponse({ error: "action must be 'approve' or 'reject'." }, 400);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false }
  });

  if (action === "approve") {
    const { error } = await supabase.from("clubs").update({ status: "approved", denial_reason: null }).eq("id", clubId);

    if (error) return jsonResponse({ error: error.message }, 500);
    return jsonResponse({ ok: true, clubId, status: "approved" }, 200);
  }

  // action === "reject" → mark as denied (preserves record + reason) rather
  // than deleting the row, so the applicant sees a denial email and can
  // re-apply later.
  const { error } = await supabase
    .from("clubs")
    .update({
      status: "denied",
      denial_reason: reason ? String(reason) : "Rejected by an administrator."
    })
    .eq("id", clubId);

  if (error) return jsonResponse({ error: error.message }, 500);
  return jsonResponse({ ok: true, clubId, status: "denied" }, 200);
});
