type SendMagicLinkInput = {
  email: string;
  url: string;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getSender() {
  return process.env.AUTH_FROM_EMAIL ?? "F1 Hub <auth@localhost>";
}

export async function sendMagicLinkEmail({ email, url }: SendMagicLinkInput) {
  const resendApiKey = process.env.RESEND_API_KEY;

  if (!resendApiKey) {
    console.info(
      `[auth] magic link for ${email}: ${url} (configure RESEND_API_KEY to send real emails)`,
    );
    return;
  }

  const safeUrl = escapeHtml(url);

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: getSender(),
      to: email,
      subject: "Your F1 Hub sign-in link",
      text: `Use this link to sign in to F1 Hub:\n\n${url}\n\nIf you did not request this email, you can ignore it.`,
      html: `
        <div style="font-family: system-ui, sans-serif; line-height: 1.5;">
          <p>Use the link below to sign in to F1 Hub.</p>
          <p><a href="${safeUrl}">Sign in to F1 Hub</a></p>
          <p style="color: #667085; word-break: break-all;">${safeUrl}</p>
          <p style="color: #667085;">If you did not request this email, you can ignore it.</p>
        </div>
      `,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to send magic link email: ${errorText}`);
  }
}
