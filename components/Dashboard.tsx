"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import ServiceWorker from "./ServiceWorker";
import type { Analysis, MarketSnapshot, Trend } from "@/lib/types";

type ApiPayload = {
  analysis: Analysis;
  market: MarketSnapshot;
  fallback: boolean;
  warning?: string;
};

const INITIAL_MESSAGE = "วิเคราะห์ทองตอนนี้ให้หน่อย";
const formatter = new Intl.NumberFormat("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const dateFormatter = new Intl.DateTimeFormat("th-TH", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short", timeZone: "Asia/Bangkok" });

function TrendMark({ trend }: { trend: Trend }) {
  const mark = trend === "bullish" ? "↗" : trend === "bearish" ? "↘" : "→";
  return <span className={`trend-mark trend-mark--${trend}`} aria-label={trend}>{mark}</span>;
}

function LoadingPanel() {
  return (
    <main className="dashboard dashboard--loading" aria-busy="true" aria-label="กำลังโหลดบทวิเคราะห์">
      <div className="skeleton skeleton--nav" />
      <div className="skeleton skeleton--hero" />
      <div className="skeleton-grid"><div className="skeleton" /><div className="skeleton" /></div>
      <div className="skeleton skeleton--plan" />
    </main>
  );
}

export default function Dashboard() {
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [market, setMarket] = useState<MarketSnapshot | null>(null);
  const [message, setMessage] = useState(INITIAL_MESSAGE);
  const [manualPrice, setManualPrice] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [history, setHistory] = useState<Analysis[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("loading");
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const previousResponseId = analysis?.responseId;

  const requestAnalysis = useCallback(async (prompt = INITIAL_MESSAGE) => {
    setStatus("loading");
    setError("");
    setWarning("");
    const parsedManualPrice = manualPrice.trim() ? Number(manualPrice) : undefined;
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { "x-dashboard-token": accessToken } : {})
        },
        body: JSON.stringify({
          message: prompt,
          manualPrice: parsedManualPrice,
          previousResponseId
        })
      });
      const payload = (await response.json()) as ApiPayload & { error?: string };
      if (!response.ok) throw new Error(payload.error || "วิเคราะห์ไม่สำเร็จ");
      setAnalysis(payload.analysis);
      setMarket(payload.market);
      setWarning(payload.warning || (payload.fallback ? "กำลังใช้ Demo rule engine — ยังไม่ใช่คำวิเคราะห์จาก AI" : ""));
      setHistory((current) => {
        const next = [payload.analysis, ...current.filter((item) => item.id !== payload.analysis.id)].slice(0, 30);
        localStorage.setItem("xauwatch-history", JSON.stringify(next));
        return next;
      });
      setStatus("success");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "เกิดข้อผิดพลาด");
      setStatus("error");
    }
  }, [accessToken, manualPrice, previousResponseId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const saved = localStorage.getItem("xauwatch-history");
      const token = sessionStorage.getItem("xauwatch-token") || "";
      if (saved) {
        try { setHistory(JSON.parse(saved) as Analysis[]); } catch { localStorage.removeItem("xauwatch-history"); }
      }
      setAccessToken(token);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (status !== "loading" || analysis) return;
    const timer = window.setTimeout(() => { void requestAnalysis(); }, 0);
    return () => window.clearTimeout(timer);
  }, [analysis, requestAnalysis, status]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = window.setInterval(() => requestAnalysis("เช็กแผนเดิมจากราคาล่าสุด"), 5 * 60_000);
    return () => window.clearInterval(interval);
  }, [autoRefresh, requestAnalysis]);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (message.trim()) requestAnalysis(message.trim());
  };

  const saveToken = (value: string) => {
    setAccessToken(value);
    if (value) sessionStorage.setItem("xauwatch-token", value);
    else sessionStorage.removeItem("xauwatch-token");
  };

  const actionLabel = useMemo(() => {
    if (!analysis) return "WAIT";
    return analysis.action === "BUY_NOW" ? "BUY NOW" : analysis.action === "SELL_NOW" ? "SELL NOW" : "WAIT";
  }, [analysis]);

  if (!analysis || !market) {
    return (
      <>
        <ServiceWorker />
        <LoadingPanel />
        {error && <div className="boot-error" role="alert"><p>{error}</p><button onClick={() => requestAnalysis()}>ลองอีกครั้ง</button></div>}
      </>
    );
  }

  const plan = analysis.primaryPlan;
  const isWait = analysis.action === "WAIT";

  return (
    <>
      <ServiceWorker />
      <header className="nav-term">
        <div className="nav-term__line">
          <span className="prompt" aria-hidden="true">&gt;</span>
          <strong>xauwatch</strong>
          <a href="#levels">--levels</a>
          <a href="#plan">--plan</a>
          <span className="caret" aria-hidden="true">▮</span>
        </div>
        <span className={`feed-state ${market.stale ? "feed-state--stale" : ""}`}>
          <span aria-hidden="true" />{market.stale ? "DEMO / STALE" : "LIVE"}
        </span>
      </header>

      <main className="dashboard">
        <section className="market-hero" aria-labelledby="market-title">
          <div>
            <p className="market-hero__symbol" id="market-title">XAU / USD</p>
            <p className="market-hero__price">{formatter.format(market.price)}</p>
            <p className={`market-hero__change ${market.changePercent < 0 ? "negative" : "positive"}`}>
              {market.changePercent >= 0 ? "+" : ""}{market.changePercent.toFixed(2)}% วันนี้
            </p>
          </div>
          <div className="market-hero__meta">
            <span>อัปเดต</span>
            <time dateTime={market.asOf}>{dateFormatter.format(new Date(market.asOf))}</time>
            <span>Feed: {market.source === "demo" ? "Demo" : "Twelve Data"}</span>
          </div>
        </section>

        {warning && <p className="system-warning" role="status">{warning}</p>}
        {error && <p className="system-error" role="alert">{error}</p>}

        <section className="decision-panel" aria-labelledby="decision-title">
          <div className="decision-panel__bias">
            <span id="decision-title">BIAS</span>
            <strong className={`signal signal--${analysis.bias.toLowerCase()}`}>{analysis.bias}</strong>
            <small>{analysis.confidence}% confidence</small>
          </div>
          <div className={`decision-panel__action action--${analysis.action.toLowerCase()}`}>
            <span>ACTION</span>
            <strong>{actionLabel}</strong>
            <p>{analysis.summary}</p>
          </div>
        </section>

        <section className="timeframes" aria-label="แนวโน้มตามกรอบเวลา">
          {(["m5", "m15", "h1"] as const).map((frame) => (
            <div key={frame}>
              <span>{frame.toUpperCase()}</span>
              <TrendMark trend={analysis.trend[frame]} />
              <strong>{analysis.trend[frame]}</strong>
            </div>
          ))}
        </section>

        <section className="levels" id="levels" aria-labelledby="levels-title">
          <div className="section-heading">
            <h2 id="levels-title">ระดับตัดสินใจ</h2>
            <p>ยึดราคาบนโบรกเกอร์คุณเป็นหลัก</p>
          </div>
          <div className="levels__columns">
            <div className="levels__side levels__side--resistance">
              <h3>แนวต้าน</h3>
              {analysis.resistance.map((level, index) => <div key={`${level}-${index}`}><span>R{index + 1}</span><strong>{formatter.format(level)}</strong></div>)}
            </div>
            <div className="levels__side levels__side--support">
              <h3>แนวรับ</h3>
              {analysis.support.map((level, index) => <div key={`${level}-${index}`}><span>S{index + 1}</span><strong>{formatter.format(level)}</strong></div>)}
            </div>
          </div>
        </section>

        <section className="plan" id="plan" aria-labelledby="plan-title">
          <div className="section-heading section-heading--plan">
            <div>
              <h2 id="plan-title">แผนหลัก</h2>
              <p>{isWait ? "รอราคาเข้าพื้นที่ได้เปรียบ" : "เงื่อนไขพร้อม แต่ต้องรอแท่งยืนยัน"}</p>
            </div>
            <strong className={`plan-direction plan-direction--${plan.direction}`}>{plan.direction.toUpperCase()}</strong>
          </div>
          <dl className="plan-grid">
            <div className="plan-grid__entry"><dt>ENTRY ZONE</dt><dd>{formatter.format(plan.entryZone[0])}–{formatter.format(plan.entryZone[1])}</dd></div>
            <div className="plan-grid__sl"><dt>STOP LOSS</dt><dd>{formatter.format(plan.stopLoss)}</dd></div>
            {plan.takeProfit.map((target, index) => <div key={target}><dt>TP{index + 1}</dt><dd>{formatter.format(target)}</dd></div>)}
          </dl>
          <div className="plan-notes">
            <p><span>Trigger</span>{plan.trigger}</p>
            <p><span>Invalidation</span>{plan.invalidation}</p>
          </div>
        </section>

        <section className="command" aria-labelledby="command-title">
          <div className="section-heading">
            <h2 id="command-title">ถามนักวิเคราะห์</h2>
            <p>คำตอบใหม่จะแทนสถานะบน Dashboard</p>
          </div>
          <form onSubmit={onSubmit}>
            <label htmlFor="analysis-command">คำสั่ง</label>
            <div className="command__field">
              <textarea
                id="analysis-command"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                rows={3}
                maxLength={500}
                aria-describedby="command-helper"
              />
              <button type="submit" disabled={status === "loading"} data-state={status}>
                {status === "loading" ? "กำลังวิเคราะห์…" : status === "error" ? "ลองใหม่" : "วิเคราะห์ตอนนี้"}
              </button>
            </div>
            <p id="command-helper" className="field-helper">AI จะได้รับ snapshot ล่าสุดและบริบทจากแผนก่อนหน้า</p>
            <div className="quick-actions" aria-label="คำสั่งด่วน">
              <button type="button" onClick={() => { setMessage("วิเคราะห์ทองตอนนี้ เน้นเข้าเร็ว M5–M15"); requestAnalysis("วิเคราะห์ทองตอนนี้ เน้นเข้าเร็ว M5–M15"); }}>เข้าเร็ว</button>
              <button type="button" onClick={() => { setMessage("เช็กแผนเดิมจากราคาล่าสุด"); requestAnalysis("เช็กแผนเดิมจากราคาล่าสุด"); }}>เช็กแผนเดิม</button>
            </div>
          </form>
        </section>

        <details className="settings">
          <summary>Feed, access และการรีเฟรช</summary>
          <div className="settings__body">
            <label htmlFor="manual-price">ราคาโบรกเกอร์ (เว้นว่างเพื่อใช้ feed)</label>
            <input id="manual-price" inputMode="decimal" value={manualPrice} onChange={(event) => setManualPrice(event.target.value)} placeholder="เช่น 4040.2" />
            <label htmlFor="access-token">รหัส Dashboard</label>
            <input id="access-token" type="password" value={accessToken} onChange={(event) => saveToken(event.target.value)} autoComplete="current-password" placeholder="กรอกเมื่อ server เปิดการป้องกัน" />
            <label className="toggle"><input type="checkbox" checked={autoRefresh} onChange={(event) => setAutoRefresh(event.target.checked)} /> วิเคราะห์ใหม่ทุก 5 นาที</label>
          </div>
        </details>

        <details className="history">
          <summary>ประวัติบทวิเคราะห์ <span>{history.length}</span></summary>
          <div className="history__list">
            {history.length === 0 ? <p>ยังไม่มีประวัติ — วิเคราะห์ครั้งแรกเพื่อเริ่มบันทึก</p> : history.slice(0, 8).map((item) => (
              <button key={item.id} type="button" onClick={() => setAnalysis(item)}>
                <time dateTime={item.generatedAt}>{dateFormatter.format(new Date(item.generatedAt))}</time>
                <strong className={`signal--${item.bias.toLowerCase()}`}>{item.bias}</strong>
                <span>{item.action.replace("_", " ")}</span>
                <b>{formatter.format(item.price)}</b>
              </button>
            ))}
          </div>
        </details>

        <p className="risk-note">{analysis.riskNote}</p>
      </main>

      <footer className="foot-dense">
        <p>XAUWATCH v0.3 · {analysis.source.toUpperCase()} · DATA {market.stale ? "STALE" : "LIVE"} · ไม่ใช่คำรับรองผลกำไร · ตรวจสอบราคาและข่าวกับแหล่งทางการก่อนส่งคำสั่งจริง</p>
      </footer>
    </>
  );
}
