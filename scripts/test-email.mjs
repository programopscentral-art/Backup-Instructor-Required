// Verifies Google Workspace SMTP + sends a test email.
//   node --env-file=.env.local scripts/test-email.mjs [recipient@nxtwave.in]
import nodemailer from "nodemailer";

const user = process.env.GMAIL_USER;
const pass = process.env.GMAIL_APP_PASSWORD;
const to = process.argv[2] || user;

if (!user || !pass) {
  console.error("✗ Set GMAIL_USER and GMAIL_APP_PASSWORD in .env.local first.");
  process.exit(1);
}

const transport = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: { user, pass: pass.replace(/\s+/g, "") },
});

try {
  await transport.verify();
  console.log("✓ SMTP authentication OK");
  const info = await transport.sendMail({
    from: process.env.EMAIL_FROM || `NIAT Backup Ops <${user}>`,
    to,
    subject: "NIAT Backup Instructor — test email ✅",
    html: "<b>It works.</b><br/>Google Workspace SMTP is wired up for notifications.",
  });
  console.log(`✓ Test email sent: ${info.messageId} → ${to}`);
} catch (e) {
  console.error("✗ Failed:", e.message);
  console.error("  Common causes: App Password wrong, 2-Step Verification off, or admin disabled App Passwords.");
  process.exit(1);
}
