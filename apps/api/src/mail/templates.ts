/** Plain, short emails. The code is in the subject so it shows in notifications. */
export function loginCodeEmail(code: string) {
  return {
    subject: `${code} is your Daddy Jokes code`,
    text: [
      `Your sign-in code is ${code}.`,
      "",
      "It works for 10 minutes. If you didn't ask for it, you can ignore this email.",
    ].join("\n"),
    html: `<p style="font-family:system-ui,sans-serif;font-size:16px">Your sign-in code is</p>
<p style="font-family:system-ui,sans-serif;font-size:32px;font-weight:800;letter-spacing:6px">${code}</p>
<p style="font-family:system-ui,sans-serif;font-size:14px;color:#4b5373">It works for 10 minutes. If you didn't ask for it, you can ignore this email.</p>`,
  };
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** A plain message: paragraphs from the text, unless the sender gave its own HTML. */
export function messageEmail(m: { subject: string; text: string; html?: string }) {
  const html =
    m.html ??
    m.text
      .split(/\n{2,}/)
      .map((p) => `<p style="font-family:system-ui,sans-serif;font-size:16px;line-height:1.5">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
      .join("\n");
  return { subject: m.subject, text: m.text, html };
}
