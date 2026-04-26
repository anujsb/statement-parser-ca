import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jobs, transactions } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";

export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    const job = await db.query.jobs.findFirst({
        where: eq(jobs.id, id),
    });

    if (!job) {
        return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const txs = await db
        .select()
        .from(transactions)
        .where(eq(transactions.jobId, id))
        .orderBy(asc(transactions.rowIndex));

    return NextResponse.json({ job, transactions: txs });
}