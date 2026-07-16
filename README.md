# XAUWatch

Android-first XAUUSD day-trade Dashboard. It keeps `Bias`, `Action`, and `Trigger` separate so a bearish market can still say `WAIT` when price is sitting on support.

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
- `TWELVE_DATA_SYMBOL`: defaults to `XAU/USD`
- `DASHBOARD_ACCESS_TOKEN`: optional shared secret sent from the Dashboard settings panel

Never expose provider keys with a `NEXT_PUBLIC_` prefix.

## Checks

```bash
npm run typecheck
npm run test
npm run build
npm audit
```

The software is decision support, not automated trading or a guarantee of profit. Confirm prices, spreads, news, and orders with the broker used for execution.
