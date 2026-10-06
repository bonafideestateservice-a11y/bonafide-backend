# ZeptoMail Email Templates

Every email the backend sends through ZeptoMail, and the data each one receives.

## Setup

1. Create the template in ZeptoMail (under **Templates**, in the Mail Agent the backend sends from).
2. Add merge fields with `{{fieldName}}`, spelled exactly as listed below. They are case-sensitive.
3. Copy the template key into the environment variable for that template.
   The variable is always `ZEPTO_TEMPLATE_` + the template name.
   Example: `ZEPTO_TEMPLATE_PAYMENT_RECEIVED_ADMIN=2d6f.xxxx...`
4. Restart the API and worker so they pick up the new key.

If a key is missing, that one email is skipped and logged as failed.
Everything else still goes out.

## Good to know

- `firstName` is always the person receiving the email.
  In an admin email it is the admin's name; the client is in `clientName`.
- `firstName` holds the full name (e.g. "Ada Okafor"). There is no separate first name.
- Every value is text. Missing data arrives as an empty string, so optional fields can be blank.
- Dates look like `2026-09-30T10:00:00.000Z`.

## Checklist

Account

- [ ] `USER_REGISTERED`: already exists
- [ ] `FORGOT_PASSWORD`: already exists

Payment

- [ ] `PAYMENT_RECEIVED`: already exists, **needs updating** (see its section)
- [ ] `PAYMENT_RECEIVED_ADMIN`: new

Verification request submitted

- [ ] `VERIFICATION_REQUEST_CREATED`: new
- [ ] `VERIFICATION_REQUEST_CREATED_ADMIN`: new

Agent assigned

- [ ] `AGENT_ASSIGNED`: new
- [ ] `AGENT_ASSIGNED_AGENT`: new

Inspection started

- [ ] `INSPECTION_STARTED`: new
- [ ] `INSPECTION_STARTED_ADMIN`: new

Report uploaded

- [ ] `REPORT_UPLOADED`: new
- [ ] `REPORT_UPLOADED_ADMIN`: new

"Already exists" means the backend has a key for it and uses that key unless you set the variable.

---

# Account

## USER_REGISTERED

- **Sent to:** the user who just signed up (always sent)
- **Variable:** `ZEPTO_TEMPLATE_USER_REGISTERED`
- **Suggested subject:** Welcome to Bonafide, {{firstName}}

Fields:

- `firstName`: new user's name. _Ada Okafor_
- `email`: email they signed up with. _ada@example.com_

## FORGOT_PASSWORD

- **Sent to:** the client or admin who asked to reset their password (always sent)
- **Variable:** `ZEPTO_TEMPLATE_FORGOT_PASSWORD`
- **Suggested subject:** Your password reset code

Fields:

- `firstName`: user's name. _Ada Okafor_
- `otp`: 6-digit reset code. _482913_
- `expiresIn`: how long the code works. _10 minutes_
- `resetLink`: same value as `otp`, kept for the old template. Use `otp` instead.

---

# Payment

## PAYMENT_RECEIVED

- **Sent to:** the client who paid, once Paystack or Stripe confirms it
- **Variable:** `ZEPTO_TEMPLATE_PAYMENT_RECEIVED`
- **Suggested subject:** Payment received: {{currency}} {{amount}}

> **Update the existing template:**
>
> - Remove `service_time`, `trip_type`, `service_date` and `airport`. They are no longer sent and would show blank.
> - `amount` is now formatted like `1,500.00` (it used to be the raw kobo/cents value, `150000`).

Fields:

- `firstName`: client's name. _Ada Okafor_
- `amount`: amount paid, 2 decimals. _1,500.00_
- `currency`: currency code. _NGN_
- `reference`: payment provider's reference. _T482913650284_
- `payment_receipt`: same as `reference`. _T482913650284_
- `receipt_id`: receipt number (our transaction ID). _cmg4x9q2r0003qz8hk1d7e4f5_
- `booking_ref`: the verification request this pays for. _cmg4x2k1p0001qz8h3f7a9b2c_
- `service_name`: what was paid for (may be blank). _Land Verification_

## PAYMENT_RECEIVED_ADMIN

- **Sent to:** every admin, when a client's payment is confirmed
- **Variable:** `ZEPTO_TEMPLATE_PAYMENT_RECEIVED_ADMIN`
- **Suggested subject:** {{clientName}} paid {{currency}} {{amount}}

Fields:

