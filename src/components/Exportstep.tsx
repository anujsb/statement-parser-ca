"use client";

import { useState, useEffect } from "react";

type ExportFormat = "tally_xml" | "brs_csv" | "gst_json" | "clean_csv";

interface Props {
    jobId: string;
    fileName: string;
    rowCount: number;
    onReset: () => void;
}

function Spinner({ size = 14 }: { size?: number }) {
    return (
        <span style={{
            display: "inline-block", width: size, height: size,
            border: "2px solid currentColor", borderTopColor: "transparent",
            borderRadius: "50%", animation: "spin 0.7s linear infinite",
        }} />
    );
}

// ─── Fetch ledger list directly from Tally (browser → localhost:9000) ─────────
// This runs in the browser, so localhost = user's machine = where Tally is running
async function fetchTallyLedgers(host: string, port: string): Promise<string[]> {
    const xml = `<ENVELOPE>
  <HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER>
  <BODY>
    <EXPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>List of Accounts</REPORTNAME>
        <STATICVARIABLES>
          <ACCOUNTTYPE>Ledgers</ACCOUNTTYPE>
        </STATICVARIABLES>
      </REQUESTDESC>
    </EXPORTDATA>
  </BODY>
</ENVELOPE>`;

    const res = await fetch(`http://${host}:${port}`, {
        method: "POST",
        headers: { "Content-Type": "application/xml" },
        body: xml,
    });

    const text = await res.text();
    // Parse ledger names from Tally XML response
    const matches = text.matchAll(/<NAME\.LIST>\s*<NAME>([^<]+)<\/NAME>/gi);
    const ledgers: string[] = [];
    for (const m of matches) {
        const name = m[1].trim();
        if (name) ledgers.push(name);
    }
    // Deduplicate
    return [...new Set(ledgers)].sort();
}

// ─── Push XML directly from browser to Tally ─────────────────────────────────
async function pushXMLToTally(xml: string, host: string, port: string): Promise<string> {
    const res = await fetch(`http://${host}:${port}`, {
        method: "POST",
        headers: { "Content-Type": "application/xml" },
        body: xml,
    });

    if (!res.ok) throw new Error(`Tally returned HTTP ${res.status}`);
    const text = await res.text();

    const created = text.match(/<CREATED>(\d+)<\/CREATED>/)?.[1] ?? "0";
    const altered = text.match(/<ALTERED>(\d+)<\/ALTERED>/)?.[1] ?? "0";
    const error = text.match(/<LINEERROR>([^<]+)<\/LINEERROR>/)?.[1];

    if (error) throw new Error(`Tally error: ${error}`);
    return `${created} vouchers created, ${altered} updated in Tally.`;
}

