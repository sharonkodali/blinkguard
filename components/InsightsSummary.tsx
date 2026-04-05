'use client';
import { useEffect, useState } from 'react';

interface Insights {
  overallRisk: 'low' | 'moderate' | 'high' | 'critical';
  trend: 'improving' | 'stable' | 'declining';
  mainIssues: string[];
  recommendations: string[];
  drivingAdvice: string;
  nextSteps: string;
}

interface InsightsProps {
  sessionCount: number;
}

export default function InsightsSummary({ sessionCount }: InsightsProps) {
  const [insights, setInsights] = useState<Insights | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchInsights() {
      try {
        if (typeof window === 'undefined') {
          setLoading(false);
          return;
        }

        // Lazy load sessions from storage
        const stored = localStorage.getItem('blinkguard_sessions');
        const sessions = stored ? JSON.parse(stored) : [];

        const response = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessions }),
        });

        if (!response.ok) throw new Error('Failed to analyze patterns');

        const data = (await response.json()) as Insights;
        setInsights(data);
      } catch (err) {
        // Error handled gracefully, show fallback
        console.error('Failed to analyze patterns:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchInsights();
  }, [sessionCount]);

  if (loading) {
    return (
      <div className="insights-loading">
        <div className="insights-spinner" />
        <p>Analyzing your drowsiness patterns...</p>
      </div>
    );
  }

  if (!insights) return null;

  const trendLabel = {
    improving: '📈 Getting better',
    stable: '➡️ Stable',
    declining: '📉 Getting worse',
  }[insights.trend];

  return (
    <>
      <style>{`
        .insights { background: var(--surface2); border-radius: var(--radius); padding: 24px; margin-bottom: 32px; border: 1px solid var(--border); }
        .insights-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
        .insights-title { font-size: 1.125rem; font-weight: 700; color: var(--text); }
        .insights-badge { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 6px; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }
        .insights-badge-critical { background: rgba(248, 113, 113, 0.15); color: var(--red); }
        .insights-badge-high { background: rgba(251, 191, 36, 0.15); color: var(--amber); }
        .insights-badge-moderate { background: rgba(134, 134, 172, 0.15); color: var(--blue-soft); }
        .insights-badge-low { background: rgba(96, 165, 250, 0.15); color: #60a5fa; }
        
        .insights-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px; }
        .insights-card { background: rgba(0, 0, 0, 0.3); padding: 12px; border-radius: 8px; border: 1px solid var(--border); }
        .insights-label { font-size: 0.7rem; text-transform: uppercase; color: var(--text-muted); font-weight: 600; letter-spacing: 0.04em; margin-bottom: 4px; }
        .insights-value { font-size: 0.95rem; font-weight: 600; color: var(--text); }
        
        .insights-section { margin-bottom: 16px; }
        .insights-section-title { font-size: 0.85rem; font-weight: 700; color: var(--blue-soft); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px; }
        .insights-list { display: flex; flex-direction: column; gap: 6px; }
        .insights-item { font-size: 0.8rem; color: var(--text-muted); line-height: 1.5; padding-left: 20px; position: relative; }
        .insights-item::before { content: '•'; position: absolute; left: 6px; color: var(--blue-soft); font-weight: 700; }
        
        .insights-advice { background: rgba(134, 134, 172, 0.1); border-left: 3px solid var(--blue-soft); padding: 12px; border-radius: 4px; font-size: 0.8rem; color: var(--text-muted); line-height: 1.6; margin-bottom: 12px; }
        .insights-next { background: rgba(248, 113, 113, 0.08); border-left: 3px solid var(--red); padding: 12px; border-radius: 4px; font-size: 0.75rem; color: var(--text-faint); line-height: 1.5; }
        
        .insights-loading { text-align: center; padding: 24px; color: var(--text-muted); }
        .insights-spinner { display: inline-block; width: 16px; height: 16px; border: 2px solid var(--surface3); border-top-color: var(--blue-soft); border-radius: 50%; animation: spin 0.6s linear infinite; margin-bottom: 8px; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      <div className="insights">
        <div className="insights-header">
          <div className="insights-title">AI Safety Analysis</div>
          <div className={`insights-badge insights-badge-${insights.overallRisk}`}>
            {insights.overallRisk} Risk
          </div>
        </div>

        <div className="insights-grid">
          <div className="insights-card">
            <div className="insights-label">Risk Level</div>
            <div className="insights-value">{insights.overallRisk.toUpperCase()}</div>
          </div>
          <div className="insights-card">
            <div className="insights-label">Trend</div>
            <div className="insights-value">{trendLabel}</div>
          </div>
        </div>

        {insights.mainIssues.length > 0 && (
          <div className="insights-section">
            <div className="insights-section-title">Key Issues</div>
            <div className="insights-list">
              {insights.mainIssues.map((issue, i) => (
                <div key={i} className="insights-item">
                  {issue}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="insights-advice">{insights.drivingAdvice}</div>

        {insights.recommendations.length > 0 && (
          <div className="insights-section">
            <div className="insights-section-title">Personalized Tips</div>
            <div className="insights-list">
              {insights.recommendations.slice(0, 4).map((rec, i) => (
                <div key={i} className="insights-item">
                  {rec}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="insights-next">{insights.nextSteps}</div>
      </div>
    </>
  );
}
