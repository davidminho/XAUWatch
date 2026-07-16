"use client";

import { useMemo, useRef, useState } from "react";
import type { Candle, TradePlan } from "@/lib/types";

type PlanChartProps = {
  bars: Candle[];
  plan: TradePlan;
  currentPrice: number;
  stale: boolean;
};

const WIDTH = 640;
const HEIGHT = 360;
const PLOT = { top: 24, right: 82, bottom: 42, left: 20 };
const formatPrice = (value: number) => value.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export default function PlanChart({ bars, plan, currentPrice, stale }: PlanChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [exportState, setExportState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const chart = useMemo(() => {
    const visibleBars = bars.slice(-72);
    const levels = [
      plan.entryZone[0], plan.entryZone[1], plan.stopLoss,
      ...plan.takeProfit, currentPrice,
      ...visibleBars.flatMap((bar) => [bar.high, bar.low])
    ];
    const rawMin = Math.min(...levels);
    const rawMax = Math.max(...levels);
    const padding = Math.max((rawMax - rawMin) * 0.08, 2);
    const min = rawMin - padding;
    const max = rawMax + padding;
    const plotWidth = WIDTH - PLOT.left - PLOT.right;
    const plotHeight = HEIGHT - PLOT.top - PLOT.bottom;
    const x = (index: number) => PLOT.left + ((index + 0.5) / Math.max(visibleBars.length, 1)) * plotWidth;
    const y = (price: number) => PLOT.top + ((max - price) / Math.max(max - min, 1)) * plotHeight;
    const candleWidth = Math.max(2.5, Math.min(8, (plotWidth / Math.max(visibleBars.length, 1)) * 0.62));
    const grid = Array.from({ length: 5 }, (_, index) => {
      const price = max - ((max - min) * index) / 4;
      return { price, y: y(price) };
    });
    return { visibleBars, x, y, candleWidth, grid, plotWidth, plotHeight };
  }, [bars, currentPrice, plan]);

  const overlays = [
    { label: "SL", price: plan.stopLoss, kind: "sl" },
    ...plan.takeProfit.map((price, index) => ({ label: `TP${index + 1}`, price, kind: "tp" })),
    { label: "NOW", price: currentPrice, kind: "current" }
  ];

  const exportPng = async () => {
    const svg = svgRef.current;
    if (!svg) return;
    setExportState("loading");
    try {
      const clone = svg.cloneNode(true) as SVGSVGElement;
      clone.setAttribute("width", String(WIDTH * 2));
      clone.setAttribute("height", String(HEIGHT * 2));
      const rootStyle = getComputedStyle(document.documentElement);
      const token = (name: string) => rootStyle.getPropertyValue(name).trim();
      const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
      style.textContent = `
        .chart-bg{fill:${token("--color-paper-2")}}.chart-grid{stroke:${token("--color-rule")};stroke-width:1}
        .chart-axis{fill:${token("--color-muted")};font-size:17px}.chart-axis--end{text-anchor:end}
        .chart-up{fill:${token("--color-buy")};stroke:${token("--color-buy")}}
        .chart-down{fill:${token("--color-sell")};stroke:${token("--color-sell")}}
        .chart-up line,.chart-down line{stroke-width:1.25}.chart-entry{fill:${token("--color-accent")};opacity:.12}
        .chart-entry-edge{stroke:${token("--color-accent")};stroke-width:1.25;stroke-dasharray:6 4}
        .chart-entry-label{fill:${token("--color-accent")};font-size:18px}
        .chart-sl{stroke:${token("--color-sell")};fill:${token("--color-sell")}}
        .chart-tp{stroke:${token("--color-buy")};fill:${token("--color-buy")}}
        .chart-current{stroke:${token("--color-wait")};fill:${token("--color-wait")}}
        .chart-sl line,.chart-tp line,.chart-current line{stroke-width:1.25;stroke-dasharray:8 5}
        .chart-sl text,.chart-tp text,.chart-current text{font-size:18px;stroke:none}
        text{font-family:ui-sans-serif,sans-serif}`;
      clone.prepend(style);
      const xml = new XMLSerializer().serializeToString(clone);
      const blob = new Blob([xml], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const image = new Image();
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("render failed"));
        image.src = url;
      });
      const canvas = document.createElement("canvas");
      canvas.width = WIDTH * 2;
      canvas.height = HEIGHT * 2;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("canvas unavailable");
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      const png = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("export failed")), "image/png"));
      const downloadUrl = URL.createObjectURL(png);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = `xauwatch-plan-${new Date().toISOString().slice(0, 16).replaceAll(":", "-")}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1_000);
      setExportState("success");
      window.setTimeout(() => setExportState("idle"), 1_800);
    } catch {
      setExportState("error");
    }
  };

  return (
    <figure className="plan-chart">
      <svg ref={svgRef} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-labelledby="plan-chart-title plan-chart-desc">
        <title id="plan-chart-title">กราฟ XAUUSD M5 พร้อมแผน {plan.direction.toUpperCase()}</title>
        <desc id="plan-chart-desc">แท่งเทียนล่าสุดพร้อม Entry zone, Stop Loss, Take Profit สามระดับ และราคาปัจจุบัน</desc>
        <rect className="chart-bg" width={WIDTH} height={HEIGHT} />
        {chart.grid.map((line) => <g key={line.price}><line className="chart-grid" x1={PLOT.left} x2={WIDTH - PLOT.right} y1={line.y} y2={line.y} /><text className="chart-axis" x={WIDTH - PLOT.right + 10} y={line.y + 5}>{formatPrice(line.price)}</text></g>)}
        <rect className="chart-entry" x={PLOT.left} y={chart.y(Math.max(...plan.entryZone))} width={chart.plotWidth} height={Math.max(2, Math.abs(chart.y(plan.entryZone[0]) - chart.y(plan.entryZone[1])))} />
        <line className="chart-entry-edge" x1={PLOT.left} x2={WIDTH - PLOT.right} y1={chart.y(plan.entryZone[0])} y2={chart.y(plan.entryZone[0])} />
        <line className="chart-entry-edge" x1={PLOT.left} x2={WIDTH - PLOT.right} y1={chart.y(plan.entryZone[1])} y2={chart.y(plan.entryZone[1])} />
        <text className="chart-entry-label" x={PLOT.left + 8} y={chart.y(Math.max(...plan.entryZone)) + 18}>ENTRY {formatPrice(plan.entryZone[0])}–{formatPrice(plan.entryZone[1])}</text>
        {chart.visibleBars.map((bar, index) => {
          const x = chart.x(index);
          const up = bar.close >= bar.open;
          const yOpen = chart.y(bar.open);
          const yClose = chart.y(bar.close);
          return <g key={bar.time} className={up ? "chart-up" : "chart-down"}><line x1={x} x2={x} y1={chart.y(bar.high)} y2={chart.y(bar.low)} /><rect x={x - chart.candleWidth / 2} y={Math.min(yOpen, yClose)} width={chart.candleWidth} height={Math.max(1.5, Math.abs(yOpen - yClose))} /></g>;
        })}
        {overlays.map((overlay) => <g key={overlay.label} className={`chart-${overlay.kind}`}><line x1={PLOT.left} x2={WIDTH - PLOT.right} y1={chart.y(overlay.price)} y2={chart.y(overlay.price)} /><text x={WIDTH - PLOT.right - 8} y={chart.y(overlay.price) - 6} textAnchor="end">{overlay.label}</text></g>)}
        <text className="chart-axis" x={PLOT.left} y={HEIGHT - 14}>M5 · {chart.visibleBars.length} BARS</text>
        <text className="chart-axis chart-axis--end" x={WIDTH - PLOT.right} y={HEIGHT - 14}>{stale ? "DATA STALE" : "LIVE FEED"}</text>
      </svg>
      <figcaption>
        <div className="chart-legend" aria-label="คำอธิบายกราฟ"><span className="chart-legend__entry">Entry</span><span className="chart-legend__sl">SL</span><span className="chart-legend__tp">TP</span></div>
        <button type="button" onClick={() => void exportPng()} disabled={exportState === "loading"} data-state={exportState}>{exportState === "loading" ? "กำลังสร้างภาพ…" : exportState === "success" ? "บันทึกแล้ว" : exportState === "error" ? "ลองบันทึกใหม่" : "บันทึกภาพแผน"}</button>
      </figcaption>
    </figure>
  );
}
