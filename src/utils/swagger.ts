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
    },
  },
  apis: ["./src/api/**/index.ts"],
};

export const swaggerSpec = swaggerJsdoc(options);

export { swaggerUi };