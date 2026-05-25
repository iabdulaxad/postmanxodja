import type { WSConnectionState } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080/api';

export type WSConnectMode = 'direct' | 'proxy';

export interface WSClientHandlers {
  onStateChange: (state: WSConnectionState) => void;
  onMessage: (data: string) => void;
  onSystem: (message: string) => void;
}

export interface WSConnectOptions {
  url: string;
  mode: WSConnectMode;
  /**
   * Sec-WebSocket-Protocol values. Supported in both direct and proxy mode.
   */
  protocols?: string[];
  /**
   * Custom request headers to attach to the upstream handshake. Only honored
   * in `proxy` mode — the browser WebSocket API forbids setting handshake
   * headers from JS, so direct connections silently ignore this.
   */
  headers?: Record<string, string>;
}

/**
 * Thin wrapper around the browser WebSocket. In `proxy` mode the connection
 * is routed through the Go backend at /api/ws/proxy so requests that the
 * browser would otherwise block (e.g. due to origin restrictions enforced
 * by the upstream server) can still be made — the JWT is sent via the
 * `bearer.<token>` subprotocol since browsers can't set headers on the
 * WS handshake.
 */
export class WebSocketClient {
  private socket: WebSocket | null = null;
  private handlers: WSClientHandlers;

  constructor(handlers: WSClientHandlers) {
    this.handlers = handlers;
  }

  connect(opts: WSConnectOptions) {
    if (this.socket && this.socket.readyState !== WebSocket.CLOSED) {
      this.handlers.onSystem('already connected — disconnect first');
      return;
    }

    let target: string;
    // Browser-leg subprotocols. In proxy mode the upstream subprotocols are
    // forwarded via query param, leaving this slot free for the auth token.
    let browserProtocols: string[] = [];

    if (opts.mode === 'proxy') {
      const token = localStorage.getItem('access_token');
      const base = API_BASE_URL.replace(/^http/, 'ws');
      const params = new URLSearchParams();
      params.set('target', opts.url);
      if (opts.headers && Object.keys(opts.headers).length > 0) {
        params.set('headers', JSON.stringify(opts.headers));
      }
      if (opts.protocols && opts.protocols.length > 0) {
        params.set('protocols', opts.protocols.join(','));
      }
      target = `${base}/ws/proxy?${params.toString()}`;
      if (token) {
        browserProtocols.push(`bearer.${token}`);
      }
    } else {
      target = opts.url;
      if (opts.protocols && opts.protocols.length > 0) {
        browserProtocols = [...opts.protocols];
      }
      if (opts.headers && Object.keys(opts.headers).length > 0) {
        this.handlers.onSystem(
          'custom headers ignored: the browser WebSocket API cannot set them — switch to Proxy mode to send headers',
        );
      }
    }

    let socket: WebSocket;
    try {
      socket = browserProtocols.length > 0
        ? new WebSocket(target, browserProtocols)
        : new WebSocket(target);
    } catch (err) {
      this.handlers.onSystem(`failed to open socket: ${(err as Error).message}`);
      this.handlers.onStateChange('closed');
      return;
    }

    this.socket = socket;
    this.handlers.onStateChange('connecting');

    socket.onopen = () => this.handlers.onStateChange('open');
    socket.onclose = (ev) => {
      this.handlers.onSystem(`closed (code=${ev.code}${ev.reason ? `, reason=${ev.reason}` : ''})`);
      this.handlers.onStateChange('closed');
      this.socket = null;
    };
    socket.onerror = () => {
      // The browser intentionally hides error details for security; surface
      // a generic note so the user knows something went wrong.
      this.handlers.onSystem('socket error (see browser console for details)');
    };
    socket.onmessage = (ev) => {
      if (typeof ev.data === 'string') {
        this.handlers.onMessage(ev.data);
      } else if (ev.data instanceof Blob) {
        ev.data.text().then(this.handlers.onMessage);
      } else if (ev.data instanceof ArrayBuffer) {
        this.handlers.onMessage(new TextDecoder().decode(ev.data));
      }
    };
  }

  send(data: string): boolean {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      this.handlers.onSystem('cannot send: socket is not open');
      return false;
    }
    this.socket.send(data);
    return true;
  }

  disconnect(code = 1000, reason = 'client closed') {
    if (!this.socket) return;
    this.handlers.onStateChange('closing');
    try {
      this.socket.close(code, reason);
    } catch {
      // ignore — onclose will fire either way
    }
  }
}
