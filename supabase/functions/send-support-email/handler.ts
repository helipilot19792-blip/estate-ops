const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]!);
}

export function createSupportEmailHandler(deps: {
  env: (key: string) => string | undefined;
  fetch: typeof fetch;
}) {
  return async (req: Request) => {
    const json = (body: unknown, status = 200, headers = {}) =>
      new Response(JSON.stringify(body), {
        status, headers: { ...corsHeaders, "Content-Type": "application/json", ...headers },
      });
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);
    const authorization = req.headers.get("authorization") || "";
    if (!/^Bearer\s+\S+$/i.test(authorization)) {
      return json({ error: "Authentication required." }, 401);
    }

    try {
      const url = deps.env("SUPABASE_URL");
      const serviceKey = deps.env("SUPABASE_SERVICE_ROLE_KEY");
      const resendKey = deps.env("RESEND_API_KEY");
      if (!url || !serviceKey || !resendKey) {
        return json({ error: "Support email service is not configured." }, 503);
      }
      // Verify with Auth instead of trusting userEmail or decoding a JWT.
      const authResponse = await deps.fetch(`${url}/auth/v1/user`, {
        headers: { apikey: serviceKey, Authorization: authorization },
      });
      if (!authResponse.ok) return json({ error: "Authentication required." }, 401);
      const user = await authResponse.json();
      if (!user.id || !user.email || !user.email_confirmed_at || user.is_anonymous) {
        return json({ error: "A verified email account is required." }, 403);
      }
      const body = await req.json().catch(() => null);
      const subject = typeof body?.subject === "string" ? body.subject.trim() : "";
      const message = typeof body?.message === "string" ? body.message.trim() : "";
      if (!message || message.length > 10000 || subject.length > 200) {
        return json({ error: "Enter a message of up to 10,000 characters and a subject of up to 200 characters." }, 400);
      }
      const quotaResponse = await deps.fetch(`${url}/rest/v1/rpc/consume_support_email_quota`, {
        method: "POST",
        headers: {
          apikey: serviceKey, Authorization: `Bearer ${serviceKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ p_user_id: user.id }),
      });
      // Fail closed if the migration is missing or the database is unavailable.
      if (!quotaResponse.ok) return json({ error: "Support email quota is unavailable." }, 503);
      const retryAfter = await quotaResponse.json();
      if (!Number.isInteger(retryAfter) || retryAfter < 0) {
        return json({ error: "Support email quota is unavailable." }, 503);
      }
      if (retryAfter > 0) {
        return json({ error: "Please wait before sending another support email." }, 429,
          { "Retry-After": String(retryAfter) });
      }
      const response = await deps.fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "support@estateofmindpm.com", to: ["support@estateofmindpm.com"],
          subject: subject || "New Support Ticket", reply_to: user.email,
          html: `<h2>New Support Ticket</h2><p><strong>User:</strong> ${escapeHtml(user.email)}</p><p><strong>Subject:</strong> ${escapeHtml(subject || "Support request")}</p><p style="white-space:pre-wrap">${escapeHtml(message)}</p>`,
        }),
      });
      if (!response.ok) return json({ error: "Could not send support email." }, 502);
      return json({ success: true });
    } catch {
      return json({ error: "Support email service is unavailable." }, 503);
    }
  };
}
