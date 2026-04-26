"use client";

import { useState, useCallback, useRef } from "react";
import ExportStep from "@/components/Exportstep";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Transaction {
    id: string;
    rowIndex: number;
    date: string | null;
    description: string | null;
    debit: string | null;
    credit: string | null;
    balance: string | null;
    edited?: boolean;
}

interface ParseResult {
    jobId: string;
    sessionId: string;
    rowCount: number;
    fileName: string;
}

type Step = "upload" | "parsing" | "review" | "export";

function fmt(val: string | null): string {
    if (!val) return "—";
    const n = parseFloat(val);
    if (isNaN(n)) return val;
    return "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2 });
}

function fmtDate(val: string | null): string {
    if (!val) return "—";
    try {
        return new Date(val).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
    } catch {
        return val;
    }
}

function Spinner({ size = 16 }: { size?: number }) {
    return (
        <span style={{
            display: "inline-block", width: size, height: size,
            border: "2px solid currentColor", borderTopColor: "transparent",
            borderRadius: "50%",
        }} className="animate-spin" />
    );
}

function StepBar({ current }: { current: Step }) {
    const steps: { id: Step; label: string }[] = [
        { id: "upload", label: "Upload" },
        { id: "parsing", label: "Processing" },
        { id: "review", label: "Review" },
        { id: "export", label: "Export" },
    ];
    const idx = steps.findIndex((s) => s.id === current);
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 40 }}>
            {steps.map((step, i) => {
                const done = i < idx;
                const active = i === idx;
                return (
                    <div key={step.id} style={{ display: "flex", alignItems: "center", flex: i < steps.length - 1 ? 1 : "none" }}>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                            <div style={{
                                width: 28, height: 28, borderRadius: "50%",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                fontSize: 11, fontWeight: 600,
                                background: done ? "var(--accent)" : active ? "var(--text-primary)" : "var(--bg-subtle)",
                                color: done || active ? "#fff" : "var(--text-tertiary)",
                                border: active ? "none" : done ? "none" : "1.5px solid var(--border)",
                                transition: "all 0.2s", flexShrink: 0,
                            }}>
                                {done ? "✓" : i + 1}
                            </div>
                            <span style={{
                                fontSize: 11, fontWeight: active ? 500 : 400,
                                color: active ? "var(--text-primary)" : done ? "var(--accent)" : "var(--text-tertiary)",
                                whiteSpace: "nowrap",
                            }}>
                                {step.label}
                            </span>
                        </div>
                        {i < steps.length - 1 && (
                            <div style={{
                                flex: 1, height: 1,
                                background: done ? "var(--accent)" : "var(--border)",
                                margin: "0 8px", marginBottom: 18, transition: "background 0.3s",
                            }} />
                        )}
                    </div>
                );
            })}
        </div>
    );
}

