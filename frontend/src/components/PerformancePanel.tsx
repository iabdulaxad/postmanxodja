import { useState, useEffect, useRef } from 'react';

interface PerformanceTest {
  id: number;
  url: string;
  status: 'running' | 'completed' | 'failed' | 'pending';
  started_at: string;
  ended_at?: string;
  error?: string;
  output?: string;
}

const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:8080/api';
const grafanaUrl = import.meta.env.VITE_GRAFANA_URL || '/grafana';

export default function PerformancePanel() {
  const [url, setUrl] = useState('');
  const [activeTest, setActiveTest] = useState<PerformanceTest | null>(null);
  const [history, setHistory] = useState<PerformanceTest[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'history' | 'output'>('dashboard');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    loadHistory();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const loadHistory = async () => {
    try {
      const token = localStorage.getItem('access_token');
      const res = await fetch(`${apiBase}/performance/tests`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setHistory(await res.json());
    } catch {}
  };

  const startTest = async () => {
    if (!url.trim()) return;
    setLoading(true);
    try {
      const token = localStorage.getItem('access_token');
      const res = await fetch(`${apiBase}/performance/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ url: url.trim() }),
      });
      if (!res.ok) throw new Error('Failed to start test');
      const test: PerformanceTest = await res.json();
      setActiveTest(test);
      setActiveTab('dashboard');
      pollStatus(test.id);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  };

  const pollStatus = (testId: number) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const token = localStorage.getItem('access_token');
        const res = await fetch(`${apiBase}/performance/test/${testId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const test: PerformanceTest = await res.json();
          setActiveTest(test);
          if (test.status === 'completed' || test.status === 'failed') {
            clearInterval(pollRef.current!);
            loadHistory();
          }
        }
      } catch {}
    }, 3000);
  };

  const statusBadge = (status: string) => {
    const styles: Record<string, string> = {
      running: 'bg-blue-100 text-blue-700',
      completed: 'bg-green-100 text-green-700',
      failed: 'bg-red-100 text-red-700',
      pending: 'bg-yellow-100 text-yellow-700',
    };
    return (
      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${styles[status] || 'bg-muted text-muted-foreground'}`}>
        {status}
      </span>
    );
  };

  const grafanaDashboardUrl = activeTest
    ? `${grafanaUrl}/d/k6-load-testing-results/k6-load-testing-results?orgId=1&refresh=5s&from=now-5m&to=now`
    : `${grafanaUrl}/dashboards?orgId=1`;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* URL input bar */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-card flex-shrink-0">
        <input
          type="url"
          value={url}
          onChange={e => setUrl(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && startTest()}
          placeholder="https://example.com"
          className="flex-1 px-3 py-1.5 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-foreground placeholder:text-muted-foreground"
        />
        <button
          onClick={startTest}
          disabled={loading || !url.trim() || (activeTest?.status === 'running')}
          className="px-4 py-1.5 text-sm bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {loading || activeTest?.status === 'running' ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              Running...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Run Test
            </>
          )}
        </button>
      </div>

      {/* Active test status bar */}
      {activeTest && (
        <div className="flex items-center gap-3 px-4 py-2 bg-muted/50 border-b border-border text-sm flex-shrink-0">
          <span className="text-muted-foreground truncate max-w-xs">{activeTest.url}</span>
          {statusBadge(activeTest.status)}
          {activeTest.status === 'running' && (
            <span className="text-muted-foreground text-xs">Grafana dashboard will update live below</span>
          )}
          {activeTest.status === 'failed' && activeTest.error && (
            <span className="text-destructive text-xs truncate">{activeTest.error}</span>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-border flex-shrink-0 bg-card">
        <button
          onClick={() => setActiveTab('dashboard')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'dashboard' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
        >
          Grafana Dashboard
        </button>
        <button
          onClick={() => { setActiveTab('history'); loadHistory(); }}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'history' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
        >
          Test History
        </button>
        <button
          onClick={() => setActiveTab('output')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'output' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
        >
          k6 Output
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0">
        {activeTab === 'dashboard' && (
          <iframe
            src={grafanaDashboardUrl}
            className="w-full h-full border-0"
            title="k6 Performance Dashboard"
            allow="fullscreen"
          />
        )}

        {activeTab === 'output' && (
          <div className="h-full overflow-y-auto p-4 bg-background">
            {!activeTest ? (
              <p className="text-sm text-muted-foreground">Run a test to see k6 output here.</p>
            ) : activeTest.status === 'running' ? (
              <p className="text-sm text-muted-foreground animate-pulse">Test is running...</p>
            ) : (
              <pre className="text-xs text-foreground font-mono whitespace-pre-wrap break-all">
                {activeTest.output || activeTest.error || 'No output captured.'}
              </pre>
            )}
          </div>
        )}

        {activeTab === 'history' && (
          <div className="overflow-y-auto h-full p-4">
            {history.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
                <svg className="w-12 h-12 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                <p className="text-sm">No tests run yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {history.map(test => (
                  <div key={test.id} className="flex items-center justify-between p-3 bg-card rounded-lg border border-border">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{test.url}</p>
                      <p className="text-xs text-muted-foreground">{new Date(test.started_at).toLocaleString()}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {statusBadge(test.status)}
                      {test.status === 'completed' && (
                        <button
                          onClick={() => { setActiveTest(test); setActiveTab('dashboard'); }}
                          className="text-xs text-primary hover:underline"
                        >
                          View
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
