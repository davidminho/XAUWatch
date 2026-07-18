import { z } from "zod";

const numberTuple = z.tuple([z.number(), z.number()]);
const targetTuple = z.tuple([z.number(), z.number(), z.number()]);

export const analysisSchema = z.object({
  symbol: z.enum(["XAUUSD", "BTCUSD"]),
  price: z.number(),
  bias: z.enum(["BUY", "SELL", "NEUTRAL"]),
  action: z.enum(["BUY_NOW", "SELL_NOW", "WAIT"]),
  confidence: z.number().min(0).max(100),
  summary: z.string().min(1),
  trend: z.object({
    m5: z.enum(["bullish", "bearish", "neutral"]),
    m15: z.enum(["bullish", "bearish", "neutral"]),
    h1: z.enum(["bullish", "bearish", "neutral"])
  }),
  resistance: z.array(z.number()).min(2).max(5),
  support: z.array(z.number()).min(2).max(5),
  primaryPlan: z.object({
    direction: z.enum(["buy", "sell"]),
    entryZone: numberTuple,
    trigger: z.string().min(1),
    stopLoss: z.number(),
    takeProfit: targetTuple,
    invalidation: z.string().min(1)
  }),
  riskNote: z.string().min(1)
});

export const analysisJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["symbol", "price", "bias", "action", "confidence", "summary", "trend", "resistance", "support", "primaryPlan", "riskNote"],
  properties: {
    symbol: { type: "string", enum: ["XAUUSD", "BTCUSD"] },
    price: { type: "number" },
    bias: { type: "string", enum: ["BUY", "SELL", "NEUTRAL"] },
    action: { type: "string", enum: ["BUY_NOW", "SELL_NOW", "WAIT"] },
    confidence: { type: "number", minimum: 0, maximum: 100 },
    summary: { type: "string" },
    trend: {
      type: "object",
      additionalProperties: false,
      required: ["m5", "m15", "h1"],
      properties: {
        m5: { type: "string", enum: ["bullish", "bearish", "neutral"] },
        m15: { type: "string", enum: ["bullish", "bearish", "neutral"] },
        h1: { type: "string", enum: ["bullish", "bearish", "neutral"] }
      }
    },
    resistance: { type: "array", items: { type: "number" }, minItems: 2, maxItems: 5 },
    support: { type: "array", items: { type: "number" }, minItems: 2, maxItems: 5 },
    primaryPlan: {
      type: "object",
      additionalProperties: false,
      required: ["direction", "entryZone", "trigger", "stopLoss", "takeProfit", "invalidation"],
      properties: {
        direction: { type: "string", enum: ["buy", "sell"] },
        entryZone: { type: "array", items: { type: "number" }, minItems: 2, maxItems: 2 },
        trigger: { type: "string" },
        stopLoss: { type: "number" },
        takeProfit: { type: "array", items: { type: "number" }, minItems: 3, maxItems: 3 },
        invalidation: { type: "string" }
      }
    },
    riskNote: { type: "string" }
  }
} as const;
