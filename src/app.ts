import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { config } from "./config";
import { logger } from "./utils/logger";
import { withRequestContext } from "./utils/request-context";
import { errorHandler, notFoundHandler } from "./middlewares/error-handler";
import routes from "./routes";

type RequestWithRawBody = express.Request & { rawBody?: Buffer };

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

app.use(withRequestContext);

// e.g. "PATCH /api/v1/client/verification-requests/abc -> 400 (85 bytes, 3.1 ms)"
app.use(
  morgan(":method :url -> :status (:res[content-length] bytes, :response-time ms)", {
    stream: { write: (message) => logger.http(message.trim()) },
  }),
);

app.use(
  express.json({
    verify: (req, _res, buffer) => {
      (req as RequestWithRawBody).rawBody = buffer;
    },
  }),
);
app.use(express.urlencoded({ extended: true }));

app.get("/", (_req, res) => res.redirect("/docs"));

import { swaggerUi, swaggerSpec } from "./utils/swagger";
app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.use("/api", routes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
