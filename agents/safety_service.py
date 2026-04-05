"""
BlinkGuard safety agent service — Fetch.ai uAgents entrypoint.

Architecture
------------
One Bureau runs three agents on localhost:

  SafetyOrchestratorAgent  — accepts telemetry via REST, owns session memory,
                             produces SafetyDecision responses. This is the
                             single agent the frontend ever talks to.

  AlertAgent               — helper; the orchestrator sends it escalation
                             notifications so a future extension can drive
                             external channels (SMS, push, voice) without
                             touching the orchestrator.

  ScoringAgent             — helper; receives incidents and can persist
                             aggregate trip scores. Kept as a separate agent
                             to demonstrate inter-agent messaging patterns
                             on the Fetch.ai network.

For the local hackathon demo, REST is sufficient — no mailbox / proxy needed.
If you later want to expose this on the public Fetch.ai network, register the
agent with Agentverse and enable the mailbox; the handler code below does not
need to change.

Run:
    cd agents && pip install -r requirements.txt
    python safety_service.py
"""

from __future__ import annotations

import os
from typing import Optional

from uagents import Agent, Bureau, Context

from logic import (
    fetch_pullover_spots,
    get_or_create_session,
    reset_session,
    run_safety_decision,
)
from models import (
    Ack,
    CalibrationEvent,
    Incident,
    PulloverRequest,
    PulloverResponse,
    PulloverSpot,
    SafetyDecision,
    TelemetryEvent,
)


# ─── Config ────────────────────────────────────────────────────────────────
ORCH_PORT = int(os.environ.get("BLINKGUARD_ORCH_PORT", "8100"))
ORCH_SEED = os.environ.get(
    "BLINKGUARD_ORCH_SEED", "blinkguard-safety-orchestrator-seed-v1"
)
ALERT_SEED = os.environ.get(
    "BLINKGUARD_ALERT_SEED", "blinkguard-alert-agent-seed-v1"
)
SCORING_SEED = os.environ.get(
    "BLINKGUARD_SCORING_SEED", "blinkguard-scoring-agent-seed-v1"
)


# ─── Agents ────────────────────────────────────────────────────────────────
# The orchestrator is the only agent that exposes REST — it's the single entry
# point for the Next.js bridge. Endpoint is listening on ORCH_PORT.
safety_orchestrator = Agent(
    name="SafetyOrchestratorAgent",
    seed=ORCH_SEED,
    port=ORCH_PORT,
    endpoint=[f"http://127.0.0.1:{ORCH_PORT}/submit"],
)

# Helper agents — they don't need REST, they receive messages from the
# orchestrator over the uAgents bus.
alert_agent = Agent(name="AlertAgent", seed=ALERT_SEED)
scoring_agent = Agent(name="ScoringAgent", seed=SCORING_SEED)


# ─── REST endpoints (telemetry + calibration + reset) ───────────────────────
@safety_orchestrator.on_rest_post("/telemetry", TelemetryEvent, SafetyDecision)
async def on_telemetry(ctx: Context, req: TelemetryEvent) -> SafetyDecision:
    """
    Main loop: the frontend POSTs a TelemetryEvent every ~2s while the camera
    is running. We update that session's rolling memory, produce a structured
    decision, and forward the outcome to the helper agents.
    """
    memory = get_or_create_session(req.sessionId)
    decision = run_safety_decision(memory, req)

    ctx.logger.info(
        f"[{req.sessionId[:8]}] state={req.state} "
        f"→ level={decision.alertLevel} score={decision.tripScore} "
        f"risk={decision.predictedRisk} ({decision.predictedTrend})"
    )

    # Fan-out to helper agents. Failure here must not break the REST response,
    # so we swallow and log — this is the right posture for a hackathon demo.
    try:
        if decision.alertLevel in ("warning", "critical"):
            await ctx.send(alert_agent.address, decision)
        if decision.incidents:
            await ctx.send(scoring_agent.address, decision.incidents[0])
    except Exception as exc:  # noqa: BLE001
        ctx.logger.warning(f"helper-agent fan-out failed: {exc}")

    return decision


