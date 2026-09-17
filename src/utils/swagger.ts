import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";

import { config } from "../config";

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Bonafide Services API",
      version: "1.0.0",
      description: "Express + TypeScript + Prisma API server",
    },
    servers: [
      {
        url: `http://localhost:${config.port}/api`,
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
      schemas: {
        ROLE: {
          type: "string",
          enum: ["CLIENT", "ADMIN", "AGENT"],
        },
        User: {
          type: "object",
          required: ["id", "fullName", "email", "role"],
          properties: {
            id: { type: "string", format: "uuid" },
            fullName: { type: "string" },
            email: { type: "string", format: "email" },
            termsAndCondition: { type: "boolean" },
            role: { $ref: "#/components/schemas/ROLE" },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        SignUpRequest: {
          type: "object",
          required: ["fullName", "email", "password"],
          properties: {
            fullName: { type: "string", example: "Jane Doe" },
            email: {
              type: "string",
              format: "email",
              example: "jane@example.com",
            },
            password: {
              type: "string",
              format: "password",
              minLength: 8,
              example: "password123",
            },
            role: { $ref: "#/components/schemas/ROLE" },
            termsAndCondition: { type: "boolean", default: false },
          },
        },
        LoginRequest: {
          type: "object",
          required: ["email", "password"],
          properties: {
            email: {
              type: "string",
              format: "email",
              example: "jane@example.com",
            },
            password: {
              type: "string",
              format: "password",
              example: "password123",
            },
          },
        },
        ChangePasswordRequest: {
          type: "object",
          required: ["currentPassword", "newPassword", "confirmPassword"],
          properties: {
            currentPassword: { type: "string", format: "password" },
            newPassword: { type: "string", format: "password", minLength: 8 },
            confirmPassword: { type: "string", format: "password" },
          },
        },
        ForgotPasswordRequest: {
          type: "object",
          required: ["email"],
          properties: {
            email: {
              type: "string",
              format: "email",
              example: "jane@example.com",
            },
          },
        },
        ResetPasswordRequest: {
          type: "object",
          required: ["password"],
          properties: {
            password: {
              type: "string",
              format: "password",
              minLength: 8,
              example: "newpassword123",
            },
          },
        },
        AuthResponse: {
          type: "object",
          required: ["message", "token", "user"],
          properties: {
            message: { type: "string", example: "Login successful." },
            token: { type: "string", example: "eyJhbGciOiJIUzI1NiIs..." },
            user: { $ref: "#/components/schemas/User" },
          },
        },
        StatusMessageResponse: {
          type: "object",
          required: ["status", "message"],
          properties: {
            status: { type: "string", example: "success" },
            message: {
              type: "string",
              example: "Password has been changed successfully.",
            },
          },
        },
        ForgotPasswordResponse: {
          type: "object",
          required: ["status", "message", "token"],
          properties: {
            status: { type: "string", example: "success" },
            message: {
              type: "string",
              example: "Password reset link sent to email.",
            },
            token: { type: "string", example: "reset-token-value" },
          },
        },
        ErrorResponse: {
          type: "object",
          required: ["status", "message"],
          properties: {
            status: { type: "string", example: "error" },
            message: { type: "string", example: "Invalid credentials." },
          },
        },
        VerificationRequestSummary: {
          type: "object",
          required: ["id", "title", "verificationType", "status", "updatedAt"],
          properties: {
            id: { type: "string", example: "cm123verification" },
            title: { type: "string", example: "Lekki Phase 1 Apartment" },
            verificationType: {
              type: "object",
              required: ["name", "icon"],
              properties: {
                name: { type: "string", example: "Verification" },
                icon: { type: "string", nullable: true, example: "building" },
              },
            },
            status: {
              type: "string",
              enum: ["SUBMITTED", "IN_PROGRESS", "COMPLETED"],
            },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        VerificationReportSummary: {
          type: "object",
          required: ["unviewedReportsCount"],
          properties: {
            unviewedReportsCount: { type: "integer", minimum: 0, example: 1 },
          },
        },
      },
    },
  },
  apis: ["./src/api/**/index.ts"],
};

export const swaggerSpec = swaggerJsdoc(options);

export { swaggerUi };
