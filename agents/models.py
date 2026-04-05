"""
Pydantic/uAgents message schemas for the BlinkGuard safety agent layer.

These mirror `lib/safety-types.ts` on the frontend 1:1. Keep them in sync.

Design note — multimodal extensibility (req #6):
`TelemetryEvent.signals` is a list of `Signal` objects keyed by `kind`. Adding
a new input (head nodding, gaze drift, steering entropy…) means adding a new
kind string and emitting it from the client — the agent reads signals by key,
so no schema change is required when new inputs appear.
"""

from __future__ import annotations

from typing import List, Literal, Optional

from uagents import Model


AlertLevel = Literal["none", "gentle", "warning", "critical"]
DrowsinessState = Literal["awake", "warning", "danger"]
SignalKind = Literal[
    "ear",
    "mar",
    "closed_frames",
    "blink_rate",
    "head_nod",
    "gaze_drift",
    "yawn",
]


class Signal(Model):
    kind: SignalKind
    value: float
    confidence: Optional[float] = None


class TelemetryEvent(Model):
    """One sample produced by the vision pipeline (or the mock generator)."""

    sessionId: str
    timestamp: int  # epoch ms from the client
    state: DrowsinessState
    signals: List[Signal]
    calibrated: bool


class Incident(Model):
    id: str
    timestamp: int
    severity: AlertLevel
    score: float
    reason: str
    message: str


class SafetyDecision(Model):
    """Structured decision returned by SafetyOrchestratorAgent."""

    alertLevel: AlertLevel
    recommendation: str
    coachingTip: Optional[str] = None
    tripScore: int
    predictedRisk: float
    predictedTrend: Literal["improving", "stable", "rising", "critical"]
    incidents: List[Incident]
    calibrated: bool
    source: Literal["uagents", "mock"] = "uagents"


class CalibrationEvent(Model):
    sessionId: str
    timestamp: int
    earThreshold: float
    marThreshold: float


class Ack(Model):
    ok: bool
    message: str = ""


# ── Pull-over spot recommendation ────────────────────────────────────────────

class PulloverSpot(Model):
    name: str
    address: str
    type: str          # "gas_station" | "rest_stop" | "parking" | "other"
    distanceMeters: float
    lat: float
    lng: float


class PulloverRequest(Model):
    lat: float
    lng: float
    alertLevel: AlertLevel


class PulloverResponse(Model):
    spots: List[PulloverSpot]
    source: Literal["uagents", "mock"] = "uagents"
