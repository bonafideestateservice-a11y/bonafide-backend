/**
 * The Bonafide email layout (colours and type from the website). Used by the emails sent as
 * HTML and by scripts/zeptomail to build the ZeptoMail templates. Values are inserted as
 * given: escape anything that comes from users.
 */
export interface EmailLayout {
  heading: string;
  paragraphs: string[];
  /** Label/value rows shown in a details box. */
  details?: [string, string][];
  /** A one-time code shown large, e.g. a password reset code. */
  code?: string;
  /** A pill button, e.g. a login link. */
  button?: { label: string; url: string };
}

// Colours and type from the Bonafide website.
const PURPLE = "#5B0FF5";
const NAVY = "#0F172A";
const SLATE = "#64748B";
const LAVENDER = "#F6F4FE";
const BORDER = "#E8E3F8";
const FONT = "'Plus Jakarta Sans',Arial,Helvetica,sans-serif";

const row = ([label, value]: [string, string]) => `
                    <tr>
                      <td style="padding:7px 0;color:${SLATE};font-size:14px;width:42%;vertical-align:top">${label}</td>
                      <td style="padding:7px 0;color:${NAVY};font-size:14px;font-weight:600">${value}</td>
                    </tr>`;

const detailsBox = (details: [string, string][]) => `
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 22px;background:${LAVENDER};border:1px solid ${BORDER};border-radius:16px">
                  <tr><td style="padding:12px 20px">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${details.map(row).join("")}
                  </table>
                  </td></tr>
                </table>`;

const codeBox = (code: string) => `
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 22px">
                  <tr><td style="padding:14px 28px;background:${LAVENDER};border:1px dashed ${PURPLE};border-radius:16px;font-size:30px;font-weight:700;letter-spacing:8px;color:${PURPLE}">${code}</td></tr>
                </table>`;

const buttonLink = ({ label, url }: { label: string; url: string }) => `
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 22px">
                  <tr><td style="background:${PURPLE};border-radius:999px">
                    <a href="${url}" style="display:inline-block;padding:14px 30px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:999px">${label} &nbsp;&rarr;</a>
                  </td></tr>
                </table>`;

export const renderEmailHtml = ({
  heading,
  paragraphs,
  details,
  code,
  button,
}: EmailLayout) => `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700&display=swap" rel="stylesheet" />
  </head>
  <body style="margin:0;padding:0;background:${LAVENDER};font-family:${FONT}">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${LAVENDER};padding:32px 12px">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px">
            <tr>
              <td style="padding:0 8px 20px">
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="width:30px;height:30px;background:${PURPLE};border-radius:50%;text-align:center;vertical-align:middle;color:#ffffff;font-size:15px;font-weight:700;line-height:30px">&#10003;</td>
                    <td style="padding-left:9px;font-size:24px;font-weight:700;color:${PURPLE};font-family:${FONT}">Bonafide</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="background:#ffffff;border:1px solid ${BORDER};border-radius:24px;padding:36px 32px">
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 18px">
                  <tr><td style="padding:6px 16px;border:1px solid ${BORDER};border-radius:999px;font-size:12px;color:${SLATE}">Verify. Purchase. Manage.</td></tr>
                </table>
                <h1 style="margin:0 0 18px;font-size:26px;line-height:1.3;font-weight:700;color:${NAVY}">${heading}</h1>
${paragraphs.map((p) => `                <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:${SLATE}">${p}</p>`).join("\n")}${code ? codeBox(code) : ""}${details ? detailsBox(details) : ""}${button ? buttonLink(button) : ""}
                <p style="margin:8px 0 0;font-size:15px;line-height:1.6;color:${NAVY}">Warm regards,<br /><strong style="color:${PURPLE}">The Bonafide Team</strong></p>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:24px 16px 0;font-size:12px;line-height:1.6;color:${SLATE}">
                Bonafide &middot; Securely verify, purchase and manage properties in Nigeria, from anywhere in the world.<br />
                You're receiving this email because you have a Bonafide account.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
`;
