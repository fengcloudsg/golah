import nodemailer from "nodemailer";

export function smtpConfigured() {
  return Boolean(process.env.SMTP_HOST && (process.env.SMTP_FROM || process.env.SMTP_USER));
}

export async function sendOtpEmail(email, code) {
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || "GoLah! <golah@localhost>";
  const subject = "Your GoLah! login code";
  const text = `Your GoLah! login code is ${code}. It expires in 10 minutes. If you did not request this, you can ignore this email.`;
  const html = `<p>Your GoLah! login code is <strong style="font-size:1.25rem;letter-spacing:0.12em">${code}</strong>.</p><p>It expires in 10 minutes. If you did not request this, you can ignore this email.</p>`;

  if (!smtpConfigured()) {
    console.log(`[golah] OTP for ${email}: ${code} (set SMTP_HOST and SMTP_FROM to send email)`);
    return { delivered: false, logged: true };
  }

  const port = Number(process.env.SMTP_PORT || 587);
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: process.env.SMTP_SECURE === "1" || port === 465,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || "" }
      : undefined,
  });
  await transporter.sendMail({ from, to: email, subject, text, html });
  return { delivered: true, logged: false };
}
