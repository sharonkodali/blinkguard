'use client';
import { useRef, useEffect, useState, useCallback } from 'react';
import StatusPanel from '@/components/StatusPanel';
import AlertBanner from '@/components/AlertBanner';
import AgentPanel from '@/components/AgentPanel';
import NearbyStopsCard from '@/components/NearbyStopsCard';
import { fetchSessionSummaryAI, type SessionSummaryAI } from '@/lib/agents';
import { computeEAR, computeMAR, isEyeClosed, isYawning, getDrowsinessState, FRAMES_DANGER } from '@/lib/drowsiness';
import type { DrowsinessState } from '@/lib/drowsiness';

const LEFT_EYE_IDX  = [33,7,163,144,145,153,154,155,133,246,161,160,159,158,157,173];
const RIGHT_EYE_IDX = [362,382,381,380,374,373,390,249,263,466,388,387,386,385,384,398];

type MainTab = 'live' | 'summary';

function formatHMS(totalSec: number) {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function Monitor() {
  const videoRef  = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [isStarted,       setIsStarted]       = useState(false);
  const [mainTab,         setMainTab]         = useState<MainTab>('live');
  const [ear,             setEar]             = useState(0);
  const [closedFrames,    setClosedFrames]    = useState(0);
  const [drowsinessState, setDrowsinessState] = useState<DrowsinessState>('awake');
  const [faceDetected,    setFaceDetected]    = useState(false);
  const [alertCount,      setAlertCount]      = useState(0);
  const [sessionTime,     setSessionTime]     = useState(0);
  const [earSamples,      setEarSamples]      = useState(0);
  const [earSum,          setEarSum]          = useState(0);
  const [eclipseSoft,     setEclipseSoft]     = useState(false);
  const [summaryAi,       setSummaryAi]       = useState<SessionSummaryAI | null>(null);
  const [summaryAiLoading, setSummaryAiLoading] = useState(false);

  const closedRef      = useRef(0);
  const alertCooling   = useRef(false);
  const lastAlertTime  = useRef(0);
  const prevMainTabRef = useRef<MainTab>(mainTab);
  const summaryStatsRef = useRef({ sessionTime: 0, alertCount: 0, earSum: 0, earSamples: 0 });
  summaryStatsRef.current = { sessionTime, alertCount, earSum, earSamples };

  useEffect(() => {
    if (!isStarted) return;
    const id = setInterval(() => setSessionTime(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [isStarted]);

  useEffect(() => {
    document.documentElement.dataset.eclipseSoft = eclipseSoft ? 'true' : 'false';
    return () => { delete document.documentElement.dataset.eclipseSoft; };
  }, [eclipseSoft]);

  useEffect(() => {
    const enteredSummary = mainTab === 'summary' && prevMainTabRef.current !== 'summary';
    prevMainTabRef.current = mainTab;
    if (!enteredSummary || !isStarted) return;

    let cancelled = false;
    setSummaryAiLoading(true);
    const { sessionTime: sec, alertCount: ac, earSum: es, earSamples: esmp } = summaryStatsRef.current;
    const ae = esmp > 0 ? es / esmp : 0;
    const sc = Math.max(0, Math.min(100, 100 - ac * 6));

    fetchSessionSummaryAI({
      sessionSeconds: sec,
      alertCount: ac,
      avgEar: ae,
      safetyScore: sc,
    })
      .then((data) => {
        if (!cancelled) setSummaryAi(data);
      })
      .finally(() => {
        if (!cancelled) setSummaryAiLoading(false);
      });

    return () => { cancelled = true; };
  }, [mainTab, isStarted]);

  const triggerAlert = useCallback(() => {
    const now = Date.now();
    if (alertCooling.current || now - lastAlertTime.current < 5000) return;
    alertCooling.current = true;
    lastAlertTime.current = now;
    setAlertCount(c => c + 1);
    if (navigator.vibrate) navigator.vibrate([600, 150, 600, 150, 600]);
    setTimeout(() => { alertCooling.current = false; }, 3500);
  }, []);

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      if (!videoRef.current) return;
      videoRef.current.srcObject = stream;
      videoRef.current.onloadedmetadata = async () => {
        if (!videoRef.current) return;
        try {
          await videoRef.current.play();
          setIsStarted(true);
          setMainTab('live');
          setTimeout(() => runMediaPipe(), 100);
        } catch (e) { console.error('Play error:', e); }
      };
    } catch {
      alert('Camera permission denied. Please allow camera access and reload.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runMediaPipe is declared below
  }, []);

  const runMediaPipe = useCallback(async () => {
    try {
      const { FaceMesh, FACEMESH_TESSELATION } = await import('@mediapipe/face_mesh');
      const { Camera }         = await import('@mediapipe/camera_utils');
      const { drawConnectors } = await import('@mediapipe/drawing_utils');

      const faceMesh = new FaceMesh({
        locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4/${file}`,
      });
      faceMesh.setOptions({ maxNumFaces: 1, refineLandmarks: true, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });

      faceMesh.onResults((results: { multiFaceLandmarks?: Array<Array<{ x: number; y: number; z?: number }>> }) => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        canvas.width  = video.videoWidth  || 640;
        canvas.height = video.videoHeight || 480;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (!results.multiFaceLandmarks?.length) {
          setFaceDetected(false); closedRef.current = 0;
          setClosedFrames(0); setDrowsinessState('awake');
          return;
        }

        setFaceDetected(true);
        const lm = results.multiFaceLandmarks[0];
        try {
          const currentEAR = computeEAR(lm);
          const currentMAR = computeMAR(lm);
          setEar(parseFloat(currentEAR.toFixed(3)));
          setEarSum(prev => prev + currentEAR);
          setEarSamples(n => n + 1);

          closedRef.current = isEyeClosed(currentEAR)
            ? Math.min(closedRef.current + 1, FRAMES_DANGER + 5)
            : Math.max(0, closedRef.current - 2);
          setClosedFrames(closedRef.current);

          const state = getDrowsinessState(closedRef.current, isYawning(currentMAR));
          setDrowsinessState(state);
          if (state === 'danger') triggerAlert();

          drawConnectors(ctx, lm, FACEMESH_TESSELATION, { color: 'rgba(134,134,172,0.07)', lineWidth: 0.5 });

          const eyeColor = isEyeClosed(currentEAR) ? 'rgba(196,178,200,0.95)' : 'rgba(134,134,172,0.9)';
          ctx.fillStyle = eyeColor;
          for (const idx of [...LEFT_EYE_IDX, ...RIGHT_EYE_IDX]) {
            if (!lm[idx]) continue;
            ctx.beginPath();
            ctx.arc(lm[idx].x * canvas.width, lm[idx].y * canvas.height, 2.5, 0, 2 * Math.PI);
            ctx.fill();
          }

          if (isYawning(currentMAR)) {
            ctx.strokeStyle = 'rgba(134,134,172,0.75)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            if (lm[13]) ctx.arc(lm[13].x * canvas.width, lm[13].y * canvas.height, 14, 0, 2 * Math.PI);
            ctx.stroke();
          }
        } catch (e) { console.error('Landmark error:', e); setFaceDetected(false); }
      });

      if (videoRef.current) {
        const cam = new Camera(videoRef.current, {
          onFrame: async () => { if (videoRef.current) await faceMesh.send({ image: videoRef.current }); },
          width: 640, height: 480,
        });
        cam.start();
      }
    } catch (e) { console.error('MediaPipe init error:', e); alert('Failed to initialize face detection. Please refresh.'); }
  }, [triggerAlert]);

  const s = drowsinessState;
  const navNormalActive = mainTab === 'live' && s === 'awake';
  const navDrowsyActive = mainTab === 'live' && s !== 'awake';
  const navSummaryActive = mainTab === 'summary';

  const avgEar = earSamples > 0 ? earSum / earSamples : 0;
  const safetyScore = Math.max(0, Math.min(100, 100 - alertCount * 6));
  const summaryStatus =
    safetyScore > 65 ? 'Good' : safetyScore > 35 ? 'Caution' : 'Rest recommended';

  const newSession = () => {
    setIsStarted(false);
    setSessionTime(0);
    setAlertCount(0);
    setEarSamples(0);
    setEarSum(0);
    setEar(0);
    setClosedFrames(0);
    setDrowsinessState('awake');
    setMainTab('live');
    setSummaryAi(null);
    setSummaryAiLoading(false);
    if (videoRef.current?.srcObject) {
      const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
      tracks.forEach(t => t.stop());
      videoRef.current.srcObject = null;
    }
  };

  return (
    <>
      <style>{`
        .mon { min-height: 100vh; display: flex; flex-direction: column; background: var(--bg); color: var(--text); overflow: hidden; }

        .mon-top {
          flex-shrink: 0; display: flex; align-items: center; justify-content: center;
          padding: 14px 20px 10px; gap: 16px;
        }
        .mon-nav {
          display: inline-flex; align-items: center; padding: 4px;
          border-radius: var(--radius-pill); border: 1px solid var(--border);
          background: rgba(39, 39, 87, 0.35); gap: 2px;
        }
        .mon-nav-btn {
          border: none; cursor: pointer; font-family: inherit; font-size: 0.72rem; font-weight: 500;
          padding: 8px 16px; border-radius: var(--radius-pill); color: var(--text-muted);
          background: transparent; transition: background 0.2s, color 0.2s;
        }
        .mon-nav-btn:hover { color: var(--text); background: var(--accent-muted); }
        .mon-nav-btn.on { background: var(--slate); color: var(--text); box-shadow: var(--shadow-card); }
        .mon-nav-btn.summary-active { background: var(--blue-soft); color: var(--bg); }
        .mon-theme {
          width: 40px; height: 40px; border-radius: var(--radius-sm); border: 1px solid var(--border);
          background: var(--surface); color: var(--text-muted); cursor: pointer; display: flex;
          align-items: center; justify-content: center; font-size: 1rem; transition: border-color 0.2s, color 0.2s;
        }
        .mon-theme:hover { border-color: var(--border-strong); color: var(--text); }

        .mon-body { flex: 1; display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(300px, 0.85fr); gap: 20px; padding: 0 20px 20px; min-height: 0; overflow: hidden; }
        @media (max-width: 960px) {
          .mon-body { grid-template-columns: 1fr; overflow-y: auto; }
        }

        .mon-cam-col { display: flex; flex-direction: column; gap: 14px; min-width: 0; min-height: 0; }
        .mon-cam-wrap {
          position: relative; flex: 1; min-height: 280px; border-radius: var(--radius);
          overflow: hidden; border: 1px solid var(--border); background: var(--surface);
          transition: border-color 0.35s, box-shadow 0.35s;
        }
        .mon-cam-wrap.cam-awake   { border-color: rgba(134, 134, 172, 0.25); }
        .mon-cam-wrap.cam-warning { border-color: rgba(80, 80, 129, 0.7); box-shadow: 0 0 0 1px rgba(80, 80, 129, 0.25); }
        .mon-cam-wrap.cam-danger  { border-color: rgba(134, 134, 172, 0.5); box-shadow: 0 0 0 1px rgba(134, 134, 172, 0.15); }

        .mon-cam-placeholder { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; }
        .mon-cam-placeholder-icon { font-size: 2.5rem; opacity: 0.35; color: var(--text-muted); }
        .mon-cam-placeholder-text { font-size: 0.8rem; color: var(--text-faint); }

        .mon-badge-tl {
          position: absolute; top: 14px; left: 14px; z-index: 2;
          font-size: 0.62rem; font-weight: 700; letter-spacing: 0.12em;
          padding: 6px 12px; border-radius: var(--radius-pill);
          border: 1px solid var(--border-strong); backdrop-filter: blur(10px);
          background: rgba(15, 14, 71, 0.72); color: var(--blue-soft);
        }
        .mon-badge-tl.warn { color: var(--text-muted); border-color: rgba(80, 80, 129, 0.5); }
        .mon-badge-tl.danger { color: var(--text); border-color: rgba(134, 134, 172, 0.4); }

        .mon-badge-tr {
          position: absolute; top: 14px; right: 14px; z-index: 2;
          display: flex; align-items: center; gap: 8px;
          padding: 6px 12px; border-radius: var(--radius-pill);
          border: 1px solid var(--border); background: rgba(15, 14, 71, 0.65);
          backdrop-filter: blur(10px); font-size: 0.68rem; font-family: 'JetBrains Mono', monospace;
          color: var(--text-muted);
        }
        .mon-dot { width: 6px; height: 6px; border-radius: 99px; background: var(--blue-soft); opacity: 0.9; }
        .mon-dot.off { background: var(--slate); opacity: 0.6; }
        .mon-eye-ic { font-size: 0.75rem; opacity: 0.85; }

        .mon-start-btn {
          padding: 12px 20px; border-radius: var(--radius-sm); font-size: 0.82rem; font-weight: 600;
          cursor: pointer; border: 1px solid var(--border-strong); background: var(--slate); color: var(--text);
          letter-spacing: 0.03em; transition: opacity 0.2s, border-color 0.2s;
        }
        .mon-start-btn:hover { border-color: var(--blue-soft); opacity: 0.95; }

        .mon-side { display: flex; flex-direction: column; gap: 12px; overflow-y: auto; min-height: 0; padding-bottom: 8px; }

        .mon-idle {
          flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
          gap: 10px; text-align: center; border: 1px dashed var(--border); border-radius: var(--radius); min-height: 200px;
        }
        .mon-idle-icon { font-size: 2rem; opacity: 0.25; color: var(--text-muted); }
        .mon-idle-text { font-size: 0.78rem; color: var(--text-faint); max-width: 240px; line-height: 1.6; }

        .mon-summary { display: flex; flex-direction: column; gap: 14px; }
        .mon-sum-title { font-size: 1.35rem; font-weight: 600; letter-spacing: -0.03em; color: var(--text); margin: 4px 0 0; }
        .mon-sum-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
        .mon-sum-card {
          background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-sm);
          padding: 14px 12px; text-align: center; box-shadow: var(--shadow-card);
        }
        .mon-sum-card-l { font-size: 0.52rem; color: var(--text-faint); letter-spacing: 0.12em; margin-bottom: 8px; }
        .mon-sum-card-v { font-size: 1rem; font-weight: 600; font-family: 'JetBrains Mono', monospace; color: var(--text); }
        .mon-sum-rec {
          background: var(--surface-inner); border: 1px solid var(--border); border-radius: var(--radius);
          padding: 16px 18px; box-shadow: var(--shadow-card);
        }
        .mon-sum-rec h3 { font-size: 0.58rem; letter-spacing: 0.14em; color: var(--text-faint); margin: 0 0 12px; font-weight: 600; }
        .mon-sum-rec ul { margin: 0; padding-left: 1.1rem; color: var(--text-muted); font-size: 0.78rem; line-height: 1.65; }
        .mon-sum-btn {
          width: 100%; padding: 14px; border-radius: var(--radius-sm); border: 1px solid var(--border-strong);
          background: var(--slate); color: var(--text); font-size: 0.85rem; font-weight: 600; cursor: pointer;
          font-family: inherit; transition: border-color 0.2s, opacity 0.2s;
        }
        .mon-sum-btn:hover { border-color: var(--blue-soft); }

        .mon-sum-ai { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px 18px; box-shadow: var(--shadow-card); }
        .mon-sum-ai-label { font-size: 0.52rem; letter-spacing: 0.14em; color: var(--text-faint); margin-bottom: 8px; font-weight: 600; }
        .mon-sum-ai-headline { font-size: 1rem; font-weight: 600; color: var(--text); line-height: 1.35; margin: 0 0 12px; }
        .mon-sum-ai-tips { margin: 0; padding-left: 1.1rem; color: var(--text-muted); font-size: 0.78rem; line-height: 1.65; }
        .mon-sum-ai-close { font-size: 0.76rem; color: var(--blue-soft); margin-top: 14px; line-height: 1.5; }
        .mon-sum-ai-loading { font-size: 0.78rem; color: var(--text-faint); }
      `}</style>

      <div className="mon">
        <div className="mon-top">
          <nav className="mon-nav" aria-label="View">
            <button
              type="button"
              className={`mon-nav-btn ${navNormalActive ? 'on' : ''}`}
              onClick={() => setMainTab('live')}
            >
              Normal
            </button>
            <button
              type="button"
              className={`mon-nav-btn ${navDrowsyActive ? 'on' : ''}`}
              onClick={() => setMainTab('live')}
            >
              Drowsy alert
            </button>
            <button
              type="button"
              className={`mon-nav-btn ${navSummaryActive ? 'summary-active' : ''}`}
              onClick={() => setMainTab('summary')}
            >
              Summary
            </button>
          </nav>
          <button
            type="button"
            className="mon-theme"
            title={eclipseSoft ? 'Deeper midnight' : 'Softer background'}
            aria-pressed={eclipseSoft}
            aria-label="Toggle background contrast"
            onClick={() => setEclipseSoft(s => !s)}
          >
            ☾
          </button>
        </div>

        <div className="mon-body">
          <div className="mon-cam-col">
            <div className={`mon-cam-wrap ${isStarted && mainTab === 'live' ? `cam-${s}` : ''}`}>
              {!isStarted && (
                <div className="mon-cam-placeholder">
                  <div className="mon-cam-placeholder-icon">◉</div>
                  <div className="mon-cam-placeholder-text">Start monitoring to show your camera feed</div>
                </div>
              )}
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className={`mirror absolute inset-0 w-full h-full object-cover ${isStarted ? 'block' : 'hidden'}`}
              />
              <canvas
                ref={canvasRef}
                className={`mirror absolute inset-0 w-full h-full ${isStarted ? 'block' : 'hidden'}`}
              />
              {isStarted && mainTab === 'live' && (
                <>
                  <div className={`mon-badge-tl ${s === 'warning' ? 'warn' : ''} ${s === 'danger' ? 'danger' : ''}`}>
                    {s === 'awake' ? 'AWAKE' : s === 'warning' ? 'DROWSY' : 'CRITICAL'}
                  </div>
                  <div className="mon-badge-tr">
                    <span>{formatHMS(sessionTime)}</span>
                    <span className={`mon-dot ${faceDetected ? '' : 'off'}`} title={faceDetected ? 'Tracking' : 'No face'} />
                    <span className="mon-eye-ic" aria-hidden>👁</span>
                  </div>
                </>
              )}
              {isStarted && mainTab === 'summary' && (
                <div className="mon-cam-placeholder">
                  <div className="mon-cam-placeholder-icon">▣</div>
                  <div className="mon-cam-placeholder-text">Session paused in summary view</div>
                </div>
              )}
            </div>
            {!isStarted && (
              <button type="button" className="mon-start-btn" onClick={startCamera}>
                Start monitoring
              </button>
            )}
          </div>

          <div className="mon-side">
            {mainTab === 'summary' ? (
              <div className="mon-summary">
                <h2 className="mon-sum-title">Drive summary</h2>
                <div className="sp-score" style={{ margin: 0, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '20px', boxShadow: 'var(--shadow-card)' }}>
                  <svg width="72" height="72" viewBox="0 0 64 64" aria-hidden>
                    <circle cx="32" cy="32" r="26" fill="none" stroke="rgba(80,80,129,0.35)" strokeWidth="5" />
                    <circle
                      cx="32"
                      cy="32"
                      r="26"
                      fill="none"
                      stroke="var(--blue-soft)"
                      strokeWidth="5"
                      strokeLinecap="round"
                      transform="rotate(-90 32 32)"
                      strokeDasharray={isStarted ? `${(safetyScore / 100) * 163.4} 163.4` : '0 163.4'}
                    />
                    <text x="32" y="36" textAnchor="middle" fontSize="13" fontWeight="600" fill="var(--text)">{isStarted ? safetyScore : '—'}</text>
                  </svg>
                  <div>
                    <p style={{ fontSize: '0.54rem', letterSpacing: '0.12em', color: 'var(--text-faint)', margin: '0 0 6px' }}>SAFETY STATUS</p>
                    <p style={{ fontSize: '1.05rem', fontWeight: 600, margin: 0, color: 'var(--text)' }}>{isStarted ? summaryStatus : 'No session'}</p>
                  </div>
                </div>
                <div className="mon-sum-grid">
                  <div className="mon-sum-card">
                    <div className="mon-sum-card-l">DURATION</div>
                    <div className="mon-sum-card-v" style={{ color: 'var(--blue-soft)' }}>{isStarted ? formatHMS(sessionTime) : '—'}</div>
                  </div>
                  <div className="mon-sum-card">
                    <div className="mon-sum-card-l">ALERTS</div>
                    <div className="mon-sum-card-v">{isStarted ? alertCount : '—'}</div>
                  </div>
                  <div className="mon-sum-card">
                    <div className="mon-sum-card-l">AVG EAR</div>
                    <div className="mon-sum-card-v">{isStarted && earSamples > 0 ? avgEar.toFixed(2) : '—'}</div>
                  </div>
                </div>
                {isStarted && (
                  <div className="mon-sum-ai">
                    <div className="mon-sum-ai-label">AI SESSION BRIEF</div>
                    {summaryAiLoading && (
                      <p className="mon-sum-ai-loading">Generating your summary…</p>
                    )}
                    {!summaryAiLoading && summaryAi && (
                      <>
                        <p className="mon-sum-ai-headline">{summaryAi.headline}</p>
                        <ul className="mon-sum-ai-tips">
                          {summaryAi.tips.map((t, i) => (
                            <li key={i}>{t}</li>
                          ))}
                        </ul>
                        <p className="mon-sum-ai-close">{summaryAi.closingLine}</p>
                      </>
                    )}
                    {!summaryAiLoading && !summaryAi && (
                      <p className="mon-sum-ai-loading">Open Summary again to load AI insights.</p>
                    )}
                  </div>
                )}
                {isStarted && (
                  <div style={{ marginTop: 4 }}>
                    <NearbyStopsCard />
                  </div>
                )}
                <div className="mon-sum-rec">
                  <h3>Recommendations</h3>
                  <ul>
                    <li>Take a short break every two hours on long drives.</li>
                    <li>If alerts repeat, pull over when it is safe and rest before continuing.</li>
                    <li>Keep the camera framed on your face for reliable readings.</li>
                  </ul>
                </div>
                <button
                  type="button"
                  className="mon-sum-btn"
                  onClick={() => (isStarted ? newSession() : setMainTab('live'))}
                >
                  {isStarted ? 'Start new session' : 'Back to live view'}
                </button>
              </div>
            ) : isStarted ? (
              <>
                <StatusPanel
                  ear={ear}
                  closedFrames={closedFrames}
                  drowsinessState={drowsinessState}
                  faceDetected={faceDetected}
                  alertCount={alertCount}
                  sessionTime={sessionTime}
                />
                <AgentPanel isDrowsy={drowsinessState === 'danger'} alertCount={alertCount} />
              </>
            ) : (
              <div className="mon-idle">
                <div className="mon-idle-icon">◇</div>
                <div className="mon-idle-text">Start the camera to see live metrics, safety status, and AI agents.</div>
              </div>
            )}
          </div>
        </div>
      </div>

      <AlertBanner drowsinessState={drowsinessState} />
    </>
  );
}
