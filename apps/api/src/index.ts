import "dotenv/config";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { prisma } from "@stock-dashboard/database";
import { stocksRoutes } from "./routes/stocks.js";

const app = new Hono();

app.use(
  "/api/*",
  cors({
    origin: "http://localhost:3000",
  }),
);

app.get("/", (c) => {
  return c.text("Hello Hono!");
});

app.get("/health/db", async (c) => {
  try {
    const userCount = await prisma.user.count();
    return c.json({
      status: "ok",
      database: "connected",
      userCount,
    });
  } catch (error) {
    return c.json(
      {
        status: "error",
        database: "disconnected",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      500,
    );
  }
});

// Stock routes are now mounted on their final path.
app.route("/api/stocks", stocksRoutes);

serve(
  {
    fetch: app.fetch,
    port: 8080,
  },
  (info) => {
    console.log(`Server is running on http://localhost:${info.port}`);
  },
);
