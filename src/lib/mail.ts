import "server-only";

// Sends one plain-text email through Resend (https://resend.com), if it is set up.
// Needs RESEND_API_KEY (a secret) and MAIL_FROM (for example "The Fable Club <hello@thefableclub.com>",
// a domain verified in Resend) in the CMS environment. Without them, sending is reported as not configured
// and the CMS offers a mailto: link instead.

export const mailConfigured = () => Boolean(process.env.RESEND_API_KEY?.trim() && process.env.MAIL_FROM?.trim());

export type MailResult = { ok: true } | { ok: false; reason: "not_configured" | "failed"; message: string };

export async function sendMail(to: string, subject: string, text: string): Promise<MailResult> {
  const key = process.env.RESEND_API_KEY?.trim();
  const from = process.env.MAIL_FROM?.trim();
  if (!key || !from) return { ok: false, reason: "not_configured", message: "Email sending is not set up." };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject, text }),
      signal: AbortSignal.timeout(15000),
    });
    if (res.ok) return { ok: true };
    return { ok: false, reason: "failed", message: `The email service answered ${res.status}.` };
  } catch (e) {
    return { ok: false, reason: "failed", message: e instanceof Error ? e.message : "Could not reach the email service." };
  }
}