// ─── Build correct Tally XML with real ledger names ───────────────────────────
function buildTallyXML(
    transactions: { date: string | null; description: string | null; debit: string | null; credit: string | null }[],
    bankLedger: string,
    expenseLedger: string,
    incomeLedger: string
): string {
    function toTallyDate(d: string | null): string {
        if (!d) return "20240101";
        const clean = d.replace(/-/g, "");
        if (/^\d{8}$/.test(clean)) return clean;
        try {
            const dt = new Date(d);
            if (!isNaN(dt.getTime()))
                return dt.getFullYear() + String(dt.getMonth() + 1).padStart(2, "0") + String(dt.getDate()).padStart(2, "0");
        } catch { /**/ }
        return "20240101";
    }

    function xmlEsc(s: string | null): string {
        if (!s) return "";
        return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }

    const vouchers = transactions
        .filter(tx => tx.debit || tx.credit)
        .map(tx => {
            const isDebit = parseFloat(tx.debit ?? "0") > 0;
            const amt = isDebit ? parseFloat(tx.debit!) : parseFloat(tx.credit!);
            const vchType = isDebit ? "Payment" : "Receipt";
            const otherLedger = isDebit ? expenseLedger : incomeLedger;

            // Double-entry: bank + contra ledger
            // Payment: Bank Cr (-amt), Expense Dr (+amt)
            // Receipt: Bank Dr (+amt), Income Cr (-amt)
            const bankAmt = isDebit ? `-${amt.toFixed(2)}` : `${amt.toFixed(2)}`;
            const otherAmt = isDebit ? `${amt.toFixed(2)}` : `-${amt.toFixed(2)}`;
            const bankDeemed = isDebit ? "No" : "Yes";
            const otherDeemed = isDebit ? "Yes" : "No";

            return `
    <TALLYMESSAGE xmlns:UDF="TallyUDF">
      <VOUCHER VCHTYPE="${vchType}" ACTION="Create" OBJVIEW="Accounting Voucher View">
        <DATE>${toTallyDate(tx.date)}</DATE>
        <NARRATION>${xmlEsc(tx.description)}</NARRATION>
        <VOUCHERTYPENAME>${vchType}</VOUCHERTYPENAME>
        <ISINVOICE>No</ISINVOICE>
        <PERSISTEDVIEW>Accounting Voucher View</PERSISTEDVIEW>
        <ALLLEDGERENTRIES.LIST>
          <LEDGERNAME>${xmlEsc(bankLedger)}</LEDGERNAME>
          <ISDEEMEDPOSITIVE>${bankDeemed}</ISDEEMEDPOSITIVE>
          <AMOUNT>${bankAmt}</AMOUNT>
        </ALLLEDGERENTRIES.LIST>
        <ALLLEDGERENTRIES.LIST>
          <LEDGERNAME>${xmlEsc(otherLedger)}</LEDGERNAME>
          <ISDEEMEDPOSITIVE>${otherDeemed}</ISDEEMEDPOSITIVE>
          <AMOUNT>${otherAmt}</AMOUNT>
        </ALLLEDGERENTRIES.LIST>
      </VOUCHER>
    </TALLYMESSAGE>`;
        }).join("\n");

    return `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
  <HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Vouchers</REPORTNAME>
        <STATICVARIABLES><SVCURRENTCOMPANY></SVCURRENTCOMPANY></STATICVARIABLES>
      </REQUESTDESC>
      <REQUESTDATA>${vouchers}
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ExportStep({ jobId, fileName, rowCount, onReset }: Props) {
    const [tallyHost, setTallyHost] = useState("127.0.0.1");
    const [tallyPort, setTallyPort] = useState("9000");

    // Ledger state
    const [ledgers, setLedgers] = useState<string[]>([]);
    const [ledgerStatus, setLedgerStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
    const [ledgerError, setLedgerError] = useState<string | null>(null);
    const [bankLedger, setBankLedger] = useState("");
    const [expenseLedger, setExpenseLedger] = useState("");
    const [incomeLedger, setIncomeLedger] = useState("");

    // Push state
    const [pushStatus, setPushStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
    const [pushMessage, setPushMessage] = useState<string | null>(null);

    // File download state
    const [downloading, setDownloading] = useState<ExportFormat | null>(null);
    const [done, setDone] = useState<ExportFormat[]>([]);

    // Transactions cache for browser-side push
    const [txCache, setTxCache] = useState<{ date: string | null; description: string | null; debit: string | null; credit: string | null }[]>([]);

    // Fetch transactions once on mount (needed for browser-side push)
    useEffect(() => {
        fetch(`/api/jobs/${jobId}`)
            .then(r => r.json())
            .then(d => setTxCache(d.transactions ?? []))
            .catch(() => { });
    }, [jobId]);

    // ── Connect to Tally and fetch real ledgers ──
    const connectTally = async () => {
        setLedgerStatus("loading");
        setLedgerError(null);
        try {
            const list = await fetchTallyLedgers(tallyHost, tallyPort);
            if (list.length === 0) throw new Error("No ledgers found. Is the right company open in Tally?");
            setLedgers(list);
            setLedgerStatus("done");
            // Auto-select common ledger names if present
            const findLedger = (...names: string[]) =>
                list.find(l => names.some(n => l.toLowerCase().includes(n.toLowerCase()))) ?? "";
            setBankLedger(findLedger("hdfc", "sbi", "icici", "axis", "kotak", "bank", "current", "savings"));
            setExpenseLedger(findLedger("expense", "indirect expense", "purchases", "sundry"));
            setIncomeLedger(findLedger("income", "sales", "revenue", "indirect income"));
        } catch (err) {
            setLedgerStatus("error");
            setLedgerError(err instanceof Error ? err.message : "Could not connect to Tally");
        }
    };

    // ── Push to Tally (browser → localhost, no server involved) ──
    const pushToTally = async () => {
        if (!bankLedger || !expenseLedger || !incomeLedger) {
            alert("Select all three ledgers before pushing.");
            return;
        }
        setPushStatus("loading");
        setPushMessage(null);
        try {
            const xml = buildTallyXML(txCache, bankLedger, expenseLedger, incomeLedger);
            const msg = await pushXMLToTally(xml, tallyHost, tallyPort);
            setPushStatus("done");
            setPushMessage(msg);
        } catch (err) {
            setPushStatus("error");
            setPushMessage(err instanceof Error ? err.message : "Push failed");
        }
    };

    // ── File downloads (via server) ──
    const downloadFile = async (format: ExportFormat) => {
        setDownloading(format);
        try {
            const res = await fetch("/api/export", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ jobId, format, bankName: bankLedger || "Bank Account", fileName }),
            });
            if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            const cd = res.headers.get("content-disposition") ?? "";
            a.download = cd.split('filename="')[1]?.replace('"', "") ?? "export";
            a.click();
            URL.revokeObjectURL(url);
            setDone(prev => [...prev, format]);
        } catch (err) {
            alert(err instanceof Error ? err.message : "Download failed");
        } finally {
            setDownloading(null);
        }
    };

    const isDone = (f: ExportFormat) => done.includes(f);
    const isLoading = (f: ExportFormat) => downloading === f;

    const LedgerSelect = ({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) => (
        <div style={{ flex: 1, minWidth: 180 }}>
            <p style={{ fontSize: 10, color: "var(--text-tertiary)", marginBottom: 4, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</p>
            <select value={value} onChange={e => onChange(e.target.value)} style={{ width: "100%", padding: "7px 10px", fontSize: 13, borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text-primary)", fontFamily: "var(--font-sans)" }}>
                <option value="">— select ledger —</option>
                {ledgers.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
        </div>
    );

    return (
        <div className="animate-fade-up">

            {/* Success banner */}
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 28, padding: "14px 18px", background: "var(--success-bg)", border: "1px solid #bbf7d0", borderRadius: "var(--radius-lg)" }}>
                <div style={{ width: 34, height: 34, borderRadius: "50%", background: "var(--success)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 15, flexShrink: 0 }}>✓</div>
                <div>
                    <p style={{ fontWeight: 500, color: "var(--success)", fontSize: 14 }}>{rowCount} transactions extracted</p>
                    <p style={{ fontSize: 12, color: "#15803d", marginTop: 2 }}>{fileName}</p>
                </div>
            </div>

            {/* ═══ TALLY PUSH SECTION ═══ */}
            <p className="label" style={{ marginBottom: 10 }}>Push directly to Tally</p>
            <div className="card" style={{ padding: "20px", marginBottom: 24, border: "1.5px solid var(--accent)", background: "var(--accent-bg)" }}>

                {/* Step 1 — Tally connection */}
                <div style={{ marginBottom: 16 }}>
                    <p style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Step 1 — Connect to Tally</p>
                    <p style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 10, lineHeight: 1.6 }}>
                        Tally must be open. Enable HTTP server once: <strong style={{ fontWeight: 500 }}>Tally → F12 → Advanced Config → Enable ODBC Server → Yes</strong>
                    </p>
                    <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
                        <div>
                            <p style={{ fontSize: 10, color: "var(--text-tertiary)", marginBottom: 4 }}>Tally IP</p>
                            <input type="text" value={tallyHost} onChange={e => setTallyHost(e.target.value)} placeholder="127.0.0.1" style={{ width: 130 }} />
                        </div>
                        <div>
                            <p style={{ fontSize: 10, color: "var(--text-tertiary)", marginBottom: 4 }}>Port</p>
                            <input type="text" value={tallyPort} onChange={e => setTallyPort(e.target.value)} placeholder="9000" style={{ width: 72 }} />
                        </div>
                        <button className="btn-primary" onClick={connectTally} disabled={ledgerStatus === "loading"}
                            style={{ padding: "9px 18px", fontSize: 13 }}>
                            {ledgerStatus === "loading" ? <><Spinner /> Connecting…</> : ledgerStatus === "done" ? "↻ Reconnect" : "Connect to Tally"}
                        </button>
                    </div>
                    {ledgerStatus === "error" && (
                        <div style={{ marginTop: 10, padding: "8px 12px", background: "var(--danger-bg)", borderRadius: "var(--radius-sm)", fontSize: 12, color: "var(--danger)", lineHeight: 1.6 }}>
                            ✗ {ledgerError}
                            <br /><span style={{ fontSize: 11, opacity: 0.85 }}>Is Tally open? Is ODBC/HTTP server enabled?</span>
                        </div>
                    )}
                    {ledgerStatus === "done" && (
                        <div style={{ marginTop: 8, padding: "6px 10px", background: "var(--success-bg)", borderRadius: "var(--radius-sm)", fontSize: 12, color: "var(--success)" }}>
                            ✓ Connected — {ledgers.length} ledgers loaded from Tally
                        </div>
                    )}
                </div>

                {/* Step 2 — Map ledgers (only shown after connect) */}
                {ledgerStatus === "done" && (
                    <div style={{ borderTop: "1px solid var(--border)", paddingTop: 16, marginBottom: 16 }}>
                        <p style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Step 2 — Map ledgers</p>
                        <p style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 12, lineHeight: 1.6 }}>
                            Select ledgers from your actual Tally company. These are fetched live — no typos, no exceptions.
                        </p>
                        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                            <LedgerSelect label="Bank ledger (your bank A/c)" value={bankLedger} onChange={setBankLedger} />
                            <LedgerSelect label="Expense ledger (for debits)" value={expenseLedger} onChange={setExpenseLedger} />
                            <LedgerSelect label="Income ledger (for credits)" value={incomeLedger} onChange={setIncomeLedger} />
                        </div>
                    </div>
                )}

                {/* Step 3 — Push */}
                {ledgerStatus === "done" && (
                    <div style={{ borderTop: "1px solid var(--border)", paddingTop: 16 }}>
                        <p style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Step 3 — Push vouchers</p>
                        <p style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 12 }}>
                            Sends all {rowCount} transactions directly into Tally. Vouchers appear instantly in Day Book.
                        </p>
                        <button className="btn-primary" onClick={pushToTally}
                            disabled={pushStatus === "loading" || !bankLedger || !expenseLedger || !incomeLedger}
                            style={{ fontSize: 14, padding: "11px 28px" }}>
                            {pushStatus === "loading" ? <><Spinner size={14} /> Pushing {rowCount} vouchers…</> :
                                pushStatus === "done" ? "✓ Push again" : `→ Push ${rowCount} vouchers to Tally`}
                        </button>
                        {pushStatus === "done" && pushMessage && (
                            <div style={{ marginTop: 12, padding: "10px 14px", background: "var(--success-bg)", border: "1px solid #bbf7d0", borderRadius: "var(--radius-md)", fontSize: 13, color: "var(--success)", fontWeight: 500 }}>
                                ✓ {pushMessage}
                                <p style={{ fontSize: 11, fontWeight: 400, marginTop: 4, color: "#15803d" }}>Check Gateway of Tally → Day Book to verify.</p>
                            </div>
                        )}
                        {pushStatus === "error" && pushMessage && (
                            <div style={{ marginTop: 12, padding: "10px 14px", background: "var(--danger-bg)", borderRadius: "var(--radius-md)", fontSize: 12, color: "var(--danger)", lineHeight: 1.6 }}>
                                ✗ {pushMessage}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* ═══ FILE DOWNLOADS ═══ */}
            <p className="label" style={{ marginBottom: 10 }}>Download files</p>

            {/* BRS CSV */}
            <div className="card" style={{ padding: "16px 20px", marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
                    <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                            <span style={{ fontWeight: 500, fontSize: 14 }}>BRS CSV</span>
                            <span className="badge badge-neutral">Bank Reconciliation import</span>
                            {isDone("brs_csv") && <span className="badge badge-success">Downloaded</span>}
                        </div>
                        <p style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: 8 }}>
                            Alternative to HTTP push. Import via Banking → Bank Reconciliation → Alt+I. Creates vouchers and auto-reconciles in one step.
                        </p>
                        <div style={{ padding: "8px 10px", background: "var(--bg-subtle)", borderRadius: "var(--radius-sm)", fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--text-secondary)", lineHeight: 1.9 }}>
                            Banking → Bank Reconciliation → select bank → Alt+I → select this CSV ✓
                        </div>
                    </div>
                    <button className="btn-ghost" onClick={() => downloadFile("brs_csv")} disabled={isLoading("brs_csv")} style={{ flexShrink: 0, minWidth: 120 }}>
                        {isLoading("brs_csv") ? <><Spinner /> …</> : isDone("brs_csv") ? "↓ Again" : "↓ Download"}
                    </button>
                </div>
            </div>

            {/* Tally XML */}
            <div className="card" style={{ padding: "16px 20px", marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
                    <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                            <span style={{ fontWeight: 500, fontSize: 14 }}>Tally XML</span>
                            <span className="badge badge-neutral">Import Data</span>
                            {isDone("tally_xml") && <span className="badge badge-success">Downloaded</span>}
                        </div>
                        <p style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6 }}>
                            Standard voucher XML. Use HTTP Push above for best results — it uses real ledger names from Tally eliminating all import exceptions.
                        </p>
                    </div>
                    <button className="btn-ghost" onClick={() => downloadFile("tally_xml")} disabled={isLoading("tally_xml")} style={{ flexShrink: 0, minWidth: 120 }}>
                        {isLoading("tally_xml") ? <><Spinner /> …</> : isDone("tally_xml") ? "↓ Again" : "↓ Download"}
                    </button>
                </div>
            </div>

            {/* GST + CSV */}
            {([
                { id: "gst_json" as ExportFormat, label: "GST JSON", badge: "GSTR-1", desc: "JSON for the GST portal. Update your GSTIN before filing." },
                { id: "clean_csv" as ExportFormat, label: "Clean CSV", desc: "Normalized spreadsheet: Date, Description, Debit, Credit, Balance." },
            ]).map(fmt => (
                <div key={fmt.id} className="card" style={{ padding: "14px 18px", marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                    <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontWeight: 500, fontSize: 14 }}>{fmt.label}</span>
                            {fmt.badge && <span className="badge badge-neutral">{fmt.badge}</span>}
                            {isDone(fmt.id) && <span className="badge badge-success">Downloaded</span>}
                        </div>
                        <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 3 }}>{fmt.desc}</p>
                    </div>
                    <button className="btn-ghost" onClick={() => downloadFile(fmt.id)} disabled={isLoading(fmt.id)} style={{ flexShrink: 0, minWidth: 120 }}>
                        {isLoading(fmt.id) ? <><Spinner /> …</> : isDone(fmt.id) ? "↓ Again" : "↓ Download"}
                    </button>
                </div>
            ))}

            <div style={{ textAlign: "center", marginTop: 24 }}>
                <button className="btn-ghost" onClick={onReset}>← Process another file</button>
            </div>
        </div>
    );
}