import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jobs, transactions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY! });

// ─── Types ────────────────────────────────────────────────────────────────────

interface RawTransaction {
    date: string | null;
    description: string | null;
    debit: string | number | null;
    credit: string | number | null;
    balance: string | number | null;
}

// ─── PDF text extraction ──────────────────────────────────────────────────────

async function extractTextFromPDF(buffer: Buffer): Promise<string> {
    // With serverExternalPackages: ["pdf-parse"] in next.config.ts,
    // pdf-parse loads as plain CJS — require() works, dynamic import does not.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require("pdf-parse");
    const data = await pdfParse(buffer);
    return data.text;
}

// ─── Excel/CSV extraction ─────────────────────────────────────────────────────

async function extractTextFromExcel(buffer: Buffer, mimeType: string): Promise<string> {
    const XLSX = await import("xlsx");
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows: string[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false });

    // Convert to TSV-like text for Groq
    return rows
        .filter((r) => r.some((c) => c !== "" && c !== null && c !== undefined))
        .map((r) => r.join("\t"))
        .join("\n");
}

// ─── Groq extraction ──────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an expert Indian bank statement parser.

Your job: extract ALL financial transactions from the raw text below and return ONLY a valid JSON array.

Rules:
- Return ONLY the JSON array. No explanation, no markdown, no code blocks.
- Each transaction object must have exactly these keys: date, description, debit, credit, balance
- date: string in YYYY-MM-DD format. If year is missing, infer from context. If completely unclear, use null.
- description: cleaned narration text (remove excess whitespace, keep meaningful info like UPI/NEFT/IMPS refs)
- debit: number (positive) if money left the account, else null
- credit: number (positive) if money entered the account, else null  
- balance: running balance as number, else null
- All amounts: plain numbers only. No commas, no ₹, no currency symbols.
- If a row is clearly a header, summary, or opening/closing balance line — skip it.
- Extract every single transaction row. Do NOT summarise or skip.

Example output format:
[
  {"date":"2024-01-15","description":"UPI/PAYMENT/ZOMATO/9876543210","debit":320,"credit":null,"balance":45230.50},
  {"date":"2024-01-16","description":"NEFT CR/HDFC0001234/SALARY JAN","debit":null,"credit":85000,"balance":130230.50}
]`;

async function extractTransactionsWithGroq(rawText: string): Promise<RawTransaction[]> {
    // Truncate to ~100k chars to stay within context (still huge for any statement)
    const truncated = rawText.slice(0, 100000);

    const completion = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        temperature: 0,
        max_tokens: 8000,
        messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: `Extract all transactions from this bank statement:\n\n${truncated}` },
        ],
    });

    const raw = completion.choices[0]?.message?.content?.trim() ?? "";

    // Strip any accidental markdown fences
    const cleaned = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();

    try {
        const parsed = JSON.parse(cleaned);
        if (!Array.isArray(parsed)) throw new Error("Not an array");
        return parsed as RawTransaction[];
    } catch {
        throw new Error(`Groq returned invalid JSON. Raw response: ${raw.slice(0, 300)}`);
    }
}

// ─── Normalise amounts ────────────────────────────────────────────────────────

function toNumericString(val: string | number | null | undefined): string | null {
    if (val === null || val === undefined || val === "") return null;
    const n = parseFloat(String(val).replace(/[^0-9.-]/g, ""));
    return isNaN(n) ? null : n.toFixed(2);
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
    let jobId: string | null = null;

    try {
        const formData = await req.formData();
        const file = formData.get("file") as File | null;
        const sessionId = (formData.get("sessionId") as string) || crypto.randomUUID();

        if (!file) {
            return NextResponse.json({ error: "No file provided" }, { status: 400 });
        }

        // Detect type
        const name = file.name.toLowerCase();
        const isCSV = name.endsWith(".csv") || file.type === "text/csv";
        const isXLSX = name.endsWith(".xlsx") || name.endsWith(".xls");
        const isPDF = name.endsWith(".pdf") || file.type === "application/pdf";

        if (!isPDF && !isXLSX && !isCSV) {
            return NextResponse.json({ error: "Unsupported file type. Upload a PDF, XLSX, or CSV." }, { status: 400 });
        }

        const fileType = isPDF ? "pdf" : isXLSX ? "xlsx" : "csv";

        // Create job record
        const [job] = await db
            .insert(jobs)
            .values({
                sessionId,
                fileName: file.name,
                fileType,
                status: "processing",
            })
            .returning();

        jobId = job.id;

        // Read file into buffer (in-memory, never written to disk)
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Extract raw text
        let rawText: string;
        if (isPDF) {
            rawText = await extractTextFromPDF(buffer);
            if (!rawText || rawText.trim().length < 50) {
                throw new Error(
                    "Could not extract text from this PDF. It may be a scanned/image-based PDF. Please upload a text-selectable PDF."
                );
            }
        } else {
            rawText = await extractTextFromExcel(buffer, file.type);
        }

        // Run through Groq
        const extracted = await extractTransactionsWithGroq(rawText);

        if (extracted.length === 0) {
            throw new Error("No transactions found. Check that the file contains transaction data.");
        }

        // Insert transactions
        const txRows = extracted.map((tx, i) => ({
            jobId: job.id,
            rowIndex: i,
            date: tx.date ?? null,
            description: tx.description ?? null,
            debit: toNumericString(tx.debit),
            credit: toNumericString(tx.credit),
            balance: toNumericString(tx.balance),
        }));

        await db.insert(transactions).values(txRows);

        // Mark job done
        await db
            .update(jobs)
            .set({ status: "done", rowCount: extracted.length, updatedAt: new Date() })
            .where(eq(jobs.id, job.id));

        return NextResponse.json({
            jobId: job.id,
            sessionId,
            rowCount: extracted.length,
            fileName: file.name,
        });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unexpected error";

        // Mark job failed if we created one
        if (jobId) {
            await db
                .update(jobs)
                .set({ status: "failed", errorMessage: message, updatedAt: new Date() })
                .where(eq(jobs.id, jobId))
                .catch(() => { });
        }

        console.error("[parse] error:", message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}