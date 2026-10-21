/* eslint-disable no-console -- a command-line script */
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

// Same env files as the app (src/config.ts).
dotenv.config({ path: "./.env" });
dotenv.config({ path: "./src/.env" });

// Imported after dotenv so the ZeptoMail client sees the env.
import {
  EmailContent,
  EmailTemplate,
  getEmailTemplateKey,
} from "../../src/libs/zeptomail/templates";
import { sendTemplateEmail } from "../../src/libs/zeptomail/zeptomail";
import { renderHtml, templateDefinitions } from "./templates";

/**
 * Creates the missing ZeptoMail templates and prints their keys.
 *
 *   npm run zeptomail:templates -- --preview [dir]   write each template's HTML to dir (no API calls)
 *   npm run zeptomail:templates                      create every template that has no key yet
 *   npm run zeptomail:templates -- --only NAME       create one template
 *   npm run zeptomail:templates -- --send-test EMAIL send every email, with sample data, to EMAIL
 *
 * Creating needs ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET and ZOHO_REFRESH_TOKEN (a Self Client
 * token with the Zeptomail.MailTemplates.ALL scope) and ZEPTO_MAILAGENT_ALIAS. Sending tests
 * uses the normal ZEPTO_TOKEN.
 */
const ACCOUNTS_URL = process.env.ZOHO_ACCOUNTS_URL || "https://accounts.zoho.com";
const TEMPLATES_API_URL = process.env.ZEPTO_TEMPLATES_API_URL || "https://api.zeptomail.com";

const argValue = (flag: string) => {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : (process.argv[index + 1] ?? "");
};

const required = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set in src/.env`);
  return value;
};

const getAccessToken = async () => {
  const params = new URLSearchParams({
    refresh_token: required("ZOHO_REFRESH_TOKEN"),
    client_id: required("ZOHO_CLIENT_ID"),
    client_secret: required("ZOHO_CLIENT_SECRET"),
    grant_type: "refresh_token",
  });
  const response = await fetch(`${ACCOUNTS_URL}/oauth/v2/token?${params}`, { method: "POST" });
  const body = (await response.json()) as { access_token?: string; error?: string };
  if (!body.access_token) {
    throw new Error(`Zoho token request failed: ${body.error ?? response.status}`);
  }
  return body.access_token;
};

const preview = (dir: string) => {
  fs.mkdirSync(dir, { recursive: true });
  for (const definition of templateDefinitions) {
    fs.writeFileSync(path.join(dir, `${definition.template}.html`), renderHtml(definition));
  }
  fs.writeFileSync(
    path.join(dir, "subjects.txt"),
    templateDefinitions.map((d) => `${d.template}\n  ${d.subject}\n`).join("\n"),
  );
  console.log(`Wrote ${templateDefinitions.length} templates to ${path.resolve(dir)}`);
};

const create = async (only?: string) => {
  const alias = required("ZEPTO_MAILAGENT_ALIAS");
  const definitions = only
    ? templateDefinitions.filter((definition) => definition.template === only)
    : templateDefinitions.filter((definition) => !getEmailTemplateKey(definition.template));
  if (definitions.length === 0) {
    console.log(only ? `No template named ${only}` : "Every template already has a key.");
    return;
  }

  const token = await getAccessToken();
  const created: string[] = [];
  for (const definition of definitions) {
    const response = await fetch(`${TEMPLATES_API_URL}/v1.1/mailagents/${alias}/templates`, {
      method: "POST",
      headers: { Authorization: `Zoho-oauthtoken ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        template_name: definition.template,
        subject: definition.subject,
        htmlbody: renderHtml(definition),
      }),
    });
    const body = (await response.json().catch(() => ({}))) as {
      data?: { template_key?: string };
      error?: unknown;
    };
    const key = body.data?.template_key;
    if (!key) {
      console.error(`✗ ${definition.template}: ${response.status} ${JSON.stringify(body)}`);
      continue;
    }
    console.log(`✓ ${definition.template}`);
    created.push(`  [EmailTemplate.${definition.template}]:\n    "${key}",`);
  }

  if (created.length) {
    console.log("\nAdd these to existingTemplateKeys in src/libs/zeptomail/templates.ts:\n");
    console.log(created.join("\n"));
  }
};

/** Sample data for the emails sent as HTML, which have no template definition. */
const htmlEmailSamples: EmailContent[] = [
  {
    template: EmailTemplate.USER_REGISTERED,
    data: { firstName: "Ada Okafor", email: "ada@example.com" },
  },
  {
    template: EmailTemplate.FORGOT_PASSWORD,
    data: { firstName: "Ada Okafor", otp: "482913", resetLink: "482913", expiresIn: "10 minutes" },
  },
  {
    template: EmailTemplate.PAYMENT_RECEIVED,
    data: {
      firstName: "Ada Okafor",
      amount: "1,500.00",
      currency: "NGN",
      reference: "T482913650284",
      payment_receipt: "T482913650284",
      receipt_id: "cmg4x9q2r0003qz8hk1d7e4f5",
      booking_ref: "cmg4x2k1p0001qz8h3f7a9b2c",
      service_name: "Land Verification",
    },
  },
];

const sendTests = async (email: string) => {
  const contents = [
    ...htmlEmailSamples,
    ...templateDefinitions.map(
      (definition) => ({ template: definition.template, data: definition.sample }) as EmailContent,
    ),
  ];
  for (const content of contents) {
    try {
      await sendTemplateEmail({ to: { email, name: "Bonafide test" }, content });
      console.log(`✓ ${content.template}`);
    } catch (error) {
      console.error(
        `✗ ${content.template}: ${error instanceof Error ? error.message : JSON.stringify(error)}`,
      );
    }
  }
};

const main = async () => {
  if (process.argv.includes("--preview")) return preview(argValue("--preview") || "tmp/emails");
  const testEmail = argValue("--send-test");
  if (testEmail !== undefined) {
    if (!testEmail) throw new Error("Usage: --send-test you@example.com");
    return sendTests(testEmail);
  }
  return create(argValue("--only"));
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
