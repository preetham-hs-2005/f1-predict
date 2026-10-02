export interface EmailContent {
  text: string;
  html: string;
}

const colors = {
  background: "#111317",
  panel: "#1a1d22",
  raised: "#22262b",
  border: "#383d43",
  signal: "#9cf33b",
  white: "#f3f5f7",
  muted: "#a5abb2",
};

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[character]!);

function layout(input: {
  eyebrow: string;
  title: string;
  greeting: string;
  paragraphs: string[];
  button: string;
  url: string;
  details?: { label: string; value: string }[];
  note?: string;
}): EmailContent {
  const { eyebrow, title, greeting, paragraphs, button, url, details = [], note } = input;
  const text = [greeting, "", title, "", ...paragraphs.flatMap((paragraph) => [paragraph, ""]),
    ...details.flatMap(({ label, value }) => [`${label}: ${value}`]),
    ...(details.length ? [""] : []), `${button}: ${url}`, "",
    ...(note ? [note, ""] : []), "F1 Predictor Pro", "An independent fan project; not affiliated with Formula 1."].join("\n");

  const detailRows = details.map(({ label, value }, index) => `
    <tr>
      <td style="padding:13px 16px;${index ? `border-top:1px solid ${colors.border};` : ""}color:${colors.muted};font:11px/1.5 Consolas,'Courier New',monospace;letter-spacing:1px;text-transform:uppercase;vertical-align:top;width:38%">${escapeHtml(label)}</td>
      <td style="padding:13px 16px;${index ? `border-top:1px solid ${colors.border};` : ""}color:${colors.white};font:600 13px/1.5 Arial,Helvetica,sans-serif;vertical-align:top">${escapeHtml(value)}</td>
    </tr>`).join("");

  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark"><title>${escapeHtml(title)}</title></head>
<body bgcolor="${colors.background}" style="margin:0;padding:0;background:${colors.background};color:${colors.white};font-family:Arial,Helvetica,sans-serif">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${colors.background}">${escapeHtml(paragraphs[0] || title)}</div>
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" bgcolor="${colors.background}" style="background:${colors.background};border-collapse:collapse">
    <tr><td align="center" style="padding:28px 12px 36px">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:600px;border-collapse:collapse">
        <tr><td bgcolor="${colors.signal}" style="background:${colors.signal};padding:8px 18px;color:${colors.background};font:700 10px/1.4 Consolas,'Courier New',monospace;letter-spacing:2px;text-transform:uppercase">F1 PREDICTOR PRO <span style="float:right">RACE CONTROL / EMAIL</span></td></tr>
        <tr><td bgcolor="${colors.panel}" style="background:${colors.panel};border:1px solid ${colors.border};border-top:0;padding:26px 26px 24px">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td bgcolor="${colors.signal}" align="center" valign="middle" width="44" height="44" style="width:44px;height:44px;background:${colors.signal};color:${colors.background};font:900 17px/44px Arial,Helvetica,sans-serif;text-align:center">F1</td>
            <td style="padding-left:12px"><div style="color:${colors.white};font:800 16px/1.1 Arial,Helvetica,sans-serif;letter-spacing:1px;text-transform:uppercase">PREDICTOR</div><div style="padding-top:4px;color:${colors.muted};font:10px/1.2 Consolas,'Courier New',monospace;letter-spacing:1px;text-transform:uppercase">PRO / RACE CONTROL</div></td>
          </tr></table>
        </td></tr>
        <!-- PREVIEW_BANNER -->
        <tr><td bgcolor="${colors.panel}" style="background:${colors.panel};border-left:1px solid ${colors.border};border-right:1px solid ${colors.border};padding:4px 26px 30px">
          <div style="color:${colors.signal};font:700 11px/1.4 Consolas,'Courier New',monospace;letter-spacing:2px;text-transform:uppercase">— ${escapeHtml(eyebrow)}</div>
          <h1 style="margin:14px 0 24px;color:${colors.white};font:700 30px/1.15 Arial,Helvetica,sans-serif;letter-spacing:-.5px">${escapeHtml(title)}</h1>
          <div style="height:1px;background:${colors.border};font-size:1px;line-height:1px">&nbsp;</div>
          <p style="margin:24px 0 16px;color:${colors.white};font:500 15px/1.7 Arial,Helvetica,sans-serif">${escapeHtml(greeting)}</p>
          ${paragraphs.map((paragraph) => `<p style="margin:0 0 16px;color:${colors.muted};font:14px/1.7 Arial,Helvetica,sans-serif">${escapeHtml(paragraph)}</p>`).join("")}
          ${detailRows ? `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" bgcolor="${colors.raised}" style="margin:24px 0 4px;background:${colors.raised};border:1px solid ${colors.border};border-collapse:collapse">${detailRows}</table>` : ""}
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px 0 22px"><tr><td bgcolor="${colors.signal}" style="background:${colors.signal}"><a href="${escapeHtml(url)}" style="display:inline-block;padding:14px 22px;color:${colors.background};font:700 12px/1.3 Consolas,'Courier New',monospace;letter-spacing:1px;text-decoration:none;text-transform:uppercase">${escapeHtml(button)} &nbsp;→</a></td></tr></table>
          <p style="margin:0;color:${colors.muted};font:11px/1.6 Arial,Helvetica,sans-serif;word-break:break-all">Button not working? Copy this link:<br><a href="${escapeHtml(url)}" style="color:${colors.signal};text-decoration:underline">${escapeHtml(url)}</a></p>
          ${note ? `<p style="margin:22px 0 0;color:${colors.muted};font:12px/1.6 Arial,Helvetica,sans-serif">${escapeHtml(note)}</p>` : ""}
        </td></tr>
        <tr><td bgcolor="${colors.background}" style="background:${colors.background};border-top:1px solid ${colors.border};padding:22px 3px 0">
          <div style="color:${colors.muted};font:11px/1.7 Consolas,'Courier New',monospace;letter-spacing:.3px">FOR THE FANS. BY THE FANS.<br>MADE WITH LOVE IN INDIA.</div>
          <p style="margin:15px 0 0;color:${colors.muted};font:10px/1.6 Arial,Helvetica,sans-serif">F1 Predictor Pro is an independent fan project and is not affiliated with Formula 1 or its companies.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
  return { text, html };
}

