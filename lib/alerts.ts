import type { TradePlan } from "./types";

export const ALERT_COOLDOWN_MS = 5 * 60_000;

export type PlanAlertRule = {
  id: string;
  kind: "entry" | "tp" | "stop";
  label: string;
  mode: "zone" | "above" | "below";
  level?: number;
  zone?: [number, number];
};

export type TriggeredPlanAlert = PlanAlertRule & { price: number; triggeredAt: number };

export function buildPlanAlertRules(planId: string, plan: TradePlan): PlanAlertRule[] {
  const low = Math.min(...plan.entryZone);
  const high = Math.max(...plan.entryZone);
  const upward = plan.direction === "buy";
  return [
    { id: `${planId}:entry`, kind: "entry", label: "ราคาเข้า Entry zone", mode: "zone", zone: [low, high] },
    ...plan.takeProfit.map((level, index) => ({
      id: `${planId}:tp${index + 1}`,
      kind: "tp" as const,
      label: `ราคาแตะ TP${index + 1}`,
      mode: upward ? "above" as const : "below" as const,
      level
    })),
    {
      id: `${planId}:stop`,
      kind: "stop",
      label: "ราคาแตะ Stop / Invalidation",
      mode: upward ? "below" : "above",
      level: plan.stopLoss
    }
  ];
}

function crossed(rule: PlanAlertRule, previousPrice: number, price: number) {
  if (rule.mode === "zone" && rule.zone) {
    const [low, high] = rule.zone;
    const wasInside = previousPrice >= low && previousPrice <= high;
    const isInside = price >= low && price <= high;
    return !wasInside && isInside;
  }
  if (rule.level === undefined) return false;
  if (rule.mode === "above") return previousPrice < rule.level && price >= rule.level;
  return previousPrice > rule.level && price <= rule.level;
}

export function evaluatePlanAlerts(input: {
  rules: PlanAlertRule[];
  previousPrice: number;
  price: number;
  lastTriggered: Record<string, number>;
  now?: number;
  cooldownMs?: number;
}) {
  const now = input.now ?? Date.now();
  const cooldown = input.cooldownMs ?? ALERT_COOLDOWN_MS;
  const nextTriggered = { ...input.lastTriggered };
  const triggered: TriggeredPlanAlert[] = [];

  for (const rule of input.rules) {
    const last = input.lastTriggered[rule.id] ?? 0;
    if (!crossed(rule, input.previousPrice, input.price) || now - last < cooldown) continue;
    nextTriggered[rule.id] = now;
    triggered.push({ ...rule, price: input.price, triggeredAt: now });
  }

  return { triggered, lastTriggered: nextTriggered };
}
