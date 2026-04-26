import { pgTable, uuid, text, timestamp, integer, numeric, boolean, pgEnum } from "drizzle-orm/pg-core";

export const fileTypeEnum = pgEnum("file_type", ["pdf", "xlsx", "csv"]);
export const jobStatusEnum = pgEnum("job_status", ["processing", "done", "failed"]);

export const jobs = pgTable("jobs", {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: text("session_id").notNull(),
    fileName: text("file_name").notNull(),
    fileType: fileTypeEnum("file_type").notNull(),
    bankName: text("bank_name"),
    status: jobStatusEnum("status").notNull().default("processing"),
    rowCount: integer("row_count").default(0),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const transactions = pgTable("transactions", {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id")
        .notNull()
        .references(() => jobs.id, { onDelete: "cascade" }),
    rowIndex: integer("row_index").notNull(),
    date: text("date"),
    description: text("description"),
    debit: numeric("debit", { precision: 15, scale: 2 }),
    credit: numeric("credit", { precision: 15, scale: 2 }),
    balance: numeric("balance", { precision: 15, scale: 2 }),
    category: text("category"),
    edited: boolean("edited").default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;
export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;