import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { WebSocketClient, type WSConnectMode } from '../services/websocket';
import type { RequestTab, WSConnectionState, WSMessage } from '../types';

interface Props {
  initialUrl?: string;
  initialName?: string;
  onUpdate?: (updates: Partial<RequestTab>) => void;
}

const stateLabel: Record<WSConnectionState, string> = {
  closed: 'Disconnected',
  connecting: 'Connecting…',
  open: 'Connected',
  closing: 'Closing…',
};

const stateColor: Record<WSConnectionState, string> = {
  closed: 'bg-muted text-muted-foreground',
  connecting: 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-300',
  open: 'bg-green-500/20 text-green-700 dark:text-green-300',
  closing: 'bg-orange-500/20 text-orange-700 dark:text-orange-300',
};

let messageCounter = 0;
const nextMessageId = () => `${Date.now()}-${++messageCounter}`;

interface HeaderRow {
  key: string;
  value: string;
}

export default function WebSocketBuilder({ initialUrl = '', onUpdate }: Props) {
  const [url, setUrl] = useState(initialUrl);
  const [mode, setMode] = useState<WSConnectMode>('direct');
  const [state, setState] = useState<WSConnectionState>('closed');
  const [messages, setMessages] = useState<WSMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [headers, setHeaders] = useState<HeaderRow[]>([]);
  const [subprotocols, setSubprotocols] = useState('');
  const [optionsTab, setOptionsTab] = useState<'headers' | 'subprotocols' | null>(null);

  const clientRef = useRef<WebSocketClient | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const appendMessage = useCallback((msg: Omit<WSMessage, 'id' | 'timestamp'>) => {
    setMessages(prev => [...prev, { ...msg, id: nextMessageId(), timestamp: Date.now() }]);
  }, []);

  // Lazily create the client so handlers see the latest state setters
  const getClient = useCallback(() => {
    if (!clientRef.current) {
      clientRef.current = new WebSocketClient({
        onStateChange: setState,
        onMessage: (data) => appendMessage({ direction: 'received', body: data }),
        onSystem: (message) => appendMessage({ direction: 'system', body: message }),
      });
    }
    return clientRef.current;
  }, [appendMessage]);

  useEffect(() => {
    return () => {
      clientRef.current?.disconnect();
    };
  }, []);

  // Auto-scroll log to bottom on new messages
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [messages.length]);

  // Sync URL changes back to the tab so the tab title can show it
  useEffect(() => {
    onUpdate?.({ url });
  }, [url, onUpdate]);

  const canConnect = useMemo(() => {
    const trimmed = url.trim();
    if (!trimmed) return false;
    return /^wss?:\/\//i.test(trimmed) || mode === 'proxy';
  }, [url, mode]);

  const handleConnect = () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    const targetUrl = /^wss?:\/\//i.test(trimmed) ? trimmed : `ws://${trimmed}`;

    const headerMap: Record<string, string> = {};
    for (const { key, value } of headers) {
      const k = key.trim();
      if (k) headerMap[k] = value;
    }

    const protocols = subprotocols
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    appendMessage({ direction: 'system', body: `connecting to ${targetUrl} (${mode})` });
    getClient().connect({
      url: targetUrl,
      mode,
      headers: Object.keys(headerMap).length > 0 ? headerMap : undefined,
      protocols: protocols.length > 0 ? protocols : undefined,
    });
  };

  const insecureFromSecurePage =
    typeof window !== 'undefined' &&
    window.location.protocol === 'https:' &&
    /^ws:\/\//i.test(url.trim()) &&
    mode === 'direct';

  const headersDisabledInDirect = mode === 'direct' && headers.some(h => h.key.trim());

  const handleDisconnect = () => {
    clientRef.current?.disconnect();
  };

  const handleSend = () => {
    if (!draft) return;
    if (getClient().send(draft)) {
      appendMessage({ direction: 'sent', body: draft });
      setDraft('');
    }
  };

  const handleClear = () => setMessages([]);

  const isOpen = state === 'open';
  const isBusy = state === 'connecting' || state === 'closing';

  return (
    <div className="flex flex-col h-full min-h-0 bg-background">
      {/* URL bar */}
      <div className="flex items-center gap-2 p-3 border-b border-border bg-card flex-shrink-0">
        <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-1 rounded bg-primary/10 text-primary">
          WS
        </span>
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="wss://echo.websocket.org"
          disabled={isOpen || isBusy}
          className="flex-1 min-w-0 px-3 py-2 text-sm border border-border rounded bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
        />
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as WSConnectMode)}
          disabled={isOpen || isBusy}
          title="Direct: browser connects straight to the target. Proxy: route through backend (uses JWT)."
          className="text-xs px-2 py-2 border border-border rounded bg-background text-foreground disabled:opacity-60"
        >
          <option value="direct">Direct</option>
          <option value="proxy">Proxy</option>
        </select>
        {isOpen || isBusy ? (
          <button
            onClick={handleDisconnect}
            disabled={state === 'closing'}
            className="px-4 py-2 text-sm font-medium rounded bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-60"
          >
            Disconnect
          </button>
        ) : (
          <button
            onClick={handleConnect}
            disabled={!canConnect}
            className="px-4 py-2 text-sm font-medium rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            Connect
          </button>
        )}
      </div>

      {/* Status row */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-card flex-shrink-0 gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-medium px-2 py-0.5 rounded ${stateColor[state]}`}>
            {stateLabel[state]}
          </span>
          <button
            onClick={() => setOptionsTab(optionsTab === 'headers' ? null : 'headers')}
            className={`text-xs px-2 py-0.5 rounded border ${
              optionsTab === 'headers'
                ? 'bg-primary/10 border-primary text-primary'
                : 'border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            Headers{headers.filter(h => h.key.trim()).length > 0 ? ` (${headers.filter(h => h.key.trim()).length})` : ''}
          </button>
          <button
            onClick={() => setOptionsTab(optionsTab === 'subprotocols' ? null : 'subprotocols')}
            className={`text-xs px-2 py-0.5 rounded border ${
              optionsTab === 'subprotocols'
                ? 'bg-primary/10 border-primary text-primary'
                : 'border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            Subprotocols
          </button>
        </div>
        <button
          onClick={handleClear}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Clear log
        </button>
      </div>

      {/* Insecure-from-secure warning */}
      {insecureFromSecurePage && (
        <div className="px-3 py-2 border-b border-border bg-yellow-500/10 text-yellow-800 dark:text-yellow-300 text-xs flex-shrink-0">
          This page is loaded over HTTPS, so the browser will refuse a direct
          <code className="mx-1 px-1 rounded bg-yellow-500/20">ws://</code>
          connection (mixed content). Switch the mode dropdown to
          <strong className="mx-1">Proxy</strong> to route through the backend.
        </div>
      )}

      {/* Headers-in-direct-mode warning */}
      {headersDisabledInDirect && (
        <div className="px-3 py-2 border-b border-border bg-yellow-500/10 text-yellow-800 dark:text-yellow-300 text-xs flex-shrink-0">
          Custom headers are ignored in Direct mode — the browser WebSocket API
          can't set them. Switch to <strong>Proxy</strong> mode to send them.
        </div>
      )}

      {/* Options panel */}
      {optionsTab === 'headers' && (
        <div className="border-b border-border bg-card px-3 py-3 flex-shrink-0 max-h-48 overflow-y-auto">
          <div className="space-y-2">
            {headers.length === 0 && (
              <div className="text-xs text-muted-foreground">
                No headers. Click "Add header" to attach key/value pairs that the proxy will forward upstream.
              </div>
            )}
            {headers.map((h, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  value={h.key}
                  onChange={(e) =>
                    setHeaders(prev => prev.map((row, idx) => (idx === i ? { ...row, key: e.target.value } : row)))
                  }
                  placeholder="Header name"
                  disabled={isOpen || isBusy}
                  className="flex-1 px-2 py-1 text-xs border border-border rounded bg-background text-foreground disabled:opacity-60"
                />
                <input
                  value={h.value}
                  onChange={(e) =>
                    setHeaders(prev => prev.map((row, idx) => (idx === i ? { ...row, value: e.target.value } : row)))
                  }
                  placeholder="Value"
                  disabled={isOpen || isBusy}
                  className="flex-1 px-2 py-1 text-xs border border-border rounded bg-background text-foreground disabled:opacity-60"
                />
                <button
                  onClick={() => setHeaders(prev => prev.filter((_, idx) => idx !== i))}
                  disabled={isOpen || isBusy}
                  className="text-xs px-2 py-1 text-muted-foreground hover:text-destructive disabled:opacity-60"
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              onClick={() => setHeaders(prev => [...prev, { key: '', value: '' }])}
              disabled={isOpen || isBusy}
              className="text-xs px-2 py-1 rounded border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-foreground disabled:opacity-60"
            >
              + Add header
            </button>
          </div>
        </div>
      )}

      {optionsTab === 'subprotocols' && (
        <div className="border-b border-border bg-card px-3 py-3 flex-shrink-0">
          <label className="block text-xs text-muted-foreground mb-1">
            Comma-separated <code>Sec-WebSocket-Protocol</code> values. Works in both modes.
          </label>
          <input
            value={subprotocols}
            onChange={(e) => setSubprotocols(e.target.value)}
            placeholder="graphql-ws, json.api.v1"
            disabled={isOpen || isBusy}
            className="w-full px-2 py-1.5 text-xs border border-border rounded bg-background text-foreground disabled:opacity-60"
          />
        </div>
      )}

      {/* Message log */}
      <div
        ref={logRef}
        className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2 font-mono text-xs"
      >
        {messages.length === 0 ? (
          <div className="text-center text-muted-foreground py-12">
            No messages yet. Connect to a WebSocket and send a message to see it here.
          </div>
        ) : (
          messages.map((m) => (
            <MessageRow key={m.id} message={m} />
          ))
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-border bg-card p-3 flex-shrink-0">
        <div className="flex gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={isOpen ? 'Message to send… (Ctrl/Cmd+Enter to send)' : 'Connect first to send messages'}
            disabled={!isOpen}
            rows={3}
            className="flex-1 min-w-0 px-3 py-2 text-sm border border-border rounded bg-background text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60 resize-none"
          />
          <button
            onClick={handleSend}
            disabled={!isOpen || !draft}
            className="px-4 py-2 text-sm font-medium rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60 self-stretch"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

function MessageRow({ message }: { message: WSMessage }) {
  const time = new Date(message.timestamp).toLocaleTimeString();

  const styleFor: Record<WSMessage['direction'], { label: string; container: string; arrow: string }> = {
    sent: {
      label: 'SENT',
      container: 'bg-blue-500/10 border-blue-500/30',
      arrow: 'text-blue-600 dark:text-blue-400',
    },
    received: {
      label: 'RECV',
      container: 'bg-green-500/10 border-green-500/30',
      arrow: 'text-green-600 dark:text-green-400',
    },
    system: {
      label: 'INFO',
      container: 'bg-muted border-border',
      arrow: 'text-muted-foreground',
    },
  };

  const s = styleFor[message.direction];

  return (
    <div className={`border rounded px-2 py-1.5 ${s.container}`}>
      <div className="flex items-center gap-2 text-[10px] mb-0.5">
        <span className={`font-semibold ${s.arrow}`}>{s.label}</span>
        <span className="text-muted-foreground">{time}</span>
      </div>
      <pre className="whitespace-pre-wrap break-all text-foreground">{message.body}</pre>
    </div>
  );
}
