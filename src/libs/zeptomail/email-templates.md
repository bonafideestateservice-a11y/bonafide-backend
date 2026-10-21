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
- [x] `PAYMENT_RECEIVED_ADMIN`: created, key in templates.ts

Verification request submitted

- [x] `VERIFICATION_REQUEST_CREATED`: created, key in templates.ts
- [x] `VERIFICATION_REQUEST_CREATED_ADMIN`: created, key in templates.ts

Agent assigned

- [x] `AGENT_ASSIGNED`: created, key in templates.ts
- [x] `AGENT_ASSIGNED_AGENT`: created, key in templates.ts

Inspection started

- [x] `INSPECTION_STARTED`: created, key in templates.ts
- [x] `INSPECTION_STARTED_ADMIN`: created, key in templates.ts

Report uploaded

- [x] `REPORT_UPLOADED`: created, key in templates.ts
- [x] `REPORT_UPLOADED_ADMIN`: created, key in templates.ts

Verification payment problems

- [x] `PAYMENT_FAILED`: created, key in templates.ts
- [x] `SUBSCRIPTION_ENDED`: created, key in templates.ts

Property purchases and consultations

- [x] `PROPERTY_REQUEST_CREATED`: created, key in templates.ts
- [x] `PROPERTY_REQUEST_CREATED_ADMIN`: created, key in templates.ts
- [x] `PROPERTY_REQUEST_UPDATED`: created, key in templates.ts
- [x] `PROPERTY_PAYMENT_RECEIVED`: created, key in templates.ts
- [x] `PROPERTY_PAYMENT_RECEIVED_ADMIN`: created, key in templates.ts
- [x] `PROPERTY_PAYMENT_FAILED`: created, key in templates.ts

Agents

- [x] `AGENT_WELCOME`: created, key in templates.ts

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

# Verification payment problems

## PAYMENT_FAILED

- **Sent to:** the client, when a verification payment or renewal fails
  (also shown in their in-app notifications)
- **Variable:** `ZEPTO_TEMPLATE_PAYMENT_FAILED`
- **Suggested subject:** Your payment didn't go through

Fields:

- `firstName`: client's name. _Ada Okafor_
- `amount`: amount that failed, 2 decimals (may be blank). _1,500.00_
- `currency`: currency code (may be blank). _NGN_
- `paymentKind`: `first payment` or `renewal`. _renewal_
- `verificationType`: type of verification. _Land Verification_
- `serviceName`: service it belongs to. _Property_
- `requestName`: property or business name (may be blank). _Palm Villa_
- `address`: property, construction or business address (may be blank). _12 Allen Avenue, Ikeja, Lagos_
- `verificationRequestId`: request ID. _cmg4x2k1p0001qz8h3f7a9b2c_

## SUBSCRIPTION_ENDED

- **Sent to:** the client, when a recurring plan is cancelled or ends
  (also shown in their in-app notifications)
- **Variable:** `ZEPTO_TEMPLATE_SUBSCRIPTION_ENDED`
- **Suggested subject:** Your {{planName}} plan has ended

Fields:

- `firstName`: client's name. _Ada Okafor_
- `planName`: the plan (may be blank). _Monthly Update_
- `verificationType`: type of verification. _Land Verification_
- `serviceName`: service it belongs to. _Property_
- `requestName`: property or business name (may be blank). _Palm Villa_
- `address`: property, construction or business address (may be blank). _12 Allen Avenue, Ikeja, Lagos_
- `verificationRequestId`: request ID. _cmg4x2k1p0001qz8h3f7a9b2c_

---

# Property purchases and consultations

## PROPERTY_REQUEST_CREATED

- **Sent to:** the client who made a purchase or consultation request
- **Variable:** `ZEPTO_TEMPLATE_PROPERTY_REQUEST_CREATED`
- **Suggested subject:** We've received your {{requestType}} request for {{propertyName}}

Fields:

- `firstName`: client's name. _Ada Okafor_
- `requestType`: `purchase` or `consultation`. _purchase_
- `reference`: request reference. _BF-PUR-203948_
- `propertyName`: property name. _Palm Villa_
- `propertyAddress`: property address (may be blank). _12 Allen Avenue, Ikeja, Lagos_
- `price`: listed price, 2 decimals. _85,000,000.00_
- `currency`: currency code. _NGN_
- `submittedAt`: when it was made. _2026-09-30T10:00:00.000Z_

## PROPERTY_REQUEST_CREATED_ADMIN

- **Sent to:** every admin, when a client makes a purchase or consultation request
- **Variable:** `ZEPTO_TEMPLATE_PROPERTY_REQUEST_CREATED_ADMIN`
- **Suggested subject:** New {{requestType}} request from {{clientName}}

Fields:

- `firstName`: admin's name. _Chidi Eze_
- `clientName`: client's name. _Ada Okafor_
- `clientEmail`: client's email. _ada@example.com_
- `clientPhone`: client's phone (may be blank). _+2348012345678_
- `requestType`: `purchase` or `consultation`. _purchase_
- `reference`: request reference. _BF-PUR-203948_
- `propertyName`: property name. _Palm Villa_
- `propertyAddress`: property address (may be blank). _12 Allen Avenue, Ikeja, Lagos_
- `price`: listed price, 2 decimals. _85,000,000.00_
- `currency`: currency code. _NGN_
- `submittedAt`: when it was made. _2026-09-30T10:00:00.000Z_

## PROPERTY_REQUEST_UPDATED

- **Sent to:** the client, when an admin moves their request to a new stage
- **Variable:** `ZEPTO_TEMPLATE_PROPERTY_REQUEST_UPDATED`
- **Suggested subject:** {{propertyName}}: {{statusLabel}}

Fields:

- `firstName`: client's name. _Ada Okafor_
- `requestType`: `purchase` or `consultation`. _purchase_
- `reference`: request reference. _BF-PUR-203948_
- `propertyName`: property name. _Palm Villa_
- `propertyAddress`: property address (may be blank). _12 Allen Avenue, Ikeja, Lagos_
- `status`: new stage code. _OWNERSHIP_TRANSFER_
- `statusLabel`: new stage, readable. _Ownership transfer_
- `message`: the admin's note, or a default one for the stage. _We've started transferring ownership to you._

## PROPERTY_PAYMENT_RECEIVED

- **Sent to:** the client, once their property payment is confirmed
- **Variable:** `ZEPTO_TEMPLATE_PROPERTY_PAYMENT_RECEIVED`
- **Suggested subject:** Payment received for {{propertyName}}

Fields:

- `firstName`: client's name. _Ada Okafor_
- `propertyName`: property name. _Palm Villa_
- `reference`: purchase reference. _BF-PUR-203948_
- `paymentReference`: payment reference. _BF-PAY-203948_
- `amount`: amount, 2 decimals. _85,000,000.00_
- `currency`: currency code. _NGN_
- `method`: `Card` or `Bank transfer`. _Card_
- `paidAt`: when it was paid. _2026-09-30T10:00:00.000Z_

## PROPERTY_PAYMENT_RECEIVED_ADMIN

- **Sent to:** every admin, when a property payment is confirmed
- **Variable:** `ZEPTO_TEMPLATE_PROPERTY_PAYMENT_RECEIVED_ADMIN`
- **Suggested subject:** {{clientName}} paid for {{propertyName}}

Fields:

- `firstName`: admin's name. _Chidi Eze_
- `clientName`: client who paid. _Ada Okafor_
- `clientEmail`: client's email. _ada@example.com_
- `propertyName`: property name. _Palm Villa_
- `reference`: purchase reference. _BF-PUR-203948_
- `paymentReference`: payment reference. _BF-PAY-203948_
- `amount`: amount, 2 decimals. _85,000,000.00_
- `currency`: currency code. _NGN_
- `method`: `Card` or `Bank transfer`. _Card_
- `paidAt`: when it was paid. _2026-09-30T10:00:00.000Z_

## PROPERTY_PAYMENT_FAILED

- **Sent to:** the client, when their property payment fails
- **Variable:** `ZEPTO_TEMPLATE_PROPERTY_PAYMENT_FAILED`
- **Suggested subject:** Your payment for {{propertyName}} didn't go through

Fields:

- `firstName`: client's name. _Ada Okafor_
- `propertyName`: property name. _Palm Villa_
- `reference`: purchase reference. _BF-PUR-203948_
- `paymentReference`: payment reference. _BF-PAY-203948_
- `amount`: amount, 2 decimals. _85,000,000.00_
- `currency`: currency code. _NGN_
- `method`: `Card` or `Bank transfer`. _Card_

---

# Agents

## AGENT_WELCOME

- **Sent to:** a new agent, when an admin adds them (always sent)
- **Variable:** `ZEPTO_TEMPLATE_AGENT_WELCOME`
- **Suggested subject:** Your Bonafide agent account is ready

The agent sets a password with the code, then logs in. Tell them to use **Forgot password** if the code expires.

Fields:

- `firstName`: agent's name. _Tunde Bello_
- `email`: the email they log in with. _tunde@example.com_
- `setupCode`: 6-digit code to set their password. _482913_
- `expiresIn`: how long the code lasts. _48 hours_
- `loginUrl`: the admin/agent app's login page (blank until `ADMIN_APP_URL` is set). _https://admin.bonafide.com.ng/login_

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
- **Links to the dashboard or a specific request:** needs the frontend URL for each app
  (only the agent login link exists, from `ADMIN_APP_URL`).
- **A separate first name:** only the full name is stored.
