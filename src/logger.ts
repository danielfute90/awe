// Journal (logs) commun au serveur et au bot.
// En développement, les logs sont colorés et lisibles ; en production, au format JSON.
import pino from "pino";
import { config } from "./config.js";

export const log = pino({
  level: config.NODE_ENV === "test" ? "silent" : config.LOG_LEVEL,
  transport:
    config.NODE_ENV === "development"
      ? { target: "pino-pretty", options: { translateTime: "HH:MM:ss", ignore: "pid,hostname" } }
      : undefined,
});
