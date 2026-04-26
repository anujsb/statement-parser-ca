import type { Config } from "drizzle-kit";
import * as dotenv from "dotenv";
import * as path from "path";

// drizzle-kit doesn't auto-load .env.local like Next.js does
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL not found. Check your .env.local file.");
}

export default {
    schema: "./src/lib/db/schema.ts",
    out: "./drizzle",
    dialect: "postgresql",
    dbCredentials: {
        url: process.env.DATABASE_URL,
    },
} satisfies Config;