import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

type ClubRecord = {
  id: string;
  club_name: string;
  school: string;
  email: string;
};

type VerificationResult = {
  approved: boolean;
  reason: string;
};

const jsonHeaders = {
  "Content-Type": "application/json; charset=utf-8"
};

function extractClubRecord(payload: Record<string, unknown>) {
  const candidate = payload.record ?? payload.new ?? payload;
  return candidate as ClubRecord;
}

function extractJsonObject(text: string) {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch (_error) {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error("Claude did not return valid JSON.");
    }
    return JSON.parse(match[0]);
  }
}

function buildApprovalHtml(clubName: string) {
  return `
    <div style="font-family: Inter, Arial, sans-serif; line-height: 1.6; color: #0f172a;">
      <p>Hello,</p>
      <p>Your Club Cal application for <strong>${clubName}</strong> was approved.</p>
      <p>You can now sign in and start publishing events for students.</p>
      <p>Thanks,<br>Club Cal</p>
    </div>
  `;
}

function buildDenialHtml(clubName: string, reason: string) {
  return `
    <div style="font-family: Inter, Arial, sans-serif; line-height: 1.6; color: #0f172a;">
      <p>Hello,</p>
      <p>Your Club Cal application for <strong>${clubName}</strong> was not approved.</p>
      <p>Reason: ${reason}</p>
      <p>If you believe this was a mistake, please reply to this email with more context about your organization.</p>
      <p>Thanks,<br>Club Cal</p>
    </div>
  `;
}

async function verifyWithClaude(record: ClubRecord, anthropicApiKey: string) {
  const prompt = `You are a club verification assistant for ${record.school}. A club has applied with the name: "${record.club_name}" and school: "${record.school}". Based only on this information, determine if this is likely a legitimate, official ${record.school} student club or organization. Reply with JSON only: { "approved": true/false, "reason": "one sentence explanation" }`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": anthropicApiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 200,
      messages: [
        {
          role: "user",
          content: prompt
        }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`Anthropic request failed with status ${response.status}`);
  }

  const payload = await response.json();
  const text = payload?.content?.find?.((item: { type?: string }) => item.type === "text")?.text;

  if (!text) {
    throw new Error("Anthropic response did not include text content.");
  }

  const parsed = extractJsonObject(text) as Partial<VerificationResult>;
  return {
    approved: Boolean(parsed.approved),
    reason: String(parsed.reason || "No reason provided.")
  };
}

async function sendDecisionEmail(record: ClubRecord, approved: boolean, reason: string, resendApiKey: string) {
  const from = "Club Cal <onboarding@resend.dev>";
  const subject = approved ? "Your Club Cal application was approved" : "Your Club Cal application was not approved";
  const html = approved ? buildApprovalHtml(record.club_name) : buildDenialHtml(record.club_name, reason);

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from,
      to: [record.email],
      subject,
      html
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Resend request failed: ${errorText}`);
  }
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed." }), {
      status: 405,
      headers: jsonHeaders
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY");
  const resendApiKey = Deno.env.get("RESEND_API_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: "Supabase environment is not configured." }), {
      status: 500,
      headers: jsonHeaders
    });
  }

  if (!anthropicApiKey || !resendApiKey) {
    return new Response(JSON.stringify({ error: "Missing verification provider environment variables." }), {
      status: 500,
      headers: jsonHeaders
    });
  }

  const rawPayload = await request.json().catch(() => null);
  if (!rawPayload || typeof rawPayload !== "object") {
    return new Response(JSON.stringify({ error: "Invalid webhook payload." }), {
      status: 400,
      headers: jsonHeaders
    });
  }

  const record = extractClubRecord(rawPayload as Record<string, unknown>);
  if (!record?.id || !record?.club_name || !record?.school || !record?.email) {
    return new Response(JSON.stringify({ error: "Webhook payload is missing club fields." }), {
      status: 400,
      headers: jsonHeaders
    });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false }
  });

  try {
    const verification = await verifyWithClaude(record, anthropicApiKey);
    const nextStatus = verification.approved ? "approved" : "denied";

    const { error: updateError } = await supabase
      .from("clubs")
      .update({
        status: nextStatus,
        denial_reason: verification.reason
      })
      .eq("id", record.id);

    if (updateError) {
      throw updateError;
    }

    await sendDecisionEmail(record, verification.approved, verification.reason, resendApiKey);

    return new Response(
      JSON.stringify({
        success: true,
        clubId: record.id,
        status: nextStatus,
        reason: verification.reason
      }),
      {
        status: 200,
        headers: jsonHeaders
      }
    );
  } catch (error) {
    console.error("verify-club failed", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Verification failed."
      }),
      {
        status: 500,
        headers: jsonHeaders
      }
    );
  }
});
