"""Unit tests for the SafetyOrchestratorAgent decision core (agents/logic.py)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Optional

import pytest

import logic
from logic import (
    FRAMES_DANGER,
    SessionMemory,
    compute_trip_score,
    escalate,
    get_or_create_session,
    recommend,
    reset_session,
    run_safety_decision,
)
from models import Incident, Signal, TelemetryEvent

T0 = 1_700_000_000_000
SCENARIOS = Path(__file__).resolve().parents[2] / "fixtures" / "safety-scenarios.json"


def event(
    t: int,
    state: str,
    closed: float = 0,
    blink: Optional[float] = None,
    calibrated: bool = True,
) -> TelemetryEvent:
    signals = [Signal(kind="closed_frames", value=closed)]
    if blink is not None:
        signals.append(Signal(kind="blink_rate", value=blink))
    return TelemetryEvent(
        sessionId="trip-1",
        timestamp=T0 + t,
        state=state,
        signals=signals,
        calibrated=calibrated,
    )


def feed(memory: SessionMemory, events):
    decision = None
    for ev in events:
        decision = run_safety_decision(memory, ev)
    return decision


@pytest.fixture
def mem() -> SessionMemory:
    return SessionMemory(session_id="trip-1")


# ─── Alert escalation ──────────────────────────────────────────────────────
class TestEscalation:
    def test_alert_driver_gets_no_alert(self, mem):
        d = run_safety_decision(mem, event(0, "awake"))
        assert d.alertLevel == "none"
        assert d.tripScore == 100
        assert d.incidents == []
        assert d.source == "uagents"

    def test_danger_is_critical(self, mem):
        d = run_safety_decision(mem, event(0, "danger", closed=40))
        assert d.alertLevel == "critical"
        assert "Pull over" in d.recommendation

    def test_repeated_warnings_escalate(self, mem):
        levels = [
            run_safety_decision(mem, event(i * 2000, "warning", closed=16)).alertLevel
            for i in range(3)
        ]
        assert levels == ["gentle", "gentle", "warning"]

    def test_old_warnings_fall_out_of_the_window(self, mem):
        run_safety_decision(mem, event(0, "warning", closed=16))
        run_safety_decision(mem, event(2000, "warning", closed=16))
        d = run_safety_decision(mem, event(120_000, "warning", closed=16))
        assert d.alertLevel == "gentle"
        assert len(mem.events) == 1

    def test_low_blink_rate_needs_history(self, mem):
        mem.events = [event(i * 1000, "awake") for i in range(4)]
        assert escalate(mem, event(5000, "awake", blink=10)) == "none"
        mem.events.append(event(4000, "awake"))
        assert escalate(mem, event(5000, "awake", blink=10)) == "gentle"

    @pytest.mark.parametrize("blink", [0, 12, 20])
    def test_normal_or_missing_blink_rate_is_ignored(self, mem, blink):
        mem.events = [event(i * 1000, "awake") for i in range(5)]
        assert escalate(mem, event(6000, "awake", blink=blink)) == "none"


# ─── Recommendations ───────────────────────────────────────────────────────
class TestRecommend:
    def test_warning_tip_depends_on_trend(self):
        _, rising = recommend("warning", "rising")
        _, stable = recommend("warning", "stable")
        assert "climbing" in rising
        assert rising != stable

    def test_none_level_praises_improvement(self):
        assert recommend("none", "improving")[0] == "Nice — alertness improving."
        assert recommend("none", "stable")[0] == "You are alert. Keep it up."


# ─── Incidents & trip score ────────────────────────────────────────────────
class TestIncidents:
    def test_critical_incident_is_logged(self, mem):
        d = run_safety_decision(mem, event(0, "danger", closed=40))
        assert len(d.incidents) == 1
        inc = d.incidents[0]
        assert inc.id == "trip-1:1"
        assert inc.severity == "critical"
        assert inc.reason == "sustained_closed_eyes"
        assert inc.score == 40
        assert d.tripScore == 82

    def test_gentle_alerts_are_not_logged(self, mem):
        d = run_safety_decision(mem, event(0, "warning", closed=16))
        assert d.incidents == []

    def test_incidents_are_debounced(self, mem):
        run_safety_decision(mem, event(0, "danger", closed=40))
        assert len(run_safety_decision(mem, event(3000, "danger", closed=40)).incidents) == 1
        d = run_safety_decision(mem, event(4000, "danger", closed=40))
        assert [i.id for i in d.incidents] == ["trip-1:2", "trip-1:1"]

    def test_incidents_are_capped_at_50(self, mem):
        for i in range(60):
            run_safety_decision(mem, event(i * 5000, "danger", closed=40))
        assert len(mem.incidents) == 50
        assert mem.incident_counter == 60

    def test_trip_score_weights_and_floor(self, mem):
        def inc(sev):
            return Incident(id="x", timestamp=0, severity=sev, score=0, reason="r", message="m")

        mem.incidents = [inc("critical"), inc("warning"), inc("gentle")]
        assert compute_trip_score(mem) == 100 - 18 - 8 - 3
        mem.incidents = [inc("critical")] * 10
        assert compute_trip_score(mem) == 0


# ─── Predictive fatigue (linear regression) ────────────────────────────────
class TestPredict:
    def test_needs_four_samples(self, mem):
        d = feed(mem, [event(i * 1000, "awake", closed=i * 10) for i in range(3)])
        assert (d.predictedRisk, d.predictedTrend) == (0.0, "stable")

    def test_rising_slope_projects_ten_seconds_ahead(self, mem):
        d = feed(mem, [event(i * 1000, "awake", closed=i) for i in range(4)])
        assert d.predictedTrend == "rising"
        assert d.predictedRisk == round(13 / FRAMES_DANGER, 2)

    def test_projection_past_danger_is_critical(self, mem):
        d = feed(mem, [event(i * 1000, "awake", closed=i * 3) for i in range(4)])
        assert (d.predictedRisk, d.predictedTrend) == (1.0, "critical")

    def test_falling_slope_is_improving(self, mem):
        d = feed(mem, [event(i * 1000, "awake", closed=6 - 2 * i) for i in range(4)])
        assert (d.predictedRisk, d.predictedTrend) == (0.0, "improving")

    def test_blink_collapse_raises_risk(self, mem):
        d = feed(mem, [event(i * 1000, "awake", blink=5) for i in range(4)])
        assert (d.predictedRisk, d.predictedTrend) == (0.75, "rising")

    def test_only_last_20_seconds_count(self, mem):
        old = [event(i * 1000, "awake", closed=i * 10) for i in range(4)]
        recent = [event(30_000 + i * 1000, "awake", closed=2) for i in range(4)]
        d = feed(mem, old + recent)
        assert d.predictedTrend == "stable"


# ─── Session registry ──────────────────────────────────────────────────────
def test_session_registry_reuses_and_resets():
    a = get_or_create_session("registry-test")
    assert get_or_create_session("registry-test") is a
    reset_session("registry-test")
    assert get_or_create_session("registry-test") is not a
    reset_session("registry-test")


# ─── Pull-over spots ───────────────────────────────────────────────────────
def test_haversine_one_degree_latitude():
    assert logic._haversine_m(0, 0, 1, 0) == pytest.approx(111_195, rel=1e-3)
    assert logic._haversine_m(32.88, -117.23, 32.88, -117.23) == 0


def test_pullover_falls_back_to_mock_without_api_key(monkeypatch):
    monkeypatch.setattr(logic, "_PLACES_KEY", "")
    spots = logic.fetch_pullover_spots(32.88, -117.23)
    assert len(spots) == 3
    assert [s["distanceMeters"] for s in spots] == sorted(s["distanceMeters"] for s in spots)
    assert {s["type"] for s in spots} == {"rest_stop", "gas_station", "parking"}


# ─── Parity with lib/safety-logic.ts ───────────────────────────────────────
_scenarios = json.loads(SCENARIOS.read_text())["scenarios"]


@pytest.mark.parametrize("scenario", _scenarios, ids=[s["name"] for s in _scenarios])
def test_shared_scenarios_match_typescript(scenario):
    mem = SessionMemory(session_id="trip-1")
    d = feed(
        mem,
        [event(e["t"], e["state"], closed=e["closed"], blink=e.get("blink")) for e in scenario["events"]],
    )
    assert {
        "alertLevel": d.alertLevel,
        "tripScore": d.tripScore,
        "predictedRisk": d.predictedRisk,
        "predictedTrend": d.predictedTrend,
        "incidentReasons": [i.reason for i in d.incidents],
    } == scenario["expected"]
