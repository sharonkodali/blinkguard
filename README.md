This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Fetch.ai safety agent (uAgents)

BlinkGuard's drowsiness pipeline posts telemetry to a Fetch.ai `uAgents` service that acts
as an adaptive safety coach. The orchestrator escalates alerts based on recent history,
logs incidents with severity + reasons, tracks a rolling trip safety score, and runs a
lightweight predictive fatigue model.

### Architecture

```text
/monitor (MediaPipe EAR/MAR)
   │  telemetry every 2s
   ▼
/api/safety  (Next.js bridge)
   │  HTTP POST
   ▼
SafetyOrchestratorAgent  ── ctx.send ──▶ AlertAgent, ScoringAgent
   (agents/safety_service.py, port 8100)
```

If the Python service is unreachable, `/api/safety` transparently falls back to the
TypeScript mock in [lib/safety-logic.ts](lib/safety-logic.ts) — the same decision logic
ported to TS — so the demo works offline. The HUD shows a **Mock mode** vs
**Fetch.ai live** badge so it's obvious which backend is serving each response.

### Run the Python agent service

```bash
cd agents
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # seeds + port
python safety_service.py      # starts Bureau on :8100
```

Then in a second terminal run the Next.js app:

```bash
npm run dev
```

Open `http://localhost:3000/monitor`, click **Start monitoring**, and the HUD should
flip from "Mock mode" to "Fetch.ai live" within ~2 seconds.

### Environment variables

- `SAFETY_AGENT_URL` — URL the Next.js bridge posts to. Default `http://127.0.0.1:8100/telemetry`.
- `BLINKGUARD_ORCH_SEED` / `BLINKGUARD_ALERT_SEED` / `BLINKGUARD_SCORING_SEED` — deterministic uAgents seeds.
- `BLINKGUARD_ORCH_PORT` — REST port for the orchestrator (default `8100`).

### What is real vs mocked

| Layer | Real | Mocked |
| ---- | ---- | ---- |
| MediaPipe EAR/MAR telemetry | ✅ live from webcam | — |
| uAgents orchestrator/bureau | ✅ real `Agent` + `Bureau` + `on_rest_post` | — |
| Alert / Scoring agents | ✅ real `Agent`s, fan-out via `ctx.send` | bodies are local stubs |
| Decision logic | ✅ runs inside the orchestrator | same logic ported to TS as fallback |
| Predictive fatigue | ✅ linear-regression over closed-frame window | — |

### Future improvements

- Move session memory from in-process to Redis / a uAgents storage backend.
- Real inter-agent messaging: have AlertAgent push to a driver's phone / SMS endpoint,
  ScoringAgent publish rolling averages to a dashboard agent.
- Add vision signals (yawn cadence, head-nod, gaze drift) as additional `SignalKind`s —
  the shared event schema already supports them.
- Train a small on-device model for the predictive head instead of the current heuristic.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