function UploadStep({ onParsed, onParsing }: {
    onParsed: (result: ParseResult, txs: Transaction[]) => void;
    onParsing: () => void;
}) {
    const [dragging, setDragging] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const processFile = useCallback(async (file: File) => {
        setError(null);
        onParsing();
        const formData = new FormData();
        formData.append("file", file);
        formData.append("sessionId", crypto.randomUUID());
        try {
            const res = await fetch("/api/parse", { method: "POST", body: formData });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Parse failed");
            const txRes = await fetch(`/api/jobs/${data.jobId}`);
            if (!txRes.ok) throw new Error("Failed to fetch parsed transactions");
            const txData = await txRes.json();
            onParsed(data, txData.transactions ?? []);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Something went wrong";
            setError(msg);
            throw err;
        }
    }, [onParsed, onParsing]);

    const handleDrop = useCallback(async (e: React.DragEvent) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) { try { await processFile(file); } catch (err: unknown) { setError(err instanceof Error ? err.message : "Failed"); } }
    }, [processFile]);

    const handleFileInput = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) { try { await processFile(file); } catch (err: unknown) { setError(err instanceof Error ? err.message : "Failed"); } }
    }, [processFile]);

    return (
        <div className="animate-fade-up">
            <div
                onDragEnter={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => inputRef.current?.click()}
                style={{
                    border: `1.5px dashed ${dragging ? "var(--accent)" : "var(--border-strong)"}`,
                    borderRadius: "var(--radius-xl)", padding: "64px 40px",
                    textAlign: "center", cursor: "pointer",
                    background: dragging ? "var(--accent-bg)" : "var(--bg-card)", transition: "all 0.2s",
                }}
            >
                <input ref={inputRef} type="file" accept=".pdf,.xlsx,.xls,.csv" onChange={handleFileInput} style={{ display: "none" }} />
                <div style={{
                    width: 56, height: 56, borderRadius: "var(--radius-lg)",
                    background: dragging ? "var(--accent)" : "var(--bg-subtle)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    margin: "0 auto 20px", transition: "all 0.2s",
                }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={dragging ? "#fff" : "var(--text-secondary)"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                        <polyline points="17 8 12 3 7 8" />
                        <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                </div>
                <p style={{ fontSize: 16, fontWeight: 500, color: "var(--text-primary)", marginBottom: 6 }}>
                    {dragging ? "Drop it here" : "Drop your file here"}
                </p>
                <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 20 }}>or click to browse</p>
                <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
                    {["PDF Bank Statement", "Excel (.xlsx)", "CSV"].map((f) => (
                        <span key={f} className="badge badge-neutral">{f}</span>
                    ))}
                </div>
            </div>
            {error && (
                <div className="animate-fade-in" style={{
                    marginTop: 16, padding: "12px 16px", borderRadius: "var(--radius-md)",
                    background: "var(--danger-bg)", border: "1px solid #f5c6c3",
                    color: "var(--danger)", fontSize: 13, lineHeight: 1.5,
                }}>
                    <strong style={{ fontWeight: 500 }}>Error: </strong>{error}
                </div>
            )}
            <p style={{ marginTop: 20, fontSize: 12, color: "var(--text-tertiary)", textAlign: "center", lineHeight: 1.6 }}>
                Files are processed in-memory and never stored on our servers. Max file size: 10MB.
            </p>
        </div>
    );
}

function ParsingStep() {
    return (
        <div className="animate-fade-in" style={{ textAlign: "center", padding: "80px 0" }}>
            <div style={{
                width: 56, height: 56, borderRadius: "50%",
                border: "2px solid var(--accent)", borderTopColor: "transparent",
                margin: "0 auto 24px",
            }} className="animate-spin" />
            <p style={{ fontSize: 16, fontWeight: 500, color: "var(--text-primary)", marginBottom: 6 }}>
                Extracting transactions
            </p>
            <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                Reading your file and running AI extraction…
            </p>
        </div>
    );
}