export function previewEmail(content: EmailContent): EmailContent {
  const banner = `<tr><td bgcolor="${colors.raised}" style="background:${colors.raised};border-left:1px solid ${colors.border};border-right:1px solid ${colors.border};padding:12px 26px;color:${colors.signal};font:700 11px/1.5 Consolas,'Courier New',monospace;letter-spacing:1px;text-transform:uppercase">Preview only / not a live reminder</td></tr>`;
  return { text: `PREVIEW ONLY — not a live reminder.\n\n${content.text}`, html: content.html.replace("<!-- PREVIEW_BANNER -->", banner) };
}

export function welcomeEmail(name: string, dashboardUrl: string): EmailContent {
  return layout({ eyebrow: "Welcome to the grid", title: "You're on the grid.", greeting: `Hi ${name},`, paragraphs: ["Welcome to F1 Predictor Pro. Follow each race weekend, make your picks before the session starts, and see how you stack up on the leaderboard.", "Ready for your first prediction?"], button: "Open dashboard", url: dashboardUrl });
}

export function resetEmail(name: string, resetUrl: string): EmailContent {
  return layout({ eyebrow: "Account security", title: "Reset your password.", greeting: `Hi ${name},`, paragraphs: ["We received a request to reset your F1 Predictor Pro password."], button: "Reset password", url: resetUrl, details: [{ label: "Link expires", value: "In 30 minutes" }, { label: "Link use", value: "One time only" }], note: "If you didn't request this, you can ignore this email. Your password has not changed." });
}

export function emailVerificationEmail(name: string, code: string, dashboardUrl: string): EmailContent {
  return layout({ eyebrow: "Account verification", title: "Confirm your email.", greeting: `Hi ${name},`, paragraphs: ["Enter this six-digit code in the verification window on your dashboard. Never share it with anyone."], button: "Open dashboard", url: dashboardUrl, details: [{ label: "Your code", value: code }, { label: "Expires", value: "In 10 minutes" }], note: "If you didn't create this account or request a code, you can ignore this email." });
}

export function emailVerifiedEmail(name: string, dashboardUrl: string): EmailContent {
  return layout({ eyebrow: "Account verified", title: "You're cleared to predict.", greeting: `Hi ${name},`, paragraphs: ["Your email is verified. You can now submit, update, and manage your race predictions."], button: "Open dashboard", url: dashboardUrl });
}

export function raceWeekEmail(name: string, raceName: string, circuitName: string, sessions: { label: string; value: string }[], dashboardUrl: string): EmailContent {
  return layout({ eyebrow: "Race week", title: `${raceName} is coming up.`, greeting: `Hi ${name},`, paragraphs: [`It's race week at ${circuitName}. Here's the schedule so you can plan your predictions.`], button: "Make predictions", url: dashboardUrl, details: sessions, note: "All session times shown in India time (IST)." });
}

export function qualifyingEmail(name: string, raceName: string, sessionLabel: string, sessionTime: string, predictionUrl: string): EmailContent {
  return layout({ eyebrow: "One-hour reminder", title: `${sessionLabel} starts soon.`, greeting: `Hi ${name},`, paragraphs: [`${raceName} ${sessionLabel.toLowerCase()} starts in about one hour. Submit your prediction before the session begins.`], button: "Make prediction", url: predictionUrl, details: [{ label: "Session", value: sessionLabel }, { label: "Starts", value: sessionTime }], note: "Session time shown in India time (IST)." });
}
