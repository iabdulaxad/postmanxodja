/**
 * Offline / direct-fetch request executor.
 *
 * When the backend proxy is unreachable (offline mode, or the user is running
 * locally without Docker) this module executes HTTP requests directly from the
 * browser via the Fetch API.
 *
 * Limitations compared to the backend proxy:
 *  - Subject to CORS restrictions of the target server.
 *  - Cannot follow redirects across origins transparently.
 *  - Cannot access response headers blocked by the browser.
 *
 * For localhost targets the browser is typically on the same origin so CORS
 * is rarely an issue.
 */
import type { ExecuteRequest, ExecuteResponse } from '../types';

/**
 * Returns true when the target URL points to a loopback / private address.
 */
function isLocalhostTarget(rawURL: string): boolean {
  try {
    const url = new URL(rawURL.match(/^https?:\/\//i) ? rawURL : 'http://' + rawURL);
    const host = url.hostname;
    return (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '::1' ||
      host.startsWith('192.168.') ||
      host.startsWith('10.') ||
      host.startsWith('172.')
    );
  } catch {
    return false;
  }
}

/**
 * Returns true when the browser is on a different origin from the target
 * (e.g. app hosted at postbaby.uz trying to reach localhost).
 */
export function isCrossOriginLocalhost(rawURL: string): boolean {
  if (!isLocalhostTarget(rawURL)) return false;
  // If the page itself is running on localhost, direct fetch is fine
  const pageHost = window.location.hostname;
  return pageHost !== 'localhost' && pageHost !== '127.0.0.1' && pageHost !== '::1';
}

export async function executeRequestDirect(
  request: ExecuteRequest,
): Promise<ExecuteResponse> {
  const startTime = performance.now();

  // Build URL with query params
  let targetURL = request.url;
  if (!targetURL.match(/^https?:\/\//i)) {
    targetURL = 'http://' + targetURL;
  }

  const urlObj = new URL(targetURL);
  if (request.query_params) {
    for (const [key, value] of Object.entries(request.query_params)) {
      if (!key) continue;
      // Skip if this key=value pair already exists in the URL
      if (urlObj.searchParams.getAll(key).includes(value)) continue;
      urlObj.searchParams.append(key, value);
    }
  }

  // Build headers
  const headers = new Headers();
  if (request.headers) {
    for (const [key, value] of Object.entries(request.headers)) {
      if (!key || !key.trim()) continue;
      try {
        headers.set(key.trim(), value);
      } catch {
        // Skip invalid header names (e.g. containing spaces, colons, etc.)
      }
    }
  }

  // Build body
  let body: BodyInit | undefined;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    if (request.body_type === 'form-data' && request.form_data) {
      const formData = new FormData();
      for (const item of request.form_data) {
        if (!item.key) continue;
        if (item.type === 'file' && item.file) {
          formData.append(item.key, item.file);
        } else {
          formData.append(item.key, item.value);
        }
      }
      body = formData;
      // Let the browser set Content-Type with boundary
      headers.delete('Content-Type');
    } else if (request.body_type === 'x-www-form-urlencoded' && request.form_data) {
      const params = new URLSearchParams();
      for (const item of request.form_data) {
        if (item.key) params.append(item.key, item.value);
      }
      body = params;
      if (!headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/x-www-form-urlencoded');
      }
    } else if (request.body) {
      body = request.body;
    }
  }

  try {
    // Detect mixed content: HTTPS page trying to fetch HTTP target.
    // Browsers block this. localhost is exempt in Chrome/Edge but not all browsers.
    const pageIsHTTPS = window.location.protocol === 'https:';
    const targetIsHTTP = urlObj.protocol === 'http:';
    const targetHost = urlObj.hostname;
    const isLoopback = targetHost === 'localhost' || targetHost === '127.0.0.1' || targetHost === '::1';

    // If HTTPS → HTTP and not a loopback address, it will be blocked
    if (pageIsHTTPS && targetIsHTTP && !isLoopback) {
      return {
        status: 0,
        status_text: 'Mixed Content Blocked',
        headers: {},
        body: JSON.stringify({
          error: 'Mixed content: cannot fetch HTTP from an HTTPS page. ' +
            'Use HTTPS for the target URL, or open this app over HTTP.',
        }),
        time: Math.round(performance.now() - startTime),
      };
    }

    const resp = await fetch(urlObj.toString(), {
      method: request.method,
      headers,
      body,
    });

    const elapsed = Math.round(performance.now() - startTime);

    // Collect accessible response headers
    const respHeaders: Record<string, string> = {};
    resp.headers.forEach((value, key) => {
      respHeaders[key] = value;
    });

    const respBody = await resp.text();

    return {
      status: resp.status,
      status_text: resp.statusText,
      headers: respHeaders,
      body: respBody,
      time: elapsed,
    };
  } catch (err: any) {
    // Network error — still return a structured response so the UI can show it
    const elapsed = Math.round(performance.now() - startTime);

    // Determine a helpful error message
    let errorMessage = err.message || 'Network error';
    if (err.name === 'TypeError' && errorMessage.includes('Failed to fetch')) {
      errorMessage =
        'Failed to fetch — the target server may be unreachable, or CORS is blocking the request. ' +
        'If this is a localhost service, make sure it is running and allows cross-origin requests.';
    }

    return {
      status: 0,
      status_text: 'Network Error',
      headers: {},
      body: JSON.stringify({ error: errorMessage }),
      time: elapsed,
    };
  }
}

/**
 * Check whether the backend API server is reachable.
 * Uses /api/health which goes through CORS middleware, avoiding
 * cross-origin issues when the frontend is on a different domain.
 */
export async function isBackendReachable(apiBaseUrl: string): Promise<boolean> {
  try {
    const healthURL = apiBaseUrl.replace(/\/?$/, '/health');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const resp = await fetch(healthURL, {
      signal: controller.signal,
      cache: 'no-store',
    });
    clearTimeout(timeout);
    return resp.ok;
  } catch {
    return false;
  }
}
