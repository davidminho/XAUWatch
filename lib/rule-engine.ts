import type { Analysis, MarketSnapshot, Trend } from "./types";

const round = (value: number) => Math.round(value * 10) / 10;

export function createRuleAnalysis(market: MarketSnapshot): Analysis {
  const range = Math.max(market.high - market.low, 12);
  const location = (market.price - market.low) / range;
  const bearish = market.price < market.open;
  const bias = bearish ? "SELL" : "BUY";
  const nearEdge = location < 0.22 || location > 0.78;
  const trend: Trend = bearish ? "bearish" : "bullish";
  const step = Math.max(range * 0.14, 4.5);

  const resistance = [market.price + step, market.price + step * 2, market.high]
    .map(round)
    .sort((a, b) => a - b);
  const support = [market.price - step, market.price - step * 2, market.low]
    .map(round)
    .sort((a, b) => b - a);

  const sellEntry: [number, number] = [round(market.price + step * 0.8), round(market.price + step * 1.25)];
  const buyEntry: [number, number] = [round(market.price - step * 1.25), round(market.price - step * 0.8)];
  const direction = bearish ? "sell" : "buy";
  const entryZone = bearish ? sellEntry : buyEntry;
  const stopLoss = bearish ? round(entryZone[1] + step) : round(entryZone[0] - step);
  const takeProfit: [number, number, number] = bearish
    ? [round(market.price - step), round(market.price - step * 2), round(market.price - step * 3)]
    : [round(market.price + step), round(market.price + step * 2), round(market.price + step * 3)];

  return {
    id: crypto.randomUUID(),
    symbol: "XAUUSD",
    price: market.price,
    bias,
    action: market.stale || nearEdge ? "WAIT" : bearish ? "SELL_NOW" : "BUY_NOW",
    confidence: market.stale ? 42 : nearEdge ? 61 : 68,
    summary: market.stale
      ? "ข้อมูลตลาดยังไม่สด จึงพักแผนและรอราคาจริงก่อน"
      : nearEdge
        ? `${bias} bias แต่ราคาอยู่ใกล้ขอบกรอบ รอ trigger ก่อนเข้า`
        : `${bias} bias ตามโครงสร้างระหว่างวันและตำแหน่งราคาในกรอบ`,
    trend: { m5: trend, m15: trend, h1: bearish ? "bearish" : "neutral" },
    resistance,
    support,
    primaryPlan: {
      direction,
      entryZone,
      trigger: bearish ? "รอ M5 ปฏิเสธโซนเข้าและปิดกลับลง" : "รอ M5 ทำ Higher Low และปิดกลับขึ้น",
      stopLoss,
      takeProfit,
      invalidation: bearish ? `M15 ปิดเหนือ ${round(stopLoss)}` : `M15 ปิดต่ำกว่า ${round(stopLoss)}`
    },
    riskNote: "Demo rule engine: เสี่ยงไม่เกิน 0.5% ต่อแผน และห้ามใช้แทนข้อมูลโบรกเกอร์จริง",
    generatedAt: new Date().toISOString(),
    source: "rule-engine"
  };
}
