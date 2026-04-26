"use client";

import { useState } from "react";

type ExportFormat = "tally_xml" | "brs_csv" | "gst_json" | "clean_csv" | "tally_push";

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

export default function ExportStep({ jobId, fileName, rowCount, onReset }: Props) {
    const [bankName, setBankName] = useState("HDFC Bank");
    const [tallyHost, setTallyHost] = useState("127.0.0.1");
    const [tallyPort, setTallyPort] = useState("9000");
    const [downloading, setDownloading] = useState<ExportFormat | null>(null);
    const [done, setDone] = useState<ExportFormat[]>([]);
    const [pushResult, setPushResult] = useState<string | null>(null);
    const [pushError, setPushError] = useState<string | null>(null);

    const callExport = async (format: ExportFormat) => {
        setDownloading(format);
        setPushResult(null);
        setPushError(null);
        try {
            const res = await fetch("/api/export", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ jobId, format, bankName, fileName, tallyHost, tallyPort: parseInt(tallyPort) }),
            });

            if (format === "tally_push") {
                const data = await res.json();
                if (!res.ok) throw new Error(data.error);
                setPushResult(data.message);
                setDone(prev => [...prev, format]);
                return;
            }

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
            const msg = err instanceof Error ? err.message : "Failed";
            if (format === "tally_push") setPushError(msg);
            else alert(msg);
        } finally {
            setDownloading(null);
        }
    };

    const isDone = (f: ExportFormat) => done.includes(f);
    const isLoading = (f: ExportFormat) => downloading === f;

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

            {/* Bank ledger */}
            <div className="card" style={{ padding: "14px 18px", marginBottom: 20 }}>
                <p style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 6, fontWeight: 500, letterSpacing: "0.05em", textTransform: "uppercase" }}>Bank ledger name in Tally</p>
                <input type="text" value={bankName} onChange={e => setBankName(e.target.value)} placeholder="e.g. HDFC Bank" style={{ width: "100%", maxWidth: 300 }} />
                <p style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 6 }}>Must match the ledger name in your Tally company exactly.</p>
            </div>

            {/* Tally section */}
            <p className="label" style={{ marginBottom: 10 }}>Tally exports</p>

            {/* BRS CSV */}
            <div className="card" style={{ padding: "18px 20px", marginBottom: 10, border: "1.5px solid var(--accent)", background: "var(--accent-bg)" }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: 260 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                            <span style={{ fontWeight: 500, fontSize: 14 }}>BRS CSV Import</span>
                            <span className="badge badge-accent">Recommended for CAs</span>
                            {isDone("brs_csv") && <span className="badge badge-success">Downloaded</span>}
                        </div>
                        <p style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.65, marginBottom: 10 }}>
                            Best method. Tally creates vouchers <em>and</em> auto-reconciles the bank statement in one step. No ledger mapping issues.
                        </p>
                        <div style={{ padding: "10px 12px", background: "var(--bg-card)", borderRadius: "var(--radius-sm)", fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--text-secondary)", lineHeight: 2 }}>
                            Gateway of Tally → Banking → Bank Reconciliation<br />
                            → Select your bank → press <strong>Alt+I</strong><br />
                            → Select this CSV → Import → Done ✓
                        </div>
                    </div>
                    <button className="btn-primary" onClick={() => callExport("brs_csv")} disabled={isLoading("brs_csv")} style={{ flexShrink: 0, minWidth: 130 }}>
                        {isLoading("brs_csv") ? <><Spinner /> Generating…</> : isDone("brs_csv") ? "↓ Again" : "↓ Download CSV"}
                    </button>
                </div>
            </div>

            {/* Tally XML */}
            <div className="card" style={{ padding: "18px 20px", marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: 260 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                            <span style={{ fontWeight: 500, fontSize: 14 }}>Tally XML</span>
                            <span className="badge badge-neutral">Voucher import</span>
                            {isDone("tally_xml") && <span className="badge badge-success">Downloaded</span>}
                        </div>
                        <p style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.65, marginBottom: 10 }}>
                            Creates Payment/Receipt vouchers directly. Ledger names in the file must match your Tally company exactly or Tally will show Import Exceptions.
                        </p>
                        <div style={{ padding: "10px 12px", background: "var(--bg-subtle)", borderRadius: "var(--radius-sm)", fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--text-secondary)", lineHeight: 2 }}>
                            Gateway of Tally → Import Data → Transactions<br />
                            → Select this .xml file → Import ✓
                        </div>
                    </div>
                    <button className="btn-ghost" onClick={() => callExport("tally_xml")} disabled={isLoading("tally_xml")} style={{ flexShrink: 0, minWidth: 130 }}>
                        {isLoading("tally_xml") ? <><Spinner /> Generating…</> : isDone("tally_xml") ? "↓ Again" : "↓ Download XML"}
                    </button>
                </div>
            </div>

            {/* HTTP Push */}
            <div className="card" style={{ padding: "18px 20px", marginBottom: 24 }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: 260 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                            <span style={{ fontWeight: 500, fontSize: 14 }}>Push directly to Tally</span>
                            <span className="badge badge-neutral">Tally must be open</span>
                            {isDone("tally_push") && <span className="badge badge-success">Pushed</span>}
                        </div>
                        <p style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.65, marginBottom: 10 }}>
                            Sends vouchers straight into open Tally — zero manual steps. Enable once in Tally: <strong style={{ fontWeight: 500 }}>F12 → Advanced Config → Enable ODBC Server → Yes</strong>.
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
                        </div>
                        {pushResult && <div style={{ marginTop: 10, padding: "8px 12px", background: "var(--success-bg)", borderRadius: "var(--radius-sm)", fontSize: 12, color: "var(--success)" }}>✓ {pushResult}</div>}
                        {pushError && (
                            <div style={{ marginTop: 10, padding: "8px 12px", background: "var(--danger-bg)", borderRadius: "var(--radius-sm)", fontSize: 12, color: "var(--danger)", lineHeight: 1.6 }}>
                                ✗ {pushError.includes("ECONNREFUSED") || pushError.includes("fetch failed")
                                    ? "Tally is not reachable. Open Tally and enable: F12 → Advanced Config → Enable ODBC Server → Yes."
                                    : pushError}
                            </div>
                        )}
                    </div>
                    <button className="btn-ghost" onClick={() => callExport("tally_push")} disabled={isLoading("tally_push")} style={{ flexShrink: 0, minWidth: 130, alignSelf: "flex-start" }}>
                        {isLoading("tally_push") ? <><Spinner /> Pushing…</> : isDone("tally_push") ? "Push again" : "→ Push to Tally"}
                    </button>
                </div>
            </div>

            {/* Other formats */}
            <p className="label" style={{ marginBottom: 10 }}>Other formats</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 32 }}>
                {([
                    { id: "gst_json" as ExportFormat, label: "GST JSON", badge: "GSTR-1", desc: "Structured JSON for the GST portal. Update your GSTIN and tax rates before filing." },
                    { id: "clean_csv" as ExportFormat, label: "Clean CSV", desc: "Normalized spreadsheet with Date, Description, Debit, Credit, Balance columns." },
                ]).map(fmt => (
                    <div key={fmt.id} className="card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", gap: 12 }}>
                        <div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <span style={{ fontWeight: 500, fontSize: 14 }}>{fmt.label}</span>
                                {fmt.badge && <span className="badge badge-neutral">{fmt.badge}</span>}
                                {isDone(fmt.id) && <span className="badge badge-success">Downloaded</span>}
                            </div>
                            <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 3 }}>{fmt.desc}</p>
                        </div>
                        <button className="btn-ghost" onClick={() => callExport(fmt.id)} disabled={isLoading(fmt.id)} style={{ flexShrink: 0, minWidth: 120 }}>
                            {isLoading(fmt.id) ? <><Spinner /> …</> : isDone(fmt.id) ? "↓ Again" : "↓ Download"}
                        </button>
                    </div>
                ))}
            </div>

            <div style={{ textAlign: "center" }}>
                <button className="btn-ghost" onClick={onReset}>← Process another file</button>
            </div>
        </div>
    );
}