@safety_orchestrator.on_rest_post("/calibration", CalibrationEvent, Ack)
async def on_calibration(ctx: Context, req: CalibrationEvent) -> Ack:
    """
    Personalized baseline ping (req #4). The agent doesn't actually use the
    numbers directly — the client-side thresholds already gate state machine
    output — but storing them here lets the orchestrator log that a trip was
    running on a calibrated profile, which strengthens the "calibrated" flag
    on returned decisions and is available for future baseline-aware logic.
    """
    memory = get_or_create_session(req.sessionId)
    # Stash as attributes on the memory object — free-form for now.
    memory.ear_threshold = req.earThreshold  # type: ignore[attr-defined]
    memory.mar_threshold = req.marThreshold  # type: ignore[attr-defined]
    ctx.logger.info(
        f"[{req.sessionId[:8]}] calibrated EAR={req.earThreshold:.3f} "
        f"MAR={req.marThreshold:.3f}"
    )
    return Ack(ok=True, message="calibration stored")


@safety_orchestrator.on_rest_post("/pullover", PulloverRequest, PulloverResponse)
async def on_pullover(ctx: Context, req: PulloverRequest) -> PulloverResponse:
    """
    Return nearby safe pullover locations for the driver's current coordinates.
    Called by the frontend when a warning or danger alert fires. Uses Google
    Places Nearby Search when GOOGLE_MAPS_API_KEY is set; returns mock data
    otherwise so the demo always has something useful to show.
    """
    import asyncio

    loop = asyncio.get_event_loop()
    spots_data = await loop.run_in_executor(
        None, fetch_pullover_spots, req.lat, req.lng
    )
    spots = [PulloverSpot(**s) for s in spots_data]
    ctx.logger.info(
        f"PulloverAgent: ({req.lat:.4f},{req.lng:.4f}) level={req.alertLevel} "
        f"→ {len(spots)} spots"
    )
    return PulloverResponse(spots=spots, source="uagents")


@safety_orchestrator.on_rest_post("/reset", CalibrationEvent, Ack)
async def on_reset(ctx: Context, req: CalibrationEvent) -> Ack:
    """Wipes per-session memory — call at trip start to guarantee a clean slate."""
    reset_session(req.sessionId)
    ctx.logger.info(f"[{req.sessionId[:8]}] session reset")
    return Ack(ok=True, message="reset")


# ─── Helper agent handlers ─────────────────────────────────────────────────
@alert_agent.on_message(model=SafetyDecision)
async def handle_alert(ctx: Context, sender: str, msg: SafetyDecision) -> None:
    """
    Placeholder for external alerting channels. Today this only logs — plug
    Twilio / FCM / webhook calls in here. Kept as a separate agent so a
    teammate can own it without touching the orchestrator.
    """
    ctx.logger.info(
        f"AlertAgent ← {msg.alertLevel.upper()} | score={msg.tripScore} | "
        f"{msg.recommendation}"
    )


@scoring_agent.on_message(model=Incident)
async def handle_incident(ctx: Context, sender: str, msg: Incident) -> None:
    """
    Stub for durable incident persistence. For a hackathon this just logs;
    a real deployment would write to Postgres / S3 / Agentverse storage.
    """
    ctx.logger.info(
        f"ScoringAgent ← incident {msg.id} severity={msg.severity} "
        f"reason={msg.reason}"
    )


# ─── Startup log so you know everything came up ────────────────────────────
@safety_orchestrator.on_event("startup")
async def _orch_startup(ctx: Context) -> None:
    ctx.logger.info(f"SafetyOrchestratorAgent listening on :{ORCH_PORT}")
    ctx.logger.info(f"  address = {safety_orchestrator.address}")
    ctx.logger.info(f"  POST http://127.0.0.1:{ORCH_PORT}/telemetry")


# ─── Bureau — runs all three agents in one process ─────────────────────────
# The Bureau owns the REST server (it overrides per-agent endpoints), so we
# must configure *its* port to match BLINKGUARD_ORCH_PORT — otherwise requests
# to /telemetry hit a closed socket.
bureau = Bureau(
    port=ORCH_PORT,
    endpoint=[f"http://127.0.0.1:{ORCH_PORT}/submit"],
)
bureau.add(safety_orchestrator)
bureau.add(alert_agent)
bureau.add(scoring_agent)


if __name__ == "__main__":
    bureau.run()
