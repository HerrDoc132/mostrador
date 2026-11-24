import { defineConfig } from "drizzle-kit";
import { resolverDatabaseConfig } from "./src/db/config";

// TP5-46: la misma resolución que usa la app y los scripts de seed/reset.
const { url, authToken } = resolverDatabaseConfig();

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "turso",
  dbCredentials: { url, authToken },
});
