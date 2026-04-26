import Link from "next/link";

export default function HomePage() {
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text-primary)" }}>
      {/* Nav */}
      <header style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-card)" }}>
        <div
          style={{
            maxWidth: 1080,
            margin: "0 auto",
            padding: "0 32px",
            height: 60,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span
            style={{
              fontWeight: 600,
              fontSize: 16,
              letterSpacing: "-0.03em",
              display: "flex",
              alignItems: "center",
              gap: 9,
            }}
          >
            <span style={{ width: 22, height: 22, background: "var(--accent)", borderRadius: 6, display: "inline-block" }} />
            ClearLedger
          </span>

          <nav style={{ display: "flex", alignItems: "center", gap: 24 }}>
            <a href="#how" style={{ fontSize: 13, color: "var(--text-secondary)", textDecoration: "none" }}>How it works</a>
            <a href="#features" style={{ fontSize: 13, color: "var(--text-secondary)", textDecoration: "none" }}>Features</a>
            <Link href="/tool">
              <span className="btn-primary" style={{ fontSize: 13, padding: "8px 18px" }}>
                Try free →
              </span>
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section
        style={{
          maxWidth: 800,
          margin: "0 auto",
          padding: "100px 32px 80px",
          textAlign: "center",
        }}
      >
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            background: "var(--accent-bg)",
            color: "var(--accent)",
            border: "1px solid #c3e8d8",
            borderRadius: 999,
            padding: "4px 14px",
            fontSize: 12,
            fontWeight: 500,
            marginBottom: 28,
            letterSpacing: "0.01em",
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent)", display: "inline-block" }} />
          Built for Indian CAs &amp; Tax Professionals
        </div>

        <h1
          style={{
            fontSize: "clamp(36px, 6vw, 56px)",
            fontWeight: 600,
            letterSpacing: "-0.04em",
            lineHeight: 1.1,
            marginBottom: 20,
          }}
        >
          Bank PDFs to Tally XML
          <br />
          <span style={{ color: "var(--accent)" }}>in 2 minutes.</span>
        </h1>

        <p
          style={{
            fontSize: 17,
            color: "var(--text-secondary)",
            lineHeight: 1.65,
            maxWidth: 520,
            margin: "0 auto 36px",
          }}
        >
          Upload messy bank statements and sales files. Get clean, ready-to-import outputs for Tally, GST, and Excel — no manual entry.
        </p>

        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <Link href="/tool">
            <span className="btn-primary" style={{ fontSize: 15, padding: "12px 28px" }}>
              Start for free →
            </span>
          </Link>
        </div>

        <p style={{ marginTop: 16, fontSize: 12, color: "var(--text-tertiary)" }}>
          No account needed · Files never stored · Works with 50+ banks
        </p>
      </section>

      {/* Input → Output visual */}
      <section
        style={{
          maxWidth: 860,
          margin: "0 auto",
          padding: "0 32px 80px",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto 1fr",
            gap: 20,
            alignItems: "center",
          }}
        >
          {/* Input card */}
          <div className="card" style={{ padding: "24px" }}>
            <p className="label" style={{ marginBottom: 16 }}>You upload</p>
            {[
              { icon: "📄", label: "HDFC Bank Statement.pdf", sub: "156 pages, 890 transactions" },
              { icon: "📊", label: "Sales Report Q4.xlsx", sub: "Messy columns, mixed dates" },
              { icon: "📋", label: "GST Data.csv", sub: "Unclean, missing amounts" },
            ].map((item) => (
              <div
                key={item.label}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  padding: "10px 0",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <span style={{ fontSize: 18 }}>{item.icon}</span>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 500 }}>{item.label}</p>
                  <p style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 2 }}>{item.sub}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Arrow */}
          <div style={{ textAlign: "center" }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: "50%",
                background: "var(--accent)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                fontSize: 18,
              }}
            >
              →
            </div>
            <p style={{ fontSize: 10, color: "var(--text-tertiary)", marginTop: 8, fontWeight: 500, letterSpacing: "0.04em", textTransform: "uppercase" }}>
              AI
            </p>
          </div>

          {/* Output card */}
          <div className="card" style={{ padding: "24px" }}>
            <p className="label" style={{ marginBottom: 16 }}>You get</p>
            {[
              { icon: "🟢", label: "Tally XML", sub: "Import into TallyPrime / ERP 9", tag: "Ready" },
              { icon: "🟢", label: "GST JSON", sub: "GSTR-1 format for CA Portal", tag: "Ready" },
              { icon: "🟢", label: "Clean CSV", sub: "Normalized for any tool", tag: "Ready" },
            ].map((item) => (
              <div
                key={item.label}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  padding: "10px 0",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <span style={{ fontSize: 18 }}>{item.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <p style={{ fontSize: 13, fontWeight: 500 }}>{item.label}</p>
                    <span className="badge badge-success" style={{ fontSize: 10, padding: "2px 7px" }}>{item.tag}</span>
                  </div>
                  <p style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 2 }}>{item.sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" style={{ borderTop: "1px solid var(--border)", padding: "80px 32px" }}>
        <div style={{ maxWidth: 860, margin: "0 auto" }}>
          <p className="label" style={{ textAlign: "center", marginBottom: 12 }}>How it works</p>
          <h2
            style={{
              fontSize: 32,
              fontWeight: 600,
              letterSpacing: "-0.03em",
              textAlign: "center",
              marginBottom: 48,
            }}
          >
            Four steps, done.
          </h2>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 24,
            }}
          >
            {[
              { n: "01", title: "Upload", desc: "Drop a PDF, Excel, or CSV file. Nothing is stored on our servers." },
              { n: "02", title: "Extract", desc: "AI reads every transaction, date, amount, and balance automatically." },
              { n: "03", title: "Review", desc: "Edit any cell inline. Add or remove rows. Verify totals." },
              { n: "04", title: "Export", desc: "Download Tally XML, GST JSON, or clean CSV instantly." },
            ].map((step) => (
              <div key={step.n} style={{ padding: "24px", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)" }}>
                <p style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--accent)", fontWeight: 500, marginBottom: 10 }}>
                  {step.n}
                </p>
                <p style={{ fontSize: 15, fontWeight: 600, letterSpacing: "-0.02em", marginBottom: 8 }}>{step.title}</p>
                <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6 }}>{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" style={{ borderTop: "1px solid var(--border)", padding: "80px 32px", background: "var(--bg-card)" }}>
        <div style={{ maxWidth: 860, margin: "0 auto" }}>
          <p className="label" style={{ textAlign: "center", marginBottom: 12 }}>Features</p>
          <h2 style={{ fontSize: 32, fontWeight: 600, letterSpacing: "-0.03em", textAlign: "center", marginBottom: 48 }}>
            Everything your team needs
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 20 }}>
            {[
              { title: "50+ Indian banks", desc: "HDFC, SBI, ICICI, Axis, Kotak, and more — AI adapts to any format." },
              { title: "Tally-ready XML", desc: "One-click import into TallyPrime and Tally ERP 9. No reformatting needed." },
              { title: "GSTR-1 JSON", desc: "Structured output matching the GST portal JSON schema for income entries." },
              { title: "Inline editing", desc: "Review and fix any extracted cell before export. Full control." },
              { title: "Zero storage", desc: "Files are processed in-memory and immediately discarded. Privacy-first." },
              { title: "Handles large files", desc: "200+ page bank statements, 1000+ row Excel files — no problem." },
            ].map((f) => (
              <div key={f.title} style={{ padding: "20px" }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--accent)", marginBottom: 12 }} />
                <p style={{ fontSize: 14, fontWeight: 500, marginBottom: 6 }}>{f.title}</p>
                <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ borderTop: "1px solid var(--border)", padding: "80px 32px", textAlign: "center" }}>
        <div style={{ maxWidth: 480, margin: "0 auto" }}>
          <h2 style={{ fontSize: 32, fontWeight: 600, letterSpacing: "-0.03em", marginBottom: 12 }}>
            Ready to save hours?
          </h2>
          <p style={{ fontSize: 15, color: "var(--text-secondary)", marginBottom: 28, lineHeight: 1.6 }}>
            No signup. No credit card. Just upload and get clean outputs.
          </p>
          <Link href="/tool">
            <span className="btn-primary" style={{ fontSize: 15, padding: "12px 32px" }}>
              Open the tool →
            </span>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer
        style={{
          borderTop: "1px solid var(--border)",
          padding: "24px 32px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <span style={{ fontSize: 12, color: "var(--text-tertiary)", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 14, height: 14, background: "var(--accent)", borderRadius: 4, display: "inline-block" }} />
          ClearLedger — CA Work Automation
        </span>
        <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
          Files never stored · Privacy-first
        </span>
      </footer>
    </div>
  );
}