- `firstName`: admin's name. _Chidi Eze_
- `clientName`: client who paid. _Ada Okafor_
- `clientEmail`: client's email. _ada@example.com_
- `amount`: amount paid, 2 decimals. _1,500.00_
- `currency`: currency code. _NGN_
- `reference`: payment provider's reference. _T482913650284_
- `payment_receipt`: same as `reference`. _T482913650284_
- `receipt_id`: receipt number (our transaction ID). _cmg4x9q2r0003qz8hk1d7e4f5_
- `booking_ref`: the verification request this pays for. _cmg4x2k1p0001qz8h3f7a9b2c_
- `service_name`: what was paid for (may be blank). _Land Verification_

---

# Verification request submitted

## VERIFICATION_REQUEST_CREATED

- **Sent to:** the client who submitted the request
- **Variable:** `ZEPTO_TEMPLATE_VERIFICATION_REQUEST_CREATED`
- **Suggested subject:** We've received your {{verificationType}} request

Fields:

- `firstName`: client's name. _Ada Okafor_
- `verificationType`: type of verification. _Land Verification_
- `serviceName`: service it belongs to. _Property_
- `requestName`: property or business name (may be blank). _Palm Villa_
- `address`: property, construction or business address (may be blank). _12 Allen Avenue, Ikeja, Lagos_
- `verificationRequestId`: request ID. _cmg4x2k1p0001qz8h3f7a9b2c_
- `submittedAt`: when it was submitted. _2026-09-30T10:00:00.000Z_

## VERIFICATION_REQUEST_CREATED_ADMIN

- **Sent to:** every admin, when a client submits a request
- **Variable:** `ZEPTO_TEMPLATE_VERIFICATION_REQUEST_CREATED_ADMIN`
- **Suggested subject:** New {{verificationType}} request from {{clientName}}

Fields:

- `firstName`: admin's name. _Chidi Eze_
- `clientName`: client's name. _Ada Okafor_
- `clientEmail`: client's email. _ada@example.com_
- `clientPhone`: client's phone (may be blank). _+2348012345678_
- `verificationType`: type of verification. _Land Verification_
- `serviceName`: service it belongs to. _Property_
- `requestName`: property or business name (may be blank). _Palm Villa_
- `address`: property, construction or business address (may be blank). _12 Allen Avenue, Ikeja, Lagos_
- `verificationRequestId`: request ID. _cmg4x2k1p0001qz8h3f7a9b2c_
- `submittedAt`: when it was submitted. _2026-09-30T10:00:00.000Z_

---

# Agent assigned

## AGENT_ASSIGNED

- **Sent to:** the client, when an agent is assigned to their request
- **Variable:** `ZEPTO_TEMPLATE_AGENT_ASSIGNED`
- **Suggested subject:** An agent has been assigned to your {{verificationType}}

Fields:

- `firstName`: client's name. _Ada Okafor_
- `agentName`: assigned agent. _Tunde Bello_
- `agentPhone`: agent's phone (may be blank). _+2348098765432_
- `verificationType`: type of verification. _Land Verification_
- `serviceName`: service it belongs to. _Property_
- `requestName`: property or business name (may be blank). _Palm Villa_
- `address`: property, construction or business address (may be blank). _12 Allen Avenue, Ikeja, Lagos_
- `verificationRequestId`: request ID. _cmg4x2k1p0001qz8h3f7a9b2c_

## AGENT_ASSIGNED_AGENT

- **Sent to:** the agent who was just assigned
- **Variable:** `ZEPTO_TEMPLATE_AGENT_ASSIGNED_AGENT`
- **Suggested subject:** New assignment: {{verificationType}} for {{clientName}}

Fields:

- `firstName`: agent's name. _Tunde Bello_
- `clientName`: client's name. _Ada Okafor_
- `clientEmail`: client's email. _ada@example.com_
- `clientPhone`: client's phone (may be blank). _+2348012345678_
- `verificationType`: type of verification. _Land Verification_
- `serviceName`: service it belongs to. _Property_
- `requestName`: property or business name (may be blank). _Palm Villa_
- `address`: address to inspect (may be blank). _12 Allen Avenue, Ikeja, Lagos_
- `verificationRequestId`: request ID. _cmg4x2k1p0001qz8h3f7a9b2c_
- `assignmentId`: assignment ID. _cmg4z7h8j0005qz8hr2s3t4u5_

---

# Inspection started

## INSPECTION_STARTED

- **Sent to:** the client, when the agent starts the inspection
  (skipped if the client turned off inspection updates for that request)
- **Variable:** `ZEPTO_TEMPLATE_INSPECTION_STARTED`
- **Suggested subject:** Your {{verificationType}} inspection has started

Fields:

