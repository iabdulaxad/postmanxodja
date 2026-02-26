export interface ParsedCurl {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string;
}

/**
 * Tokenize a curl command string into an array of arguments,
 * handling single quotes, double quotes, $'...' (ANSI-C), and backslash-newline continuations.
 */
function tokenize(input: string): string[] {
  // Join continuation lines
  const str = input.replace(/\\\r?\n/g, ' ').trim();
  const tokens: string[] = [];
  let i = 0;

  while (i < str.length) {
    // Skip whitespace
    while (i < str.length && /\s/.test(str[i])) i++;
    if (i >= str.length) break;

    let token = '';

    // $'...' ANSI-C quoting
    if (str[i] === '$' && i + 1 < str.length && str[i + 1] === "'") {
      i += 2; // skip $'
      while (i < str.length && str[i] !== "'") {
        if (str[i] === '\\' && i + 1 < str.length) {
          const next = str[i + 1];
          if (next === 'n') { token += '\n'; i += 2; }
          else if (next === 't') { token += '\t'; i += 2; }
          else if (next === '\\') { token += '\\'; i += 2; }
          else if (next === "'") { token += "'"; i += 2; }
          else if (next === '"') { token += '"'; i += 2; }
          else { token += str[i + 1]; i += 2; }
        } else {
          token += str[i]; i++;
        }
      }
      i++; // skip closing '
      tokens.push(token);
      continue;
    }

    // Parse token character by character
    while (i < str.length && !/\s/.test(str[i])) {
      if (str[i] === "'") {
        // Single-quoted string: everything literal until closing '
        i++; // skip opening '
        while (i < str.length && str[i] !== "'") {
          token += str[i]; i++;
        }
        i++; // skip closing '
      } else if (str[i] === '"') {
        // Double-quoted string: handle \" and \\ escapes
        i++; // skip opening "
        while (i < str.length && str[i] !== '"') {
          if (str[i] === '\\' && i + 1 < str.length && (str[i + 1] === '"' || str[i + 1] === '\\')) {
            token += str[i + 1]; i += 2;
          } else {
            token += str[i]; i++;
          }
        }
        i++; // skip closing "
      } else if (str[i] === '\\' && i + 1 < str.length) {
        // Backslash escape outside quotes
        token += str[i + 1]; i += 2;
      } else {
        token += str[i]; i++;
      }
    }

    if (token) tokens.push(token);
  }

  return tokens;
}

export function parseCurl(curlCommand: string): ParsedCurl {
  let method = 'GET';
  let url = '';
  const headers: Record<string, string> = {};
  let body = '';

  const tokens = tokenize(curlCommand);

  // Skip leading 'curl' token
  let start = 0;
  if (tokens.length > 0 && tokens[0].toLowerCase() === 'curl') {
    start = 1;
  }

  const flagsWithArg = new Set([
    '-X', '--request',
    '-H', '--header',
    '-d', '--data', '--data-raw', '--data-binary', '--data-urlencode',
    '-o', '--output',
    '-u', '--user',
    '-A', '--user-agent',
    '-e', '--referer',
    '-b', '--cookie',
    '-c', '--cookie-jar',
    '--connect-timeout',
    '--max-time',
    '-m',
  ]);

  for (let i = start; i < tokens.length; i++) {
    const t = tokens[i];

    if ((t === '-X' || t === '--request') && i + 1 < tokens.length) {
      method = tokens[++i].toUpperCase();
    } else if ((t === '-H' || t === '--header') && i + 1 < tokens.length) {
      const header = tokens[++i];
      const colonIndex = header.indexOf(':');
      if (colonIndex > 0) {
        const key = header.substring(0, colonIndex).trim();
        const value = header.substring(colonIndex + 1).trim();
        headers[key] = value;
      }
    } else if ((t === '-d' || t === '--data' || t === '--data-raw' || t === '--data-binary' || t === '--data-urlencode') && i + 1 < tokens.length) {
      body = tokens[++i];
      if (method === 'GET') method = 'POST';
    } else if (flagsWithArg.has(t) && i + 1 < tokens.length) {
      i++; // skip the argument of flags we don't care about
    } else if (t.startsWith('-')) {
      // Skip boolean flags like --compressed, --insecure, -k, -L, -v, -s, etc.
    } else {
      // Positional argument = URL
      url = t;
    }
  }

  return {
    method,
    url,
    headers,
    body,
  };
}

function shellEscape(str: string): string {
  if (/^[a-zA-Z0-9._\-/:@=&?%+,;~]+$/.test(str)) return str;
  return "'" + str.replace(/'/g, "'\\''") + "'";
}

export function generateCurl(opts: {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: string;
}): string {
  const parts: string[] = ['curl'];

  // Method (skip -X for GET since it's the default)
  if (opts.method && opts.method !== 'GET') {
    parts.push(`-X ${opts.method}`);
  }

  // URL — query params are already embedded in the URL by RequestBuilder,
  // so we use it directly without re-appending.
  const fullUrl = opts.url || '';
  parts.push(shellEscape(fullUrl));

  // Headers
  if (opts.headers) {
    for (const [key, value] of Object.entries(opts.headers)) {
      if (!key.trim()) continue;
      parts.push(`-H ${shellEscape(`${key}: ${value}`)}`);
    }
  }

  // Body
  if (opts.body) {
    parts.push(`--data-raw ${shellEscape(opts.body)}`);
  }

  return parts.join(' \\\n  ');
}
