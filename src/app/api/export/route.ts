import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { transactions } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";

type ExportFormat = "tally_xml" | "gst_json" | "csv";

interface TxRow {
    date: string | null;
    description: string | null;
    debit: string | null;
    credit: string | null;
    balance: string | null;
}

// ─── Tally XML ────────────────────────────────────────────────────────────────

function formatTallyDate(dateStr: string | null): string {
    if (!dateStr) return "20240101";
    return dateStr.replace(/-/g, "");
}

function generateTallyXML(txs: TxRow[], bankName: string): string {
    const vouchers = txs
        .map((tx) => {
            const amount = tx.debit ? `-${tx.debit}` : tx.credit ? tx.credit : "0";
            const vchType = tx.debit ? "Payment" : "Receipt";
            const ledger = tx.debit ? "Bank Account" : "Bank Account";
            return `
    <TALLYMESSAGE xmlns:UDF="TallyUDF">
      <VOUCHER VCHTYPE="${vchType}" ACTION="Create">
        <DATE>${formatTallyDate(tx.date)}</DATE>
        <NARRATION>${(tx.description ?? "").replace(/[<>&"']/g, " ")}</NARRATION>
        <VOUCHERTYPENAME>${vchType}</VOUCHERTYPENAME>
        <ALLLEDGERENTRIES.LIST>
          <LEDGERNAME>${bankName}</LEDGERNAME>
          <ISDEEMEDPOSITIVE>${tx.credit ? "Yes" : "No"}</ISDEEMEDPOSITIVE>
          <AMOUNT>${tx.credit ? `-${tx.credit}` : amount}</AMOUNT>
        </ALLLEDGERENTRIES.LIST>
        <ALLLEDGERENTRIES.LIST>
          <LEDGERNAME>${vchType === "Payment" ? "Expenses Account" : "Income Account"}</LEDGERNAME>
          <ISDEEMEDPOSITIVE>${tx.credit ? "No" : "Yes"}</ISDEEMEDPOSITIVE>
          <AMOUNT>${tx.credit ? tx.credit : tx.debit ?? "0"}</AMOUNT>
        </ALLLEDGERENTRIES.LIST>
      </VOUCHER>
    </TALLYMESSAGE>`;
        })
        .join("");

    return `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Vouchers</REPORTNAME>
        <STATICVARIABLES>
          <SVCURRENTCOMPANY>$$SVCurrentCompany</SVCURRENTCOMPANY>
        </STATICVARIABLES>
      </REQUESTDESC>
      <REQUESTDATA>${vouchers}
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;
}

// ─── GST JSON (GSTR-1 B2B simplified) ────────────────────────────────────────

function generateGSTJSON(txs: TxRow[], fileName: string) {
    const invoices = txs
        .filter((tx) => tx.credit) // only income/sales entries
        .map((tx, i) => ({
            inum: `INV-${String(i + 1).padStart(4, "0")}`,
            idt: tx.date ?? "",
            val: parseFloat(tx.credit ?? "0"),
            pos: "27", // default: Maharashtra
            rchrg: "N",
            inv_typ: "R",
            itms: [
                {
                    num: 1,
                    itm_det: {
                        txval: parseFloat((parseFloat(tx.credit ?? "0") / 1.18).toFixed(2)),
                        rt: 18,
                        iamt: 0,
                        camt: parseFloat(((parseFloat(tx.credit ?? "0") / 1.18) * 0.09).toFixed(2)),
                        samt: parseFloat(((parseFloat(tx.credit ?? "0") / 1.18) * 0.09).toFixed(2)),
                        csamt: 0,
                    },
                },
            ],
        }));

    return {
        gstin: "YOUR_GSTIN",
        fp: new Date().toISOString().slice(0, 7).replace("-", ""),
        version: "GST3.0.4",
        hash: "hash",
        b2b: [
            {
                ctin: "29AAACP2715A1ZA",
                inv: invoices,
            },
        ],
        _meta: {
            generated_by: "CA Tool",
            source_file: fileName,
            total_invoices: invoices.length,
            note: "Review and update GSTIN, state code, and tax rates before filing.",
        },
    };
}

// ─── Clean CSV ────────────────────────────────────────────────────────────────

function generateCSV(txs: TxRow[]): string {
    const header = "Date,Description,Debit,Credit,Balance";
    const rows = txs.map((tx) => {
        const esc = (v: string | null) => {
            if (!v) return "";
            const s = String(v);
            return s.includes(",") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
        };
        return [esc(tx.date), esc(tx.description), esc(tx.debit), esc(tx.credit), esc(tx.balance)].join(",");
    });
    return [header, ...rows].join("\n");
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
    try {
        const { jobId, format, bankName = "Bank Account", fileName = "export" } = await req.json() as {
            jobId: string;
            format: ExportFormat;
            bankName?: string;
            fileName?: string;
        };

        if (!jobId || !format) {
            return NextResponse.json({ error: "jobId and format required" }, { status: 400 });
        }

        const txs = await db
            .select()
            .from(transactions)
            .where(eq(transactions.jobId, jobId))
            .orderBy(asc(transactions.rowIndex));

        if (txs.length === 0) {
            return NextResponse.json({ error: "No transactions found for this job" }, { status: 404 });
        }

        const rows: TxRow[] = txs.map((t) => ({
            date: t.date,
            description: t.description,
            debit: t.debit,
            credit: t.credit,
            balance: t.balance,
        }));

        if (format === "tally_xml") {
            const xml = generateTallyXML(rows, bankName);
            return new NextResponse(xml, {
                headers: {
                    "Content-Type": "application/xml",
                    "Content-Disposition": `attachment; filename="${fileName.replace(/\.[^.]+$/, "")}_tally.xml"`,
                },
            });
        }

        if (format === "gst_json") {
            const json = generateGSTJSON(rows, fileName);
            return new NextResponse(JSON.stringify(json, null, 2), {
                headers: {
                    "Content-Type": "application/json",
                    "Content-Disposition": `attachment; filename="${fileName.replace(/\.[^.]+$/, "")}_gst.json"`,
                },
            });
        }

        if (format === "csv") {
            const csv = generateCSV(rows);
            return new NextResponse(csv, {
                headers: {
                    "Content-Type": "text/csv",
                    "Content-Disposition": `attachment; filename="${fileName.replace(/\.[^.]+$/, "")}_clean.csv"`,
                },
            });
        }

        return NextResponse.json({ error: "Invalid format" }, { status: 400 });
    } catch (err) {
        const message = err instanceof Error ? err.message : "Export failed";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}