/**
 * All Bonafide Backend endpoints with full URLs and request bodies.
 * Deployed base: https://bonafide-backend-9mly.onrender.com
 */

export const BASE_URL = "https://bonafide-backend-9mly.onrender.com";

export interface Endpoint {
  name: string;
  method: "GET" | "POST";
  url: string; // full URL — paste into Postman URL bar
  headers?: Record<string, string>;
  body?: object; // paste into Postman Body > raw > JSON
}

export const ENDPOINTS: Endpoint[] = [
  // ── Server ─────────────────────────────────────────────
  {
    name: "Healthcheck",
    method: "GET",
    url: "https://bonafide-backend-9mly.onrender.com/api/healthcheck",
  },
  {
    name: "Swagger Docs",
    method: "GET",
    url: "https://bonafide-backend-9mly.onrender.com/docs",
  },

  // ── Client Authentication ──────────────────────────────
  {
    name: "Client Sign Up",
    method: "POST",
    url: "https://bonafide-backend-9mly.onrender.com/api/v1/client/sign-up",
    headers: { "Content-Type": "application/json" },
    body: {
      "fullName": "John Doe",
      "email": "john.doe@example.com",
      "password": "StrongPass123!",
      "role": "CLIENT",
      "termsAndCondition": true,
    },
  },
  {
    name: "Client Login",
    method: "POST",
    url: "https://bonafide-backend-9mly.onrender.com/api/v1/client/login",
    headers: { "Content-Type": "application/json" },
    body: {
      "email": "john.doe@example.com",
      "password": "StrongPass123!",
    },
  },
  {
    name: "Client Change Password",
    method: "POST",
    url: "https://bonafide-backend-9mly.onrender.com/api/v1/client/change-password",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer <TOKEN_FROM_LOGIN>",
    },
    body: {
      "currentPassword": "StrongPass123!",
      "newPassword": "NewStrongPass456!",
      "confirmPassword": "NewStrongPass456!",
    },
  },
  {
    name: "Client Forgot Password",
    method: "POST",
    url: "https://bonafide-backend-9mly.onrender.com/api/v1/client/forgot-password",
    headers: { "Content-Type": "application/json" },
    body: {
      "email": "john.doe@example.com",
    },
  },
  {
    name: "Client Reset Password",
    method: "POST",
    url: "https://bonafide-backend-9mly.onrender.com/api/v1/client/reset-password/<RESET_TOKEN>",
    headers: { "Content-Type": "application/json" },
    body: {
      "password": "ResetPass789!",
    },
  },

  // ── Admin Authentication ───────────────────────────────
  {
    name: "Admin Login",
    method: "POST",
    url: "https://bonafide-backend-9mly.onrender.com/api/v1/admin/login",
    headers: { "Content-Type": "application/json" },
    body: {
      "email": "admin@example.com",
      "password": "AdminPass123!",
    },
  },
  {
    name: "Admin Change Password",
    method: "POST",
    url: "https://bonafide-backend-9mly.onrender.com/api/v1/admin/change-password",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer <TOKEN_FROM_LOGIN>",
    },
    body: {
      "currentPassword": "AdminPass123!",
      "newPassword": "NewAdminPass456!",
      "confirmPassword": "NewAdminPass456!",
    },
  },
  {
    name: "Admin Forgot Password",
    method: "POST",
    url: "https://bonafide-backend-9mly.onrender.com/api/v1/admin/forgot-password",
    headers: { "Content-Type": "application/json" },
    body: {
      "email": "admin@example.com",
    },
  },
  {
    name: "Admin Reset Password",
    method: "POST",
    url: "https://bonafide-backend-9mly.onrender.com/api/v1/admin/reset-password/<RESET_TOKEN>",
    headers: { "Content-Type": "application/json" },
    body: {
      "password": "ResetPass789!",
    },
  },

  // ── Webhooks ───────────────────────────────────────────
  {
    name: "Payments Webhook",
    method: "POST",
    url: "https://bonafide-backend-9mly.onrender.com/api/v1/webhook/payments",
    headers: { "Content-Type": "application/json" },
    body: {
      "event": "payment.success",
      "data": {
        "reference": "PAY-123",
        "amount": 5000,
        "currency": "NGN",
      },
    },
  },
];