- `firstName`: client's name. _Ada Okafor_
- `agentName`: agent doing the inspection (may be blank). _Tunde Bello_
- `verificationType`: type of verification. _Land Verification_
- `serviceName`: service it belongs to. _Property_
- `requestName`: property or business name (may be blank). _Palm Villa_
- `address`: property, construction or business address (may be blank). _12 Allen Avenue, Ikeja, Lagos_
- `verificationRequestId`: request ID. _cmg4x2k1p0001qz8h3f7a9b2c_

## INSPECTION_STARTED_ADMIN

- **Sent to:** every admin, when an agent starts an inspection
- **Variable:** `ZEPTO_TEMPLATE_INSPECTION_STARTED_ADMIN`
- **Suggested subject:** Inspection started for {{clientName}}'s {{verificationType}}

Fields:

- `firstName`: admin's name. _Chidi Eze_
- `clientName`: client's name. _Ada Okafor_
- `clientEmail`: client's email. _ada@example.com_
- `clientPhone`: client's phone (may be blank). _+2348012345678_
- `agentName`: agent doing the inspection (may be blank). _Tunde Bello_
- `verificationType`: type of verification. _Land Verification_
- `serviceName`: service it belongs to. _Property_
- `requestName`: property or business name (may be blank). _Palm Villa_
- `address`: property, construction or business address (may be blank). _12 Allen Avenue, Ikeja, Lagos_
- `verificationRequestId`: request ID. _cmg4x2k1p0001qz8h3f7a9b2c_
- `assignmentId`: assignment ID. _cmg4z7h8j0005qz8hr2s3t4u5_

---

# Report uploaded

## REPORT_UPLOADED

- **Sent to:** the client, when the agent's report is uploaded
  (skipped if the client turned off report updates for that request)
- **Variable:** `ZEPTO_TEMPLATE_REPORT_UPLOADED`
- **Suggested subject:** Your {{verificationType}} report is ready

Fields:

- `firstName`: client's name. _Ada Okafor_
- `agentName`: agent who wrote the report (may be blank). _Tunde Bello_
- `verificationType`: type of verification. _Land Verification_
- `serviceName`: service it belongs to. _Property_
- `requestName`: property or business name (may be blank). _Palm Villa_
- `address`: property, construction or business address (may be blank). _12 Allen Avenue, Ikeja, Lagos_
- `verificationRequestId`: request ID. _cmg4x2k1p0001qz8h3f7a9b2c_
- `reportId`: report ID. _cmg5a1b2c0007qz8hm3n4p5q6_

## REPORT_UPLOADED_ADMIN

- **Sent to:** every admin, when a report is uploaded
- **Variable:** `ZEPTO_TEMPLATE_REPORT_UPLOADED_ADMIN`
- **Suggested subject:** Report uploaded for {{clientName}}'s {{verificationType}}

Fields:

- `firstName`: admin's name. _Chidi Eze_
- `clientName`: client's name. _Ada Okafor_
- `clientEmail`: client's email. _ada@example.com_
- `clientPhone`: client's phone (may be blank). _+2348012345678_
- `agentName`: agent who wrote the report (may be blank). _Tunde Bello_
- `verificationType`: type of verification. _Land Verification_
- `serviceName`: service it belongs to. _Property_
- `requestName`: property or business name (may be blank). _Palm Villa_
- `address`: property, construction or business address (may be blank). _12 Allen Avenue, Ikeja, Lagos_
- `verificationRequestId`: request ID. _cmg4x2k1p0001qz8h3f7a9b2c_
- `reportId`: report ID. _cmg5a1b2c0007qz8hm3n4p5q6_

---

# Testing in ZeptoMail

Paste this into ZeptoMail's merge data preview to test `INSPECTION_STARTED_ADMIN`.
For other templates, keep only the fields listed in that template's section.

```json
{
  "firstName": "Chidi Eze",
  "clientName": "Ada Okafor",
  "clientEmail": "ada@example.com",
  "clientPhone": "+2348012345678",
  "agentName": "Tunde Bello",
  "verificationType": "Land Verification",
  "serviceName": "Property",
  "requestName": "Palm Villa",
  "address": "12 Allen Avenue, Ikeja, Lagos",
  "verificationRequestId": "cmg4x2k1p0001qz8h3f7a9b2c",
  "assignmentId": "cmg4z7h8j0005qz8hr2s3t4u5"
}
```

# Not sent yet

Ask a developer if a design needs any of these:

- **Report download link:** stored on the report, easy to add to the report emails.
- **Inspection scheduled date:** stored on the assignment, easy to add to the agent and inspection emails.
- **Links to the dashboard or a specific request:** needs the frontend URL for each app.
- **A separate first name:** only the full name is stored.
