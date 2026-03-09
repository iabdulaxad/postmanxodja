import { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import Editor from 'react-simple-code-editor';
import type { Environment } from '../types';

interface VariableInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  environments: Environment[];
  selectedEnvId?: number;
  multiline?: boolean;
  rows?: number;
  jsonHighlight?: boolean;
}

interface VariableInfo {
  name: string;
  value: string | undefined;
  start: number;
  end: number;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export default function VariableInput({
  value,
  onChange,
  placeholder,
  className = '',
  environments,
  selectedEnvId,
  multiline = false,
  rows = 6,
  jsonHighlight = false,
}: VariableInputProps) {
  const [activeVariable, setActiveVariable] = useState<VariableInfo | null>(null);
  const [popoverPosition, setPopoverPosition] = useState({ x: 0, y: 0 });
  const [copySuccess, setCopySuccess] = useState<'value' | 'name' | null>(null);
  const [isOverPopover, setIsOverPopover] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear hide timer on unmount
  useEffect(() => {
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  /* ---------------- Environment Variables ---------------- */

  const envVariables = useMemo(() => {
    if (!selectedEnvId) return {};
    const env = environments.find(e => e.id === selectedEnvId);
    if (!env?.variables) return {};

    const vars: Record<string, string> = {};
    try {
      const parsed = typeof env.variables === 'string'
        ? JSON.parse(env.variables)
        : env.variables;

      if (Array.isArray(parsed)) {
        parsed.forEach((v: { key: string; value: string; enabled?: boolean }) => {
          if (v.enabled !== false) vars[v.key] = v.value;
        });
      } else if (typeof parsed === 'object') {
        Object.assign(vars, parsed);
      }
    } catch {
      // ignore invalid JSON
    }

    return vars;
  }, [environments, selectedEnvId]);

  /* ---------------- Parse Variables (for tooltip data) ---------------- */

  const variables = useMemo(() => {
    const regex = /\{\{([^}]+)\}\}/g;
    const matches: VariableInfo[] = [];
    let match;

    while ((match = regex.exec(value)) !== null) {
      matches.push({
        name: match[1],
        value: envVariables[match[1]],
        start: match.index,
        end: match.index + match[0].length,
      });
    }

    return matches;
  }, [value, envVariables]);

  /* ---------------- Highlight Functions ---------------- */

  const highlightPlain = useCallback(
    (code: string): string => {
      if (!code) return '';

      const regex = /\{\{([^}]+)\}\}/g;
      let result = '';
      let lastIndex = 0;
      let match;

      while ((match = regex.exec(code)) !== null) {
        result += escapeHtml(code.slice(lastIndex, match.index));

        const varName = match[1];
        const hasValue = envVariables[varName] !== undefined;
        const cls = hasValue ? 'vi-var vi-var-found' : 'vi-var vi-var-missing';
        result += `<span class="${cls}" data-var-name="${escapeHtml(varName)}">${escapeHtml(match[0])}</span>`;

        lastIndex = match.index + match[0].length;
      }

      result += escapeHtml(code.slice(lastIndex));
      return result;
    },
    [envVariables],
  );

  const highlightJson = useCallback(
    (code: string): string => {
      if (!code) return '';

      // Combined regex: variables | JSON strings | numbers | booleans | null
      const tokenRegex = /(\{\{[^}]+\}\})|("(?:[^"\\]|\\.)*")|(-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b)|(\btrue\b|\bfalse\b)|(\bnull\b)/g;

      let result = '';
      let lastIndex = 0;
      let match;

      while ((match = tokenRegex.exec(code)) !== null) {
        // Non-matched text before this token
        if (match.index > lastIndex) {
          result += escapeHtml(code.slice(lastIndex, match.index));
        }

        const fullMatch = match[0];

        if (match[1]) {
          // Variable {{name}}
          const varName = fullMatch.slice(2, -2);
          const hasValue = envVariables[varName] !== undefined;
          const cls = hasValue ? 'vi-var vi-var-found' : 'vi-var vi-var-missing';
          result += `<span class="${cls}" data-var-name="${escapeHtml(varName)}">${escapeHtml(fullMatch)}</span>`;
        } else if (match[2]) {
          // String — check if it's a key (followed by colon)
          const afterMatch = code.slice(match.index + fullMatch.length);
          const isKey = /^\s*:/.test(afterMatch);
          const cls = isKey ? 'vi-json-key' : 'vi-json-string';
          result += `<span class="${cls}">${escapeHtml(fullMatch)}</span>`;
        } else if (match[3]) {
          result += `<span class="vi-json-number">${escapeHtml(fullMatch)}</span>`;
        } else if (match[4]) {
          result += `<span class="vi-json-boolean">${escapeHtml(fullMatch)}</span>`;
        } else if (match[5]) {
          result += `<span class="vi-json-null">${escapeHtml(fullMatch)}</span>`;
        }

        lastIndex = match.index + fullMatch.length;
      }

      result += escapeHtml(code.slice(lastIndex));
      return result;
    },
    [envVariables],
  );

  const highlightCode = useCallback(
    (code: string): string => {
      return jsonHighlight ? highlightJson(code) : highlightPlain(code);
    },
    [jsonHighlight, highlightJson, highlightPlain],
  );

  /* ---------------- Popover show/hide helpers ---------------- */

  const scheduleHide = useCallback(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      setActiveVariable(null);
      setCopySuccess(null);
    }, 200);
  }, []);

  const cancelHide = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  /* ---------------- Mouse Handlers for Variable Detection ---------------- */

  const findVariableAtPoint = useCallback(
    (clientX: number, clientY: number): VariableInfo | null => {
      if (!containerRef.current) return null;

      const varSpans = containerRef.current.querySelectorAll('.vi-var');

      for (const span of varSpans) {
        const rect = span.getBoundingClientRect();
        if (
          clientX >= rect.left &&
          clientX <= rect.right &&
          clientY >= rect.top &&
          clientY <= rect.bottom
        ) {
          const varName = span.getAttribute('data-var-name');
          if (!varName) continue;

          return (
            variables.find(v => v.name === varName) || {
              name: varName,
              value: envVariables[varName],
              start: 0,
              end: 0,
            }
          );
        }
      }

      return null;
    },
    [variables, envVariables],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const varInfo = findVariableAtPoint(e.clientX, e.clientY);

      if (varInfo) {
        cancelHide();
        setActiveVariable(varInfo);
        setPopoverPosition({ x: e.clientX, y: e.clientY });
      } else if (!isOverPopover) {
        scheduleHide();
      }
    },
    [findVariableAtPoint, isOverPopover, cancelHide, scheduleHide],
  );

  const handleMouseLeave = useCallback(() => {
    if (!isOverPopover) {
      scheduleHide();
    }
  }, [isOverPopover, scheduleHide]);

  /* ---------------- Popover Mouse Handlers ---------------- */

  const handlePopoverEnter = useCallback(() => {
    setIsOverPopover(true);
    cancelHide();
  }, [cancelHide]);

  const handlePopoverLeave = useCallback(() => {
    setIsOverPopover(false);
    scheduleHide();
  }, [scheduleHide]);

  /* ---------------- Copy Handlers ---------------- */

  const handleCopyValue = useCallback(async () => {
    if (!activeVariable?.value) return;
    await navigator.clipboard.writeText(activeVariable.value);
    setCopySuccess('value');
    setTimeout(() => setCopySuccess(null), 1200);
  }, [activeVariable]);

  const handleCopyName = useCallback(async () => {
    if (!activeVariable) return;
    await navigator.clipboard.writeText(`{{${activeVariable.name}}}`);
    setCopySuccess('name');
    setTimeout(() => setCopySuccess(null), 1200);
  }, [activeVariable]);

  /* ---------------- Prevent Enter for Single-line ---------------- */

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!multiline && e.key === 'Enter') {
        e.preventDefault();
      }
    },
    [multiline],
  );

  /* ---------------- Styles ---------------- */

  const minHeight = multiline ? Math.max(150, rows * 20) : 38;

  return (
    <div ref={containerRef} className="relative">
      {/* Outer scroll wrapper for multiline — keeps Editor at full content height
          so the textarea covers all text and stays editable everywhere */}
      <div
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        className={`vi-editor-wrapper ${multiline ? 'vi-multiline' : 'vi-singleline'} ${className}`}
        style={multiline ? { maxHeight: 'min(400px, 40vh)', overflow: 'auto' } : undefined}
      >
        <Editor
          value={value}
          onValueChange={onChange}
          highlight={highlightCode}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          padding={{ top: 8, right: 12, bottom: 8, left: 12 }}
          style={{
            fontFamily:
              'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
            fontSize: '0.875rem',
            lineHeight: '1.25rem',
            minHeight: `${minHeight}px`,
            ...(!multiline
              ? {
                  maxHeight: `${minHeight}px`,
                  overflow: 'visible',
                  width: '100%',
                }
              : {}),
          }}
          textareaClassName="vi-textarea"
          preClassName="vi-pre"
        />
      </div>

      {/* Interactive hover popover */}
      {activeVariable && (
        <div
          className="fixed z-[9999] bg-gray-900 dark:bg-gray-800 text-white text-xs rounded-lg shadow-xl border border-gray-700"
          style={{
            left: Math.max(8, Math.min(popoverPosition.x + 12, window.innerWidth - 260)),
            top: Math.max(8, popoverPosition.y - 10),
            minWidth: Math.min(200, window.innerWidth - 16),
            maxWidth: Math.min(280, window.innerWidth - 16),
            transform: popoverPosition.y > 150 ? 'translateY(-100%)' : 'translateY(8px)',
          }}
          onMouseEnter={handlePopoverEnter}
          onMouseLeave={handlePopoverLeave}
        >
          {/* Variable name header */}
          <div className="px-3 py-2 border-b border-gray-700 flex items-center justify-between">
            <span className="font-semibold text-orange-400 text-sm">
              {activeVariable.name}
            </span>
            <span className="text-[10px] text-muted-foreground ml-2">
              {activeVariable.value !== undefined ? 'resolved' : 'unresolved'}
            </span>
          </div>

          {/* Variable value display */}
          <div className="px-3 py-2 border-b border-gray-700">
            {activeVariable.value !== undefined ? (
              <div className="font-mono text-green-400 break-all text-xs">
                {activeVariable.value || (
                  <span className="italic text-muted-foreground">empty string</span>
                )}
              </div>
            ) : (
              <div className="text-red-400 text-xs">
                Not found in environment
              </div>
            )}
          </div>

          {/* Copy buttons */}
          <div className="p-1.5 flex gap-1">
            {activeVariable.value !== undefined && (
              <button
                onClick={handleCopyValue}
                className="flex-1 px-2 py-1.5 text-xs rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
              >
                {copySuccess === 'value' ? 'Copied!' : 'Copy Value'}
              </button>
            )}
            <button
              onClick={handleCopyName}
              className="flex-1 px-2 py-1.5 text-xs rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
            >
              {copySuccess === 'name' ? 'Copied!' : 'Copy Key'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