function ReviewStep({ transactions, fileName, onConfirm }: {
    transactions: Transaction[];
    fileName: string;
    onConfirm: (txs: Transaction[]) => void;
}) {
    const [rows, setRows] = useState<Transaction[]>(transactions ?? []);
    const [editingCell, setEditingCell] = useState<{ rowId: string; col: keyof Transaction } | null>(null);
    const [editValue, setEditValue] = useState("");
    const [search, setSearch] = useState("");
    const [page, setPage] = useState(0);
    const PAGE_SIZE = 50;

    const filtered = rows.filter((r) =>
        !search ||
        r.description?.toLowerCase().includes(search.toLowerCase()) ||
        r.date?.includes(search)
    );
    const pageCount = Math.ceil(filtered.length / PAGE_SIZE);
    const visible = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

    const totals = rows.reduce((acc, r) => ({
        debit: acc.debit + (r.debit ? parseFloat(r.debit) : 0),
        credit: acc.credit + (r.credit ? parseFloat(r.credit) : 0),
    }), { debit: 0, credit: 0 });

    const commitEdit = () => {
        if (!editingCell) return;
        setRows((prev) => prev.map((r) =>
            r.id === editingCell.rowId ? { ...r, [editingCell.col]: editValue || null, edited: true } : r
        ));
        setEditingCell(null);
    };

    const deleteRow = (id: string) => setRows((prev) => prev.filter((r) => r.id !== id));

    const addRow = () => {
        setRows((prev) => [...prev, {
            id: crypto.randomUUID(), rowIndex: prev.length,
            date: null, description: null, debit: null, credit: null, balance: null, edited: true,
        }]);
        setPage(Math.floor(rows.length / PAGE_SIZE));
    };

    const editableCell = (rowId: string, col: keyof Transaction, val: string | null, cls?: string) => {
        const isEditing = editingCell?.rowId === rowId && editingCell?.col === col;
        return isEditing ? (
            <input autoFocus value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={commitEdit}
                onKeyDown={(e) => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") setEditingCell(null); }}
                style={{ width: "100%", minWidth: 80, background: "var(--accent-bg)", border: "1px solid var(--accent)", borderRadius: 4, padding: "4px 6px", fontSize: 13, fontFamily: "var(--font-sans)", color: "var(--text-primary)" }}
            />
        ) : (
            <span className={cls} onClick={() => { setEditingCell({ rowId, col }); setEditValue(val ?? ""); }}
                title="Click to edit" style={{ cursor: "text", display: "block", minWidth: 40, minHeight: 20 }}>
                {col === "date" ? fmtDate(val) : (col === "debit" || col === "credit" || col === "balance") ? (val ? fmt(val) : "—") : val || "—"}
            </span>
        );
    };

    return (
        <div className="animate-fade-up">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
                <div>
                    <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>{fileName}</p>
                    <p style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 2 }}>{rows.length} transactions · Click any cell to edit</p>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <input type="text" placeholder="Search…" value={search}
                        onChange={(e) => { setSearch(e.target.value); setPage(0); }} style={{ width: 180 }} />
                    <button className="btn-ghost" onClick={addRow} style={{ fontSize: 13 }}>+ Add row</button>
                    <button className="btn-primary" onClick={() => onConfirm(rows)}>Confirm & Export →</button>
                </div>
            </div>

            <div style={{ display: "flex", gap: 1, marginBottom: 16, borderRadius: "var(--radius-md)", overflow: "hidden", border: "1px solid var(--border)" }}>
                {[
                    { label: "Transactions", value: rows.length.toLocaleString("en-IN") },
                    { label: "Total Debit", value: fmt(totals.debit.toFixed(2)), red: true },
                    { label: "Total Credit", value: fmt(totals.credit.toFixed(2)), green: true },
                    { label: "Net", value: fmt((totals.credit - totals.debit).toFixed(2)), accent: true },
                ].map((item) => (
                    <div key={item.label} style={{ flex: 1, padding: "12px 16px", background: item.accent ? "var(--accent-bg)" : "var(--bg-card)", borderRight: "1px solid var(--border)" }}>
                        <p style={{ fontSize: 10, fontWeight: 500, letterSpacing: "0.06em", textTransform: "uppercase", color: item.accent ? "var(--accent)" : "var(--text-tertiary)", marginBottom: 4 }}>{item.label}</p>
                        <p style={{ fontSize: 14, fontWeight: 600, fontFamily: "var(--font-mono)", color: item.red ? "var(--danger)" : item.green ? "var(--success)" : item.accent ? "var(--accent)" : "var(--text-primary)", letterSpacing: "-0.01em" }}>{item.value}</p>
                    </div>
                ))}
            </div>

            <div className="card" style={{ overflow: "hidden" }}>
                <div style={{ overflowX: "auto" }}>
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th style={{ width: 40 }}>#</th>
                                <th style={{ minWidth: 110 }}>Date</th>
                                <th style={{ minWidth: 300 }}>Description</th>
                                <th style={{ minWidth: 110, textAlign: "right" }}>Debit</th>
                                <th style={{ minWidth: 110, textAlign: "right" }}>Credit</th>
                                <th style={{ minWidth: 120, textAlign: "right" }}>Balance</th>
                                <th style={{ width: 36 }}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {visible.map((row, i) => (
                                <tr key={row.id} style={{ background: row.edited ? "var(--accent-bg)" : undefined }}>
                                    <td style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-mono)", fontSize: 11 }}>{page * PAGE_SIZE + i + 1}</td>
                                    <td className="mono">{editableCell(row.id, "date", row.date)}</td>
                                    <td>{editableCell(row.id, "description", row.description)}</td>
                                    <td style={{ textAlign: "right" }}>{editableCell(row.id, "debit", row.debit, "debit")}</td>
                                    <td style={{ textAlign: "right" }}>{editableCell(row.id, "credit", row.credit, "credit")}</td>
                                    <td className="mono" style={{ textAlign: "right" }}>{editableCell(row.id, "balance", row.balance)}</td>
                                    <td>
                                        <button onClick={() => deleteRow(row.id)} title="Delete row"
                                            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-tertiary)", fontSize: 14, lineHeight: 1, padding: "2px 4px", borderRadius: 4 }}
                                            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--danger)")}
                                            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-tertiary)")}>×</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {pageCount > 1 && (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderTop: "1px solid var(--border)", fontSize: 12, color: "var(--text-secondary)" }}>
                        <span>Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}</span>
                        <div style={{ display: "flex", gap: 4 }}>
                            <button className="btn-ghost" disabled={page === 0} onClick={() => setPage((p) => p - 1)} style={{ padding: "5px 12px", fontSize: 12 }}>← Prev</button>
                            <button className="btn-ghost" disabled={page >= pageCount - 1} onClick={() => setPage((p) => p + 1)} style={{ padding: "5px 12px", fontSize: 12 }}>Next →</button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ToolPage() {
    const [step, setStep] = useState<Step>("upload");
    const [parseResult, setParseResult] = useState<ParseResult | null>(null);
    const [transactions, setTransactions] = useState<Transaction[]>([]);

    const reset = () => { setStep("upload"); setParseResult(null); setTransactions([]); };
    const handleParsing = () => setStep("parsing");
    const handleParsed = (result: ParseResult, txs: Transaction[]) => {
        setParseResult(result);
        setTransactions(txs ?? []);
        setStep("review");
    };
    const handleConfirm = () => setStep("export");

    return (
        <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", flexDirection: "column" }}>
            <header style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-card)", position: "sticky", top: 0, zIndex: 10 }}>
                <div style={{ maxWidth: 820, margin: "0 auto", padding: "0 24px", height: 56, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <a href="/" style={{ fontWeight: 600, fontSize: 15, color: "var(--text-primary)", textDecoration: "none", letterSpacing: "-0.03em", display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ width: 22, height: 22, background: "var(--accent)", borderRadius: 6, display: "inline-block" }} />
                        ClearLedger
                    </a>
                    <a href="/" style={{ fontSize: 13, color: "var(--text-secondary)", textDecoration: "none" }}>← Back to home</a>
                </div>
            </header>

            <main style={{ flex: 1, maxWidth: 820, width: "100%", margin: "0 auto", padding: "48px 24px" }}>
                {step === "upload" && (
                    <div style={{ marginBottom: 40 }}>
                        <h1 style={{ fontSize: 28, fontWeight: 600, letterSpacing: "-0.03em", marginBottom: 8 }}>Convert financial files</h1>
                        <p style={{ fontSize: 15, color: "var(--text-secondary)", lineHeight: 1.6 }}>
                            Upload a bank statement, sales report, or any financial file. Get clean Tally XML, GST JSON, or CSV in minutes.
                        </p>
                    </div>
                )}

                <StepBar current={step} />

                {step === "upload" && <UploadStep onParsing={handleParsing} onParsed={handleParsed} />}
                {step === "parsing" && <ParsingStep />}
                {step === "review" && parseResult && (
                    <ReviewStep transactions={transactions} fileName={parseResult.fileName} onConfirm={handleConfirm} />
                )}
                {step === "export" && parseResult && (
                    <ExportStep jobId={parseResult.jobId} fileName={parseResult.fileName} rowCount={parseResult.rowCount} onReset={reset} />
                )}
            </main>
        </div>
    );
}