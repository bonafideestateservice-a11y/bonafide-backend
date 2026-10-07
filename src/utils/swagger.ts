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
    // Paths include the /api/{version} prefix, so the server URL is the host only.
    servers: [
      {
        url: `http://localhost:${config.port}`,
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
          description: "A user as returned by the API (the password hash is never included).",
          required: [
            "id",
            "fullName",
            "email",
            "role",
            "termsAndCondition",
            "createdAt",
            "updatedAt",
          ],
          properties: {
            id: { type: "string", format: "uuid" },
            fullName: { type: "string", example: "Ada Okafor" },
            email: { type: "string", format: "email", example: "ada@example.com" },
            phone: { type: "string", nullable: true, example: "+2348012345678" },
            location: { type: "string", nullable: true, example: "Lagos" },
            profilePhoto: { type: "string", format: "uri", nullable: true },
            termsAndCondition: { type: "boolean" },
            provider: {
              type: "string",
              nullable: true,
              enum: ["local", "google", "facebook"],
              description: "How the account signs in",
            },
            providerId: { type: "string", nullable: true },
            role: { $ref: "#/components/schemas/ROLE" },
            paystackCustomerCode: { type: "string", nullable: true },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
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
      },
    },
  },
  apis: ["./src/api/**/index.ts"],
};

export const swaggerSpec = swaggerJsdoc(options);

export { swaggerUi };
