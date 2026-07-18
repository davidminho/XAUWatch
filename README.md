# XAUWatch

Android-first XAUUSD and BTCUSD day-trade Dashboard. It keeps `Bias`, `Action`, and `Trigger` separate so a bearish market can still say `WAIT` when price is sitting on support.

## v0.8 Terminal Neon interface

- Cool navy trading-console surfaces with a restrained cyan signal rail and technical grid
- Phosphor green BUY, hot red SELL, and amber WAIT states with accessible contrast
- Sharper modular cards, monospaced price/level labels, and focused signal glows
- Responsive price scaling with no horizontal overflow from 320px through desktop
- Matching PWA theme and app icons, with all market, Vision, and analysis flows unchanged

## v0.7 multi-symbol and automatic chart sync

- Switch between XAUUSD and BTCUSD without mixing prices, AI context, screenshots, or history
- Refresh the M5 candle series and remount Entry/SL/TP overlays after every new analysis
- Show the latest `SYNCED` timestamp directly below the generated plan chart
- Use Twelve Data `XAU/USD` and `BTC/USD` feeds through the same server-only API key

## v0.6 chart vision and visual plans

Patch v0.6.1 adds visible image-analysis loading/error/retry feedback, a mobile image-decoding fallback, smaller upload payloads, and one automatic retry when an older AI conversation context cannot be reused.

- Upload a PNG, JPG, or WEBP chart screenshot from Android
- Client-side resize before the image is sent to OpenAI Vision
- Optional M5/M15/H1 timeframe hint with market snapshot as the price authority
- Live/demo M5 OHLC endpoint and an accessible SVG candlestick chart
- Entry zone, Stop Loss, TP1–TP3, and current-price overlays
- One-tap PNG export of the visual trade plan
- Screenshot data is sent only with an explicit analysis request and is not persisted by XAUWatch

## v0.5 decision-safety layer

- Live data age with `LIVE`, `DELAYED`, `STALE`, and `DEMO` states
- Automatic `WAIT` when market data is unsafe, a plan is expired, or price is already too late
- 30-minute plan validity and live Entry proximity (`IN ZONE`, `NEAR ENTRY`, `TOO LATE`, `INVALIDATED`)
- XAUUSD lot sizing and BTCUSD spot-equivalent sizing from balance, risk percentage, entry, and stop loss
- Client-side Entry/TP/Stop alerts with five-minute cooldown and optional Browser Notifications
- One-tap copy for Entry, SL, TP, and the complete plan
- PWA update-available banner instead of a silent stale app shell

Level alerts require the Dashboard to remain open. Background push while the app is closed is intentionally deferred beyond v0.5.

## Run locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`. Without keys the app intentionally uses a clearly labelled stale demo feed and deterministic rule engine.

## Production variables

- `OPENAI_API_KEY`: server-side OpenAI key
- `OPENAI_MODEL`: defaults to `gpt-5.6-terra`
- `TWELVE_DATA_API_KEY`: server-side market feed key
- `TWELVE_DATA_XAU_SYMBOL`: defaults to `XAU/USD` (`TWELVE_DATA_SYMBOL` remains a backward-compatible override)
- `TWELVE_DATA_BTC_SYMBOL`: defaults to `BTC/USD`
- `DASHBOARD_ACCESS_TOKEN`: optional shared secret sent from the Dashboard settings panel

Never expose provider keys with a `NEXT_PUBLIC_` prefix.

## Checks

```bash
npm run typecheck
npm run test
npm run build
npm audit
```

Vision can misread low-resolution chart labels, so live market data remains the price authority and unclear images should result in `WAIT`. The risk calculator assumes 100 oz per XAUUSD lot; BTCUSD is shown as a 1 BTC spot-equivalent quantity. Broker CFD contract sizes vary, so verify the symbol specification before execution. The software is decision support, not automated trading or a guarantee of profit. Confirm prices, spreads, news, and orders with the broker used for execution.
