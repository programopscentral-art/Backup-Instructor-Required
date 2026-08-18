import type { SupabaseClient } from "@supabase/supabase-js";

type SB = SupabaseClient;

interface NotifyArgs {
  recipientEmail?: string | null;
  recipientUserId?: string | null;
  type: string;
  title: string;
  body: string;
  ticketId?: string | null;
}

/**
 * Records an in-app notification and, when Google Workspace SMTP is configured
 * (GMAIL_USER + GMAIL_APP_PASSWORD), sends the email from your @nxtwave.in
 * mailbox too. Safe to call from server actions — never throws.
 */
export async function notify(supabase: SB, args: NotifyArgs) {
  try {
    await supabase.from("notifications").insert({
      recipient_user_id: args.recipientUserId ?? null,
      recipient_email: args.recipientEmail ?? null,
      type: args.type,
      title: args.title,
      body: args.body,
      ticket_id: args.ticketId ?? null,
    });
  } catch {
    /* non-fatal */
  }

  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass || !args.recipientEmail) return;

  try {
    const nodemailer = (await import("nodemailer")).default;
    const transport = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user, pass: pass.replace(/\s+/g, "") },
    });

    await transport.sendMail({
      from: process.env.EMAIL_FROM ?? `NIAT Backup Ops <${user}>`,
      to: args.recipientEmail,
      subject: args.title,
      html: `<div style="font-family:system-ui,Segoe UI,sans-serif;color:#1e293b;max-width:520px">
        <div style="background:#991b1b;color:#fff;padding:16px 20px;border-radius:12px 12px 0 0">
          <strong style="font-size:15px">NIAT · Backup Instructor</strong>
        </div>
        <div style="border:1px solid #eee;border-top:none;padding:20px;border-radius:0 0 12px 12px">
          <h2 style="margin:0 0 8px;font-size:18px;color:#991b1b">${args.title}</h2>
          <p style="margin:0;line-height:1.6">${args.body}</p>
        </div>
        <p style="color:#94a3b8;font-size:12px;margin-top:12px">Program Ops · NxtWave / NIAT</p>
      </div>`,
    });
  } catch {
    /* email failures never block the workflow */
  }
}
