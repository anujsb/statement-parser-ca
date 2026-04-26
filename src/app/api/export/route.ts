import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { transactions } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";

type ExportFormat = "tally_xml" | "brs_csv" | "gst_json" | "clean_csv" | "tally_push";

interface TxRow {
    date: string | null;
    description: string | null;
    debit: string | null;
    credit: string | null;
    balance: string | null;
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

// Tally XML needs YYYYMMDD
function toTallyXMLDate(d: string | null): string {
    if (!d) return "20240101";
    const clean = d.replace(/-/g, "");
    if (/^\d{8}$/.test(clean)) return clean;
    try {
        const dt = new Date(d);
        if (!isNaN(dt.getTime()))
            return dt.getFullYear().toString() +
                String(dt.getMonth() + 1).padStart(2, "0") +
                String(dt.getDate()).padStart(2, "0");
    } catch { /**/ }
    return "20240101";
}

// BRS CSV needs DD-MM-YYYY (exactly what TallyPrime BRS import expects)
function toBRSDate(d: string | null): string {
    if (!d) return "";
    try {
        const dt = new Date(d);
        if (!isNaN(dt.getTime()))
            return String(dt.getDate()).padStart(2, "0") + "-" +
                String(dt.getMonth() + 1).padStart(2, "0") + "-" +
                dt.getFullYear().toString();
    } catch { /**/ }
    return d;
}

function xmlEscape(s: string | null): string {
    if (!s) return "";
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;")
        .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function n(v: string | null): number {
    return v ? parseFloat(v) || 0 : 0;
}

// ─── METHOD 1: Tally XML (Gateway of Tally → Import Data → Transactions) ─────
// Correct ENVELOPE structure. Each transaction = one Payment or Receipt voucher.
// Ledger names MUST match exactly what exists in user's Tally company.

function generateTallyXML(txs: TxRow[], bankLedger: string): string {
    const vouchers = txs
        .filter(tx => tx.debit || tx.credit)
        .map(tx => {
            const isDebit = n(tx.debit) > 0;
            const amt = isDebit ? n(tx.debit) : n(tx.credit);
            const vchType = isDebit ? "Payment" : "Receipt";

            // Tally double-entry:
            // Payment: Bank A/c (Cr, negative) + Expense A/c (Dr, positive)
            // Receipt: Bank A/c (Dr, positive) + Income A/c  (Cr, negative)
            const bankAmt = isDebit ? `-${amt.toFixed(2)}` : `${amt.toFixed(2)}`;
            const otherAmt = isDebit ? `${amt.toFixed(2)}` : `-${amt.toFixed(2)}`;
            const bankDeemed = isDebit ? "No" : "Yes";
            const otherDeemed = isDebit ? "Yes" : "No";
            const otherLedger = isDebit ? "Expenses Account" : "Income Account";

            return `
    <TALLYMESSAGE xmlns:UDF="TallyUDF">
      <VOUCHER VCHTYPE="${vchType}" ACTION="Create" OBJVIEW="Accounting Voucher View">
        <DATE>${toTallyXMLDate(tx.date)}</DATE>
        <NARRATION>${xmlEscape(tx.description)}</NARRATION>
        <VOUCHERTYPENAME>${vchType}</VOUCHERTYPENAME>
        <ISINVOICE>No</ISINVOICE>
        <PERSISTEDVIEW>Accounting Voucher View</PERSISTEDVIEW>
        <ALLLEDGERENTRIES.LIST>
          <LEDGERNAME>${xmlEscape(bankLedger)}</LEDGERNAME>
          <ISDEEMEDPOSITIVE>${bankDeemed}</ISDEEMEDPOSITIVE>
          <AMOUNT>${bankAmt}</AMOUNT>
        </ALLLEDGERENTRIES.LIST>
        <ALLLEDGERENTRIES.LIST>
          <LEDGERNAME>${xmlEscape(otherLedger)}</LEDGERNAME>
          <ISDEEMEDPOSITIVE>${otherDeemed}</ISDEEMEDPOSITIVE>
          <AMOUNT>${otherAmt}</AMOUNT>
        </ALLLEDGERENTRIES.LIST>
      </VOUCHER>
    </TALLYMESSAGE>`;
        }).join("\n");

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
          <SVCURRENTCOMPANY></SVCURRENTCOMPANY>
        </STATICVARIABLES>
      </REQUESTDESC>
      <REQUESTDATA>${vouchers}
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;
}

// ─── METHOD 2: BRS CSV (Banking → Bank Reconciliation → Alt+I Import) ─────────
// This is the BEST method for CAs — Tally imports this AND auto-reconciles.
// TallyPrime BRS import expects exact column names and DD-MM-YYYY dates.
// Columns: Transaction Date, Narration, Cheque/Ref No., Withdrawal, Deposit, Balance

function generateBRSCSV(txs: TxRow[]): string {
    const header = "Transaction Date,Narration,Cheque/Ref No.,Withdrawal Amt.,Deposit Amt.,Closing Balance";
    const rows = txs
        .filter(tx => tx.debit || tx.credit)
        .map(tx => {
            // Extract ref number from narration if present (UPI, NEFT, IMPS refs)
            const desc = tx.description ?? "";
            const refMatch = desc.match(/\b([A-Z0-9]{8,})\b/);
            const ref = refMatch ? refMatch[1] : "";
            const narr = desc.replace(/,/g, " ").replace(/"/g, "'").trim();
            const withdrawal = n(tx.debit) > 0 ? n(tx.debit).toFixed(2) : "";
            const deposit = n(tx.credit) > 0 ? n(tx.credit).toFixed(2) : "";
            const balance = n(tx.balance) > 0 ? n(tx.balance).toFixed(2) : "";
            return `${toBRSDate(tx.date)},"${narr}",${ref},${withdrawal},${deposit},${balance}`;
        });
    return [header, ...rows].join("\n");
}

// ─── METHOD 3: HTTP Push to Tally (POST to localhost:9000) ────────────────────
// Tally must be running. We send the same XML envelope directly to Tally's
// built-in HTTP server. Vouchers appear instantly, no file download needed.
// This endpoint is called from the browser — we proxy it through Next.js
// because browsers can't directly POST to localhost from a different origin.
// User provides their Tally IP (usually 127.0.0.1 or LAN IP) + port (9000).

async function pushToTally(
    txs: TxRow[],
    bankLedger: string,
    tallyHost: string,
    tallyPort: number
): Promise<{ success: boolean; message: string; vouchersCreated: number }> {
    const xml = generateTallyXML(txs, bankLedger);
    const url = `http://${tallyHost}:${tallyPort}`;

    const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/xml" },
        body: xml,
        signal: AbortSignal.timeout(15000), // 15s timeout
    });

    if (!response.ok) {
        throw new Error(`Tally returned HTTP ${response.status}. Is Tally open and running?`);
    }

    const responseText = await response.text();

    // Tally responds with XML. Check for CREATED or ALTERED in the response.
    const createdMatch = responseText.match(/<CREATED>(\d+)<\/CREATED>/);
    const alteredMatch = responseText.match(/<ALTERED>(\d+)<\/ALTERED>/);
    const errMatch = responseText.match(/<LINEERROR>([^<]+)<\/LINEERROR>/);

    if (errMatch) {
        throw new Error(`Tally error: ${errMatch[1]}`);
    }

    const created = createdMatch ? parseInt(createdMatch[1]) : 0;
    const altered = alteredMatch ? parseInt(alteredMatch[1]) : 0;
    const total = created + altered;

    return {
        success: true,
        message: `${created} vouchers created, ${altered} updated in Tally.`,
        vouchersCreated: total,
    };
}

// ─── GST JSON ─────────────────────────────────────────────────────────────────

function generateGSTJSON(txs: TxRow[], fileName: string) {
    const creditEntries = txs.filter(tx => n(tx.credit) > 0);
    const invoices = creditEntries.map((tx, i) => {
        const val = n(tx.credit);
        const taxableVal = parseFloat((val / 1.18).toFixed(2));
        const gstAmt = parseFloat((taxableVal * 0.09).toFixed(2));
        return {
            inum: `INV-${String(i + 1).padStart(4, "0")}`,
            idt: toBRSDate(tx.date),
            val,
            pos: "27",
            rchrg: "N",
            inv_typ: "R",
            itms: [{ num: 1, itm_det: { txval: taxableVal, rt: 18, iamt: 0, camt: gstAmt, samt: gstAmt, csamt: 0 } }],
        };
    });
    return {
        gstin: "ENTER_YOUR_GSTIN",
        fp: new Date().toISOString().slice(0, 7).replace("-", ""),
        version: "GST3.0.4",
        b2b: [{ ctin: "ENTER_PARTY_GSTIN", inv: invoices }],
        _meta: {
            note: "Update gstin, ctin, pos (state code), and tax rates before filing.",
            source_file: fileName,
            total_invoices: invoices.length,
            generated_at: new Date().toISOString(),
        },
    };
}

// ─── Clean CSV ────────────────────────────────────────────────────────────────

function generateCleanCSV(txs: TxRow[]): string {
    const header = "Date,Description,Debit,Credit,Balance";
    const rows = txs.map(tx => {
        const esc = (v: string | null) => {
            if (!v) return "";
            return v.includes(",") || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v;
        };
        return [esc(toBRSDate(tx.date)), esc(tx.description), esc(tx.debit), esc(tx.credit), esc(tx.balance)].join(",");
    });
    return [header, ...rows].join("\n");
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
    try {
        const body = await req.json() as {
            jobId: string;
            format: ExportFormat;
            bankName?: string;
            fileName?: string;
            tallyHost?: string;
            tallyPort?: number;
        };

        const {
            jobId,
            format,
            bankName = "Bank Account",
            fileName = "export",
            tallyHost = "127.0.0.1",
            tallyPort = 9000,
        } = body;

        if (!jobId || !format)
            return NextResponse.json({ error: "jobId and format required" }, { status: 400 });

        const txs = await db
            .select()
            .from(transactions)
            .where(eq(transactions.jobId, jobId))
            .orderBy(asc(transactions.rowIndex));

        if (!txs.length)
            return NextResponse.json({ error: "No transactions found" }, { status: 404 });

        const rows: TxRow[] = txs.map(t => ({
            date: t.date,
            description: t.description,
            debit: t.debit,
            credit: t.credit,
            balance: t.balance,
        }));

        const base = fileName.replace(/\.[^.]+$/, "");

        // ── Tally HTTP Push (no file download — returns JSON result) ──
        if (format === "tally_push") {
            const result = await pushToTally(rows, bankName, tallyHost, tallyPort);
            return NextResponse.json(result);
        }

        // ── File downloads ──
        if (format === "tally_xml") {
            return new NextResponse(generateTallyXML(rows, bankName), {
                headers: {
                    "Content-Type": "application/xml; charset=utf-8",
                    "Content-Disposition": `attachment; filename="${base}_tally.xml"`,
                },
            });
        }

        if (format === "brs_csv") {
            return new NextResponse(generateBRSCSV(rows), {
                headers: {
                    "Content-Type": "text/csv; charset=utf-8",
                    "Content-Disposition": `attachment; filename="${base}_brs.csv"`,
                },
            });
        }

        if (format === "gst_json") {
            return new NextResponse(JSON.stringify(generateGSTJSON(rows, fileName), null, 2), {
                headers: {
                    "Content-Type": "application/json; charset=utf-8",
                    "Content-Disposition": `attachment; filename="${base}_gst.json"`,
                },
            });
        }

        if (format === "clean_csv") {
            return new NextResponse(generateCleanCSV(rows), {
                headers: {
                    "Content-Type": "text/csv; charset=utf-8",
                    "Content-Disposition": `attachment; filename="${base}_clean.csv"`,
                },
            });
        }

        return NextResponse.json({ error: "Invalid format" }, { status: 400 });

    } catch (err) {
        console.error("[export] error:", err);
        const msg = err instanceof Error ? err.message : "Export failed";
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}