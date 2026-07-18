"use client";

import Image from "next/image";
import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import ServiceWorker from "./ServiceWorker";
import PlanChart from "./PlanChart";
import { chartAnalysisError, readApiPayload } from "@/lib/api-response";
import { buildPlanAlertRules, evaluatePlanAlerts, type TriggeredPlanAlert } from "@/lib/alerts";
import { prepareChartImage, type PreparedChartImage } from "@/lib/chart-image";
import {
  deriveMarketFreshness,
  derivePlanPosition,
  deriveSafeAction,
  formatAgeThai,
  isPlanExpired,
  marketAgeMs,
  planRemainingMs
} from "@/lib/market-status";
import { calculateXauRisk, planMidpoint } from "@/lib/risk";
import { createRuleAnalysis } from "@/lib/rule-engine";
import type { Action, Analysis, MarketSeries, MarketSnapshot, SymbolCode, Trend } from "@/lib/types";

type ApiPayload = { analysis: Analysis; market: MarketSnapshot; fallback: boolean; warning?: string; chartUsed?: boolean };
type RiskPreferences = { balance: string; riskPercent: string };

const SYMBOL_KEY = "xauwatch-symbol";
const RISK_KEY = "xauwatch-risk-preferences";
const ALERT_KEY = "xauwatch-alerts";
const ALERT_TIMES_KEY = "xauwatch-alert-times";
const formatter = new Intl.NumberFormat("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const moneyFormatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const dateFormatter = new Intl.DateTimeFormat("th-TH", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short", timeZone: "Asia/Bangkok" });
const timeFormatter = new Intl.DateTimeFormat("th-TH", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Asia/Bangkok" });
const snapshotKey = (symbol: SymbolCode) => `xauwatch-latest-snapshot-${symbol}`;
const historyKey = (symbol: SymbolCode) => `xauwatch-history-${symbol}`;
const promptForSymbol = (symbol: SymbolCode) => symbol === "BTCUSD" ? "วิเคราะห์ BTCUSD ตอนนี้ให้หน่อย" : "วิเคราะห์ทองตอนนี้ให้หน่อย";
const symbolLabel = (symbol: SymbolCode) => symbol === "BTCUSD" ? "BTC / USD" : "XAU / USD";

function persistSnapshot(analysis: Analysis, market: MarketSnapshot) {
  try { localStorage.setItem(snapshotKey(analysis.symbol), JSON.stringify({ analysis, market })); } catch { /* Storage is optional. */ }
}

function actionText(action: Action) {
  return action === "BUY_NOW" ? "BUY NOW" : action === "SELL_NOW" ? "SELL NOW" : "WAIT";
}

function TrendMark({ trend }: { trend: Trend }) {
  const mark = trend === "bullish" ? "↗" : trend === "bearish" ? "↘" : "→";
  return <span className={`trend-mark trend-mark--${trend}`} aria-label={trend}>{mark}</span>;
}

function LoadingPanel() {
  return (
    <main className="dashboard dashboard--loading" aria-busy="true" aria-label="กำลังโหลดบทวิเคราะห์">
      <div className="skeleton skeleton--nav" /><div className="skeleton skeleton--hero" />
      <div className="skeleton-grid"><div className="skeleton" /><div className="skeleton" /></div>
      <div className="skeleton skeleton--plan" />
    </main>
  );
}

export default function Dashboard() {
  const [selectedSymbol, setSelectedSymbol] = useState<SymbolCode>("XAUUSD");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [market, setMarket] = useState<MarketSnapshot | null>(null);
  const [message, setMessage] = useState(promptForSymbol("XAUUSD"));
  const [manualPrice, setManualPrice] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [history, setHistory] = useState<Analysis[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("loading");
  const [marketRefreshing, setMarketRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [hydrated, setHydrated] = useState(false);
  const [clock, setClock] = useState(0);
  const [balance, setBalance] = useState("10000");
  const [riskPercent, setRiskPercent] = useState("0.5");
  const [riskEntry, setRiskEntry] = useState("");
  const [riskStop, setRiskStop] = useState("");
  const [alertsEnabled, setAlertsEnabled] = useState(false);
  const [alertEvents, setAlertEvents] = useState<TriggeredPlanAlert[]>([]);
  const [lastTriggered, setLastTriggered] = useState<Record<string, number>>({});
  const [copyState, setCopyState] = useState("");
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [chartSeries, setChartSeries] = useState<MarketSeries | null>(null);
  const [chartImage, setChartImage] = useState<PreparedChartImage | null>(null);
  const [chartTimeframe, setChartTimeframe] = useState<"AUTO" | "M5" | "M15" | "H1">("AUTO");
  const [chartStatus, setChartStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [chartMessage, setChartMessage] = useState("");
  const [visionUsed, setVisionUsed] = useState(false);
  const loadedSymbol = useRef<SymbolCode | null>(null);
  const previousPrice = useRef<number | null>(null);
  const riskPlanId = useRef("");
  const chartInputRef = useRef<HTMLInputElement>(null);
  const previousResponseId = analysis?.responseId;

  const requestChart = useCallback(async () => {
    try {
      const response = await fetch(`/api/chart?symbol=${selectedSymbol}`, {
        cache: "no-store",
        headers: accessToken ? { "x-dashboard-token": accessToken } : undefined
      });
      const payload = (await response.json()) as MarketSeries & { error?: string };
      if (!response.ok) throw new Error(payload.error || "ดึงข้อมูลกราฟไม่สำเร็จ");
      if (payload.symbol !== selectedSymbol) return null;
      setChartSeries(payload);
      return payload;
    } catch (caught) {
      setChartMessage(caught instanceof Error ? caught.message : "ดึงข้อมูลกราฟไม่สำเร็จ");
      return null;
    }
  }, [accessToken, selectedSymbol]);

  const requestMarket = useCallback(async () => {
    const params = new URLSearchParams();
    params.set("symbol", selectedSymbol);
    if (manualPrice.trim()) params.set("price", manualPrice.trim());
    setMarketRefreshing(true);
    try {
      const response = await fetch(`/api/market${params.size ? `?${params}` : ""}`, {
        cache: "no-store",
        headers: accessToken ? { "x-dashboard-token": accessToken } : undefined
      });
      const payload = (await response.json()) as MarketSnapshot & { error?: string };
      if (!response.ok) throw new Error(payload.error || "ดึงราคาล่าสุดไม่สำเร็จ");
      if (payload.symbol !== selectedSymbol) return null;
      setError("");
      setMarket(payload);
      setAnalysis((current) => {
        const next = current ?? createRuleAnalysis(payload);
        persistSnapshot(next, payload);
        return next;
      });
      return payload;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "ดึงราคาล่าสุดไม่สำเร็จ");
      return null;
    } finally {
      setMarketRefreshing(false);
    }
  }, [accessToken, manualPrice, selectedSymbol]);

  const requestAnalysis = useCallback(async (prompt = promptForSymbol(selectedSymbol), includeChart = false) => {
    setStatus("loading"); setError(""); setWarning("");
    if (includeChart) {
      setChartStatus("loading");
      setChartMessage("กำลังส่งภาพให้ AI… ปกติใช้เวลาประมาณ 10–45 วินาที");
      setVisionUsed(false);
    }
    const parsedManualPrice = manualPrice.trim() ? Number(manualPrice) : undefined;
    try {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 60_000);
      const response = await fetch("/api/analyze", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json", ...(accessToken ? { "x-dashboard-token": accessToken } : {}) },
        signal: controller.signal,
        body: JSON.stringify({
          symbol: selectedSymbol,
          message: prompt,
          manualPrice: parsedManualPrice,
          previousResponseId,
          chartImage: includeChart ? chartImage?.dataUrl : undefined,
          chartTimeframe
        })
      });
      window.clearTimeout(timeout);
      const payload = await readApiPayload<ApiPayload>(response);
      if (!response.ok) throw new Error(payload.error || "วิเคราะห์ไม่สำเร็จ");
      if (payload.analysis.symbol !== selectedSymbol || payload.market.symbol !== selectedSymbol) throw new Error("ผลวิเคราะห์ไม่ตรงกับคู่ที่เลือก กรุณาลองใหม่");
      setAnalysis(payload.analysis); setMarket(payload.market);
      setVisionUsed(includeChart && Boolean(payload.chartUsed));
      if (includeChart && payload.chartUsed) {
        setChartStatus("success");
        setChartMessage(`อ่าน Screenshot และอัปเดตแผนแล้ว · ${timeFormatter.format(Date.now())}`);
      } else if (includeChart && chartImage && payload.fallback) {
        setChartStatus("error");
        setChartMessage("AI ยังไม่ได้อ่านภาพ ระบบแสดงแผนสำรอง — กดลองอีกครั้งได้");
      }
      persistSnapshot(payload.analysis, payload.market);
      setWarning(payload.warning || (payload.fallback ? "กำลังใช้ Demo rule engine — ยังไม่ใช่คำวิเคราะห์จาก AI" : ""));
      setHistory((current) => {
        const next = [payload.analysis, ...current.filter((item) => item.id !== payload.analysis.id)].slice(0, 30);
        try { localStorage.setItem(historyKey(selectedSymbol), JSON.stringify(next)); } catch { /* Storage is optional. */ }
        return next;
      });
      setStatus("success");
      void requestChart();
    } catch (caught) {
      const message = chartAnalysisError(caught);
      setError(message); setStatus("error");
      if (includeChart) {
        setChartStatus("error");
        setChartMessage(`วิเคราะห์ภาพไม่สำเร็จ · ${message}`);
      }
    }
  }, [accessToken, chartImage, chartTimeframe, manualPrice, previousResponseId, requestChart, selectedSymbol]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const risk = localStorage.getItem(RISK_KEY);
      const token = sessionStorage.getItem("xauwatch-token") || "";
      const savedSymbol = localStorage.getItem(SYMBOL_KEY);
      if (savedSymbol === "BTCUSD" || savedSymbol === "XAUUSD") {
        setSelectedSymbol(savedSymbol);
        setMessage(promptForSymbol(savedSymbol));
      }
      if (risk) try {
        const preferences = JSON.parse(risk) as RiskPreferences;
        setBalance(preferences.balance || "10000"); setRiskPercent(preferences.riskPercent || "0.5");
      } catch { localStorage.removeItem(RISK_KEY); }
      setAlertsEnabled(localStorage.getItem(ALERT_KEY) === "true");
      try { setLastTriggered(JSON.parse(localStorage.getItem(ALERT_TIMES_KEY) || "{}") as Record<string, number>); } catch { localStorage.removeItem(ALERT_TIMES_KEY); }
      setAccessToken(token); setHydrated(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!hydrated || loadedSymbol.current === selectedSymbol) return;
    loadedSymbol.current = selectedSymbol;
    const timer = window.setTimeout(() => {
      const saved = localStorage.getItem(historyKey(selectedSymbol));
      const cached = localStorage.getItem(snapshotKey(selectedSymbol));
      if (saved) try { setHistory((JSON.parse(saved) as Analysis[]).filter((item) => item.symbol === selectedSymbol)); } catch { localStorage.removeItem(historyKey(selectedSymbol)); }
      else setHistory([]);
      if (cached) try {
        const snapshot = JSON.parse(cached) as { analysis?: Analysis; market?: MarketSnapshot };
        if (snapshot.analysis?.symbol === selectedSymbol && snapshot.market?.symbol === selectedSymbol) {
          setAnalysis(snapshot.analysis); setMarket(snapshot.market); setStatus("success");
        }
      } catch { localStorage.removeItem(snapshotKey(selectedSymbol)); }
      void requestMarket(); void requestChart(); void requestAnalysis();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [hydrated, requestAnalysis, requestChart, requestMarket, selectedSymbol]);

  useEffect(() => {
    const interval = window.setInterval(() => setClock(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!hydrated || !autoRefresh) return;
    const interval = window.setInterval(() => { void requestMarket(); void requestChart(); }, 60_000);
    return () => window.clearInterval(interval);
  }, [autoRefresh, hydrated, requestChart, requestMarket]);

  useEffect(() => {
    if (!hydrated || !autoRefresh) return;
    const interval = window.setInterval(() => { void requestAnalysis("เช็กแผนเดิมจากราคาล่าสุด"); }, 5 * 60_000);
    return () => window.clearInterval(interval);
  }, [autoRefresh, hydrated, requestAnalysis]);

  useEffect(() => {
    if (!analysis || riskPlanId.current === analysis.id) return;
    riskPlanId.current = analysis.id;
    setRiskEntry(String(planMidpoint(analysis.primaryPlan)));
    setRiskStop(String(analysis.primaryPlan.stopLoss));
  }, [analysis]);

  const alertRules = useMemo(() => analysis ? buildPlanAlertRules(analysis.id, analysis.primaryPlan) : [], [analysis]);

  useEffect(() => {
    if (!market) return;
    const before = previousPrice.current;
    previousPrice.current = market.price;
    if (!alertsEnabled || before === null) return;
    const result = evaluatePlanAlerts({ rules: alertRules, previousPrice: before, price: market.price, lastTriggered });
    if (!result.triggered.length) return;
    setLastTriggered(result.lastTriggered);
    setAlertEvents((current) => [...result.triggered, ...current].slice(0, 8));
    try { localStorage.setItem(ALERT_TIMES_KEY, JSON.stringify(result.lastTriggered)); } catch { /* Storage is optional. */ }
    if ("Notification" in window && Notification.permission === "granted") {
      result.triggered.forEach((item) => new Notification(`XAUWatch · ${item.label}`, { body: `${selectedSymbol} ${formatter.format(item.price)}`, tag: item.id }));
    }
  }, [alertRules, alertsEnabled, lastTriggered, market, selectedSymbol]);

  const riskCalculation = useMemo(() => {
    if (!analysis) return null;
    return calculateXauRisk({
      balance: Number(balance), riskPercent: Number(riskPercent), entry: Number(riskEntry), stopLoss: Number(riskStop),
      takeProfit: analysis.primaryPlan.takeProfit,
      contractSize: analysis.symbol === "BTCUSD" ? 1 : undefined,
      lotStep: analysis.symbol === "BTCUSD" ? 0.001 : undefined
    });
  }, [analysis, balance, riskEntry, riskPercent, riskStop]);

  const changeSymbol = (next: SymbolCode) => {
    if (next === selectedSymbol) return;
    loadedSymbol.current = null;
    previousPrice.current = null;
    setSelectedSymbol(next);
    setAnalysis(null); setMarket(null); setChartSeries(null); setHistory([]);
    setManualPrice(""); setMessage(promptForSymbol(next)); setStatus("loading");
    setError(""); setWarning(""); setAlertEvents([]);
    setChartImage(null); setChartStatus("idle"); setChartMessage(""); setVisionUsed(false);
    if (chartInputRef.current) chartInputRef.current.value = "";
    try { localStorage.setItem(SYMBOL_KEY, next); } catch { /* Storage is optional. */ }
  };

  const onSubmit = (event: FormEvent) => { event.preventDefault(); if (message.trim()) void requestAnalysis(message.trim(), Boolean(chartImage)); };
  const onChartImageChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setChartStatus("loading"); setChartMessage(""); setVisionUsed(false);
    try {
      const prepared = await prepareChartImage(file);
      setChartImage(prepared); setChartStatus("success");
      setChartMessage(`พร้อมวิเคราะห์ · ${prepared.width}×${prepared.height} · ${(prepared.bytes / 1024).toFixed(0)} KB`);
    } catch (caught) {
      setChartImage(null); setChartStatus("error");
      setChartMessage(caught instanceof Error ? caught.message : "เตรียมภาพไม่สำเร็จ");
    }
  };
  const clearChartImage = () => {
    setChartImage(null); setChartStatus("idle"); setChartMessage(""); setVisionUsed(false);
    if (chartInputRef.current) chartInputRef.current.value = "";
  };
  const saveToken = (value: string) => { setAccessToken(value); if (value) sessionStorage.setItem("xauwatch-token", value); else sessionStorage.removeItem("xauwatch-token"); };
  const saveRiskPreference = (nextBalance: string, nextRisk: string) => {
    setBalance(nextBalance); setRiskPercent(nextRisk);
    try { localStorage.setItem(RISK_KEY, JSON.stringify({ balance: nextBalance, riskPercent: nextRisk } satisfies RiskPreferences)); } catch { /* Storage is optional. */ }
  };
  const toggleAlerts = (enabled: boolean) => {
    setAlertsEnabled(enabled);
    try { localStorage.setItem(ALERT_KEY, String(enabled)); } catch { /* Storage is optional. */ }
  };
  const requestNotifications = async () => { if ("Notification" in window) await Notification.requestPermission(); };
  const copyText = async (text: string) => {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
      else throw new Error("Clipboard API unavailable");
      setCopyState("คัดลอกแล้ว");
    } catch {
      const fallback = document.createElement("textarea");
      fallback.value = text; fallback.setAttribute("readonly", ""); fallback.style.position = "fixed"; fallback.style.opacity = "0";
      document.body.appendChild(fallback); fallback.select();
      const copied = document.execCommand("copy"); fallback.remove();
      setCopyState(copied ? "คัดลอกแล้ว" : "คัดลอกไม่สำเร็จ");
    }
    window.setTimeout(() => setCopyState(""), 1_800);
  };

  if (!analysis || !market) {
    return <><ServiceWorker onUpdateAvailable={() => setUpdateAvailable(true)} /><LoadingPanel />{error && <div className="boot-error" role="alert"><p>{error}</p><button onClick={() => requestAnalysis()}>ลองอีกครั้ง</button></div>}</>;
  }

  const plan = analysis.primaryPlan;
  const freshness = deriveMarketFreshness(market, clock);
  const age = marketAgeMs(market, clock);
  const expired = isPlanExpired(analysis.generatedAt, clock);
  const remaining = planRemainingMs(analysis.generatedAt, clock);
  const proximity = derivePlanPosition(market.price, plan);
  const effectiveAction = deriveSafeAction(analysis.action, freshness, expired, proximity.position);
  const planPositionLabel = {
    IN_ZONE: "IN ZONE · อยู่ในโซนเข้า", NEAR_ENTRY: `NEAR ENTRY · ห่าง $${proximity.distance.toFixed(1)}`,
    TOO_LATE: "TOO LATE · ห้ามไล่ราคา", INVALIDATED: "INVALIDATED · ยกเลิกแผน", WAIT: `WAIT · ห่าง $${proximity.distance.toFixed(1)}`
  }[proximity.position];
  const planText = `${plan.direction.toUpperCase()} ${analysis.symbol}\nEntry ${formatter.format(plan.entryZone[0])}–${formatter.format(plan.entryZone[1])}\nSL ${formatter.format(plan.stopLoss)}\nTP ${plan.takeProfit.map(formatter.format).join(" / ")}\nTrigger: ${plan.trigger}\nInvalidation: ${plan.invalidation}`;

  return (
    <>
      <ServiceWorker onUpdateAvailable={() => setUpdateAvailable(true)} />
      <header className="nav-term">
        <a className="nav-term__line" href="#top" aria-label="XAUWatch — กลับด้านบน"><span className="brand-mark" aria-hidden="true" /><strong>XAUWATCH</strong><small>DAY TRADE DESK</small></a>
        <div className="symbol-switch" role="group" aria-label="เลือกคู่เทรด">
          {(["XAUUSD", "BTCUSD"] as const).map((symbol) => <button key={symbol} type="button" aria-pressed={selectedSymbol === symbol} onClick={() => changeSymbol(symbol)}>{symbol.replace("USD", "")}</button>)}
        </div>
        <div className="nav-term__actions"><span className={`feed-state feed-state--${freshness.toLowerCase()}`}><span aria-hidden="true" />{freshness}</span><a className="nav-cta" href="#command">วิเคราะห์</a></div>
      </header>

      <main className="dashboard" id="top">
        {updateAvailable && <aside className="update-banner" role="status"><p><strong>มีเวอร์ชันใหม่พร้อมใช้</strong><span>รีโหลดเพื่อรับการแก้ไขล่าสุด</span></p><button onClick={() => window.location.reload()}>โหลดเวอร์ชันใหม่</button></aside>}

        <section className="market-hero" aria-labelledby="market-title">
          <div className="market-hero__quote"><p className="market-hero__symbol" id="market-title">{symbolLabel(market.symbol)}</p><p className="market-hero__price">{formatter.format(market.price)}</p><div className="market-hero__qualifier"><p className={`market-hero__change ${market.changePercent < 0 ? "negative" : "positive"}`}>{market.changePercent >= 0 ? "+" : ""}{market.changePercent.toFixed(2)}% วันนี้</p><p>{market.symbol === "BTCUSD" ? "ดอลลาร์สหรัฐต่อ Bitcoin" : "ดอลลาร์สหรัฐต่อออนซ์"}</p></div></div>
          <div className="market-hero__meta"><span>MARKET SNAPSHOT</span><dl><div><dt>OPEN</dt><dd>{formatter.format(market.open)}</dd></div><div><dt>HIGH</dt><dd>{formatter.format(market.high)}</dd></div><div><dt>LOW</dt><dd>{formatter.format(market.low)}</dd></div></dl><p><time dateTime={market.asOf}>{dateFormatter.format(new Date(market.asOf))}</time> · {market.source === "demo" ? "Demo" : "Twelve Data"}</p></div>
          <div className="market-controls">
            <div><span className={`freshness-badge freshness-badge--${freshness.toLowerCase()}`}>{freshness}</span><p>{formatAgeThai(age)} · เวลาไทย {timeFormatter.format(clock)}</p></div>
            <button type="button" onClick={() => { void requestMarket(); void requestChart(); }} disabled={marketRefreshing}>{marketRefreshing ? "กำลังรีเฟรช…" : "รีเฟรชราคา"}</button>
          </div>
        </section>

        {warning && <p className="system-warning" role="status">{warning}</p>}{error && <p className="system-error" role="alert">{error}</p>}

        <section className="decision-panel" aria-labelledby="decision-title">
          <div className="decision-panel__bias">
            <span id="decision-title">BIAS</span>
            <strong className={`signal signal--${analysis.bias.toLowerCase()}`}>{analysis.bias}</strong>
            <div className={`confidence-meter confidence-meter--${analysis.bias.toLowerCase()}`}>
              <div className="confidence-meter__label"><span>ความมั่นใจ</span><strong>{analysis.confidence}%</strong></div>
              <progress value={analysis.confidence} max="100" aria-label={`ความมั่นใจ ${analysis.confidence}%`}>{analysis.confidence}%</progress>
            </div>
          </div>
          <div className={`decision-panel__action action--${effectiveAction.toLowerCase()}`}><div><span>ACTION</span><strong>{actionText(effectiveAction)}</strong></div><p>{effectiveAction === analysis.action ? analysis.summary : `${analysis.summary} · ระบบพักแผนเพื่อความปลอดภัย`}</p></div>
        </section>

        <section className="timeframes" aria-label="แนวโน้มตามกรอบเวลา">{(["m5", "m15", "h1"] as const).map((frame) => <div key={frame}><span>{frame.toUpperCase()}</span><TrendMark trend={analysis.trend[frame]} /><strong>{analysis.trend[frame]}</strong></div>)}</section>

        <section className="chart-studio" aria-labelledby="chart-studio-title">
          <div className="section-heading chart-studio__heading"><div><h2 id="chart-studio-title">Chart Plan</h2><p>อัปโหลดกราฟเพื่อให้ AI อ่านภาพ แล้วเทียบกับข้อมูล M5 จริง</p></div><span className={visionUsed ? "vision-state vision-state--used" : "vision-state"}>{visionUsed ? "VISION USED" : "MARKET DATA"}</span></div>
          <div className="chart-studio__layout">
            <div className="chart-upload">
              <input ref={chartInputRef} id="chart-screenshot" className="chart-upload__input" type="file" accept="image/png,image/jpeg,image/webp" aria-label="อัปโหลด Screenshot กราฟ" disabled={chartStatus === "loading" || status === "loading"} onChange={(event) => void onChartImageChange(event)} />
              {chartImage ? (
                <figure className="chart-upload__preview">
                  <Image src={chartImage.dataUrl} width={chartImage.width} height={chartImage.height} sizes="(max-width: 639px) 100vw, 320px" alt={`Screenshot กราฟ ${chartImage.name}`} unoptimized />
                  <figcaption><strong>{chartImage.name}</strong><span>ใช้เป็นบริบท ไม่ใช้แทนราคาปัจจุบัน</span></figcaption>
                </figure>
              ) : (
                <label className="chart-upload__drop" htmlFor="chart-screenshot" data-state={chartStatus}>
                  <span aria-hidden="true">＋</span><strong>{chartStatus === "loading" ? "กำลังย่อภาพ…" : chartStatus === "error" ? "เลือกภาพใหม่" : "เลือก Screenshot กราฟ"}</strong><small>PNG, JPG หรือ WEBP · สูงสุด 12 MB</small>
                </label>
              )}
              <div className="chart-upload__controls">
                <label htmlFor="chart-timeframe">Timeframe<select id="chart-timeframe" value={chartTimeframe} data-state={chartStatus} onChange={(event) => setChartTimeframe(event.target.value as typeof chartTimeframe)}><option value="AUTO">Auto detect</option><option value="M5">M5</option><option value="M15">M15</option><option value="H1">H1</option></select></label>
                <div><label className="chart-upload__replace" htmlFor="chart-screenshot" data-state={chartStatus}>{chartImage ? "เปลี่ยนภาพ" : "เพิ่มภาพ"}</label>{chartImage && <button type="button" onClick={clearChartImage}>เอาภาพออก</button>}</div>
              </div>
              <button className="chart-upload__analyze" type="button" onClick={() => void requestAnalysis(`วิเคราะห์ ${selectedSymbol} จาก Screenshot และราคาล่าสุด เน้นแผนเข้า M5–M15`, true)} disabled={!chartImage || chartStatus === "loading" || status === "loading"} data-state={chartStatus} aria-describedby="chart-analysis-status">{chartStatus === "loading" && chartImage ? "กำลังอ่านกราฟ…" : chartStatus === "error" ? "ลองวิเคราะห์อีกครั้ง" : "วิเคราะห์จากภาพ"}</button>
              <p id="chart-analysis-status" className={`chart-upload__status ${chartStatus === "error" ? "chart-upload__status--error" : ""}`} data-state={chartStatus} role="status" aria-live="polite">{chartMessage || "ภาพจะถูกส่งให้ OpenAI เมื่อกดวิเคราะห์ และ XAUWatch ไม่บันทึกภาพลงฐานข้อมูล"}</p>
            </div>
            {chartSeries?.bars.length ? <PlanChart key={analysis.id} symbol={analysis.symbol} bars={chartSeries.bars} plan={plan} currentPrice={market.price} stale={chartSeries.stale} syncedAt={analysis.generatedAt} /> : <div className="chart-placeholder" aria-busy="true">กำลังเตรียมกราฟ M5…</div>}
          </div>
        </section>

        <div className="trade-grid">
          <section className="levels" id="levels" aria-labelledby="levels-title"><div className="section-heading"><h2 id="levels-title">ระดับตัดสินใจ</h2><p>ยึดราคาโบรกเกอร์เป็นหลัก</p></div><div className="levels__columns"><div className="levels__side levels__side--resistance"><h3>แนวต้าน</h3>{analysis.resistance.map((level, index) => <div key={`${level}-${index}`}><span>R{index + 1}</span><strong>{formatter.format(level)}</strong></div>)}</div><div className="levels__side levels__side--support"><h3>แนวรับ</h3>{analysis.support.map((level, index) => <div key={`${level}-${index}`}><span>S{index + 1}</span><strong>{formatter.format(level)}</strong></div>)}</div></div></section>

          <section className="plan" id="plan" aria-labelledby="plan-title">
            <div className="section-heading section-heading--plan"><div><h2 id="plan-title">แผนหลัก</h2><p>{planPositionLabel}</p></div><strong className={`plan-direction plan-direction--${plan.direction}`}>{plan.direction.toUpperCase()}</strong></div>
            <div className={`plan-validity ${expired ? "plan-validity--expired" : ""}`}><span>{expired ? "PLAN EXPIRED" : `เหลือ ${Math.ceil(remaining / 60_000)} นาที`}</span><time dateTime={analysis.generatedAt}>วิเคราะห์ {formatAgeThai(Math.max(0, clock - new Date(analysis.generatedAt).getTime()))}</time></div>
            <dl className="plan-grid">
              <div className="plan-grid__entry"><dt>ENTRY ZONE</dt><dd><button className="copy-value" onClick={() => void copyText(`${formatter.format(plan.entryZone[0])}–${formatter.format(plan.entryZone[1])}`)}>{formatter.format(plan.entryZone[0])}–{formatter.format(plan.entryZone[1])}</button></dd></div>
              <div className="plan-grid__sl"><dt>STOP LOSS</dt><dd><button className="copy-value" onClick={() => void copyText(String(plan.stopLoss))}>{formatter.format(plan.stopLoss)}</button></dd></div>
              {plan.takeProfit.map((target, index) => <div key={target}><dt>TP{index + 1}</dt><dd><button className="copy-value" onClick={() => void copyText(String(target))}>{formatter.format(target)}</button></dd></div>)}
            </dl>
            <div className="plan-notes"><p><span>Trigger</span>{plan.trigger}</p><p><span>Invalidation</span>{plan.invalidation}</p></div>
            <div className="plan-toolbar"><button type="button" onClick={() => void copyText(planText)}>คัดลอกแผน</button><button type="button" onClick={() => void requestAnalysis("เช็กแผนเดิมจากราคาล่าสุด")} disabled={status === "loading"}>{status === "loading" ? "กำลังวิเคราะห์…" : "วิเคราะห์ใหม่"}</button><span role="status">{copyState}</span></div>
          </section>
        </div>

        <div className="operations-grid">
          <section className="risk-calculator" aria-labelledby="risk-title">
            <div className="section-heading"><h2 id="risk-title">Risk Calculator</h2><p>คำนวณขนาดไม้จาก Stop จริง</p></div>
            <div className="risk-form">
              <label>Balance (USD)<input inputMode="decimal" value={balance} onChange={(event) => saveRiskPreference(event.target.value, riskPercent)} /></label>
              <label>Risk (%)<input inputMode="decimal" value={riskPercent} onChange={(event) => saveRiskPreference(balance, event.target.value)} /></label>
              <label>Entry<input inputMode="decimal" value={riskEntry} onChange={(event) => setRiskEntry(event.target.value)} /></label>
              <label>Stop Loss<input inputMode="decimal" value={riskStop} onChange={(event) => setRiskStop(event.target.value)} /></label>
            </div>
            {riskCalculation && <div className="risk-results" aria-live="polite"><dl><div><dt>RISK AMOUNT</dt><dd>{moneyFormatter.format(riskCalculation.riskAmount)}</dd></div><div><dt>STOP DISTANCE</dt><dd>${riskCalculation.stopDistance.toFixed(1)}</dd></div><div><dt>{analysis.symbol === "BTCUSD" ? "BTC QTY" : "LOT SIZE"}</dt><dd>{riskCalculation.valid ? riskCalculation.lotSize.toFixed(analysis.symbol === "BTCUSD" ? 4 : 2) : "—"}</dd></div><div><dt>EST. LOSS</dt><dd>{moneyFormatter.format(riskCalculation.estimatedLoss)}</dd></div></dl><p className={riskCalculation.error || riskCalculation.warning ? "risk-results__warning" : ""}>{riskCalculation.error || riskCalculation.warning || `R:R · TP1 ${riskCalculation.rewardRisk[0]}R · TP2 ${riskCalculation.rewardRisk[1]}R · TP3 ${riskCalculation.rewardRisk[2]}R`}</p></div>}
            <p className="calculator-note">{analysis.symbol === "BTCUSD" ? "ประมาณการแบบ spot-equivalent 1 BTC/contract — CFD ของแต่ละโบรกเกอร์มี contract size ต่างกัน ต้องตรวจ symbol specification ก่อนส่งคำสั่ง" : "ประมาณการด้วย XAUUSD 100 oz/lot และ lot step 0.01 — ตรวจ contract size กับโบรกเกอร์ก่อนส่งคำสั่ง"}</p>
          </section>

          <section className="alerts-panel" aria-labelledby="alerts-title">
            <div className="section-heading"><h2 id="alerts-title">Level Alerts</h2><p>ทำงานเมื่อ Dashboard เปิดอยู่</p></div>
            <label className="toggle alert-toggle"><input type="checkbox" checked={alertsEnabled} onChange={(event) => toggleAlerts(event.target.checked)} /> แจ้งเมื่อราคาเข้า Entry, TP หรือ Stop</label>
            {typeof window !== "undefined" && "Notification" in window && Notification.permission !== "granted" && <button className="notification-button" type="button" onClick={() => void requestNotifications()}>เปิด Browser Notification</button>}
            <div className="alert-rules">{alertRules.map((rule) => <p key={rule.id}><span className={`alert-kind alert-kind--${rule.kind}`}>{rule.kind.toUpperCase()}</span><strong>{rule.label}</strong><small>{rule.zone ? `${formatter.format(rule.zone[0])}–${formatter.format(rule.zone[1])}` : formatter.format(rule.level || 0)}</small></p>)}</div>
            <div className="alert-log"><h3>ล่าสุด</h3>{alertEvents.length ? alertEvents.map((item) => <p key={`${item.id}-${item.triggeredAt}`}><time dateTime={new Date(item.triggeredAt).toISOString()}>{timeFormatter.format(item.triggeredAt)}</time><span>{item.label}</span><strong>{formatter.format(item.price)}</strong></p>) : <p className="alert-empty">ยังไม่มีระดับที่ถูกแตะในรอบนี้</p>}</div>
          </section>
        </div>

        <section className="command" id="command" aria-labelledby="command-title"><div className="section-heading"><h2 id="command-title">ถามนักวิเคราะห์ {selectedSymbol}</h2><p>คำตอบใหม่จะอัปเดต Dashboard และแผนภาพอัตโนมัติ</p></div><form onSubmit={onSubmit}><label htmlFor="analysis-command">คำสั่ง</label><div className="command__field"><textarea id="analysis-command" value={message} onChange={(event) => setMessage(event.target.value)} rows={3} maxLength={500} aria-describedby="command-helper" /><button type="submit" disabled={status === "loading"} data-state={status}>{status === "loading" ? "กำลังวิเคราะห์…" : status === "error" ? "ลองใหม่" : "วิเคราะห์ตอนนี้"}</button></div><p id="command-helper" className="field-helper">AI จะได้รับ snapshot {selectedSymbol} ล่าสุด บริบทจากแผนก่อนหน้า{chartImage ? " และ Screenshot ที่เลือก" : ""}</p><div className="quick-actions" aria-label="คำสั่งด่วน"><button type="button" disabled={status === "loading"} onClick={() => { const prompt = `วิเคราะห์ ${selectedSymbol} ตอนนี้ เน้นเข้าเร็ว M5–M15`; setMessage(prompt); void requestAnalysis(prompt); }}>เข้าเร็ว</button><button type="button" disabled={status === "loading"} onClick={() => { const prompt = `เช็กแผน ${selectedSymbol} เดิมจากราคาล่าสุด`; setMessage(prompt); void requestAnalysis(prompt); }}>เช็กแผนเดิม</button></div></form></section>

        <details className="settings"><summary>Feed, access และการรีเฟรช</summary><div className="settings__body"><label htmlFor="manual-price">ราคาโบรกเกอร์ (เว้นว่างเพื่อใช้ feed)</label><input id="manual-price" inputMode="decimal" value={manualPrice} onChange={(event) => setManualPrice(event.target.value)} placeholder="เช่น 4040.2" /><label htmlFor="access-token">รหัส Dashboard</label><input id="access-token" type="password" value={accessToken} onChange={(event) => saveToken(event.target.value)} autoComplete="current-password" placeholder="กรอกเมื่อ server เปิดการป้องกัน" /><label className="toggle"><input type="checkbox" checked={autoRefresh} onChange={(event) => setAutoRefresh(event.target.checked)} /> ราคาใหม่ทุก 1 นาที / วิเคราะห์ทุก 5 นาที</label></div></details>

        <details className="history"><summary>ประวัติบทวิเคราะห์ <span>{history.length}</span></summary><div className="history__list">{history.length === 0 ? <p>ยังไม่มีประวัติ — วิเคราะห์ครั้งแรกเพื่อเริ่มบันทึก</p> : history.slice(0, 8).map((item) => <button key={item.id} type="button" onClick={() => setAnalysis(item)}><time dateTime={item.generatedAt}>{dateFormatter.format(new Date(item.generatedAt))}</time><strong className={`signal--${item.bias.toLowerCase()}`}>{item.bias}</strong><span>{item.action.replace("_", " ")}</span><b>{formatter.format(item.price)}</b></button>)}</div></details>

        <p className="risk-note">{analysis.riskNote}</p>
      </main>

      <footer className="foot-dense"><p><span>XAUWATCH v0.8 · {analysis.symbol} · {analysis.source.toUpperCase()} · DATA {freshness}</span><span>ไม่ใช่คำรับรองผลกำไร · ตรวจสอบราคา ข่าว และ contract size ก่อนส่งคำสั่งจริง</span></p></footer>
    </>
  );
}
