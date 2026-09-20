import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import session from "express-session";
import passport from "passport";

import { config } from "./config";
import { logger } from "./utils/logger";
import { errorHandler, notFoundHandler } from "./middlewares/error-handler";
import routes from "./routes";

const app = express();

app.use(helmet());

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || config.corsOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Not allowed by CORS"));
    },
  }),
);

app.use(morgan("combined", { stream: { write: (message) => logger.http(message.trim()) } }));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: config.jwt.secret || "fallback-test-secret",
    resave: false,
    saveUninitialized: false,
  }),
);
app.use(passport.initialize());
app.use(passport.session());

app.get("/", (_req, res) => res.redirect("/docs"));

import { swaggerUi, swaggerSpec } from "./utils/swagger";
app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.use("/api", routes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
