import type { TradePlan } from "./types";

export const XAUUSD_CONTRACT_SIZE = 100;
export const DEFAULT_LOT_STEP = 0.01;

export type RiskCalculation = {
  valid: boolean;
  error?: string;
  riskAmount: number;
  stopDistance: number;
  lotSize: number;
  estimatedLoss: number;
  rewardRisk: [number, number, number];
  warning?: string;
};

const round = (value: number, digits = 2) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

export function calculateXauRisk(input: {
  balance: number;
  riskPercent: number;
  entry: number;
  stopLoss: number;
  takeProfit: [number, number, number];
  contractSize?: number;
  lotStep?: number;
}): RiskCalculation {
  const contractSize = input.contractSize ?? XAUUSD_CONTRACT_SIZE;
  const lotStep = input.lotStep ?? DEFAULT_LOT_STEP;
  const values = [input.balance, input.riskPercent, input.entry, input.stopLoss, contractSize, lotStep];
  if (values.some((value) => !Number.isFinite(value) || value <= 0)) {
    return { valid: false, error: "กรอก Balance, Risk, Entry และ Stop Loss ให้เป็นตัวเลขมากกว่า 0", riskAmount: 0, stopDistance: 0, lotSize: 0, estimatedLoss: 0, rewardRisk: [0, 0, 0] };
  }

  const stopDistance = Math.abs(input.entry - input.stopLoss);
  if (stopDistance === 0) {
    return { valid: false, error: "Entry และ Stop Loss ต้องไม่เท่ากัน", riskAmount: 0, stopDistance: 0, lotSize: 0, estimatedLoss: 0, rewardRisk: [0, 0, 0] };
  }

  const riskAmount = input.balance * (input.riskPercent / 100);
  const rawLots = riskAmount / (stopDistance * contractSize);
  const lotSize = Math.max(0, Math.floor((rawLots + Number.EPSILON) / lotStep) * lotStep);
  const estimatedLoss = lotSize * stopDistance * contractSize;
  const rewardRisk = input.takeProfit.map((target) => round(Math.abs(target - input.entry) / stopDistance)) as [number, number, number];

  return {
    valid: lotSize >= lotStep,
    error: lotSize < lotStep ? `ความเสี่ยงต่ำกว่าขนาดขั้นต่ำ ${lotStep} — ลดระยะ Stop หรือใช้บัญชีที่รองรับขนาดเล็กกว่า` : undefined,
    riskAmount: round(riskAmount),
    stopDistance: round(stopDistance, 1),
    lotSize: round(lotSize),
    estimatedLoss: round(estimatedLoss),
    rewardRisk,
    warning: input.riskPercent > 1 ? "Risk มากกว่า 1% ต่อแผน" : undefined
  };
}

export function planMidpoint(plan: TradePlan) {
  return round((plan.entryZone[0] + plan.entryZone[1]) / 2, 1);
}
