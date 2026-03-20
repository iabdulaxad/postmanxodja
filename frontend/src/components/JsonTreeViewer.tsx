import { useState, useCallback, useMemo, useImperativeHandle, forwardRef } from 'react';

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export interface JsonTreeViewerHandle {
  expandAll: () => void;
  collapseAll: () => void;
}

interface JsonNodeProps {
  keyName?: string;
  value: JsonValue;
  path: string[];
  collapsed: Set<string>;
  onToggle: (path: string) => void;
  isLast: boolean;
  depth: number;
}

function JsonNode({ keyName, value, path, collapsed, onToggle, isLast, depth }: JsonNodeProps) {
  const pathKey = path.join('.');
  const indent = depth * 20;
  const comma = isLast ? '' : ',';

  // Primitive values
  if (value === null || typeof value !== 'object') {
    let displayClass = 'text-foreground';
    let displayValue = String(value);

    if (value === null) {
      displayClass = 'text-muted-foreground italic';
      displayValue = 'null';
    } else if (typeof value === 'boolean') {
      displayClass = 'text-chart-5';
      displayValue = String(value);
    } else if (typeof value === 'number') {
      displayClass = 'text-primary';
    } else if (typeof value === 'string') {
      displayClass = 'text-chart-2';
      displayValue = `"${value}"`;
    }

    return (
      <div className="flex items-start py-0.5 hover:bg-accent/50" style={{ paddingLeft: indent }}>
        <span className="w-4 flex-shrink-0" />
        {keyName !== undefined && (
          <span className="text-chart-1 mr-1 flex-shrink-0">"{keyName}"<span className="text-muted-foreground">: </span></span>
        )}
        <span className={`${displayClass} break-all`}>{displayValue}</span>
        <span className="text-muted-foreground">{comma}</span>
      </div>
    );
  }

  // Object or Array
  const isArray = Array.isArray(value);
  const entries = isArray
    ? value.map((v, i) => [String(i), v] as [string, JsonValue])
    : Object.entries(value);
  const isCollapsed = collapsed.has(pathKey);
  const openBrace = isArray ? '[' : '{';
  const closeBrace = isArray ? ']' : '}';

  return (
    <div>
      <div
        className="flex items-center py-0.5 cursor-pointer hover:bg-accent/50"
        style={{ paddingLeft: indent }}
        onClick={() => onToggle(pathKey)}
      >
        <span className="w-4 h-4 flex items-center justify-center text-muted-foreground mr-1 flex-shrink-0 text-xs select-none">
          {isCollapsed ? '▶' : '▼'}
        </span>
        {keyName !== undefined && (
          <span className="text-chart-1 mr-1">"{keyName}"<span className="text-muted-foreground">: </span></span>
        )}
        <span className="text-foreground">{openBrace}</span>
        {isCollapsed && (
          <>
            <span className="text-muted-foreground mx-1 text-xs">
              {entries.length} {entries.length === 1 ? (isArray ? 'item' : 'key') : (isArray ? 'items' : 'keys')}
            </span>
            <span className="text-foreground">{closeBrace}{comma}</span>
          </>
        )}
      </div>
      {!isCollapsed && (
        <>
          {entries.map(([key, val], idx) => (
            <JsonNode
              key={key}
              keyName={isArray ? undefined : key}
              value={val}
              path={[...path, key]}
              collapsed={collapsed}
              onToggle={onToggle}
              isLast={idx === entries.length - 1}
              depth={depth + 1}
            />
          ))}
          <div className="py-0.5" style={{ paddingLeft: indent }}>
            <span className="text-foreground ml-5">{closeBrace}{comma}</span>
          </div>
        </>
      )}
    </div>
  );
}

// Collect all object/array paths for expand/collapse all
function collectPaths(value: JsonValue, path: string[], out: string[]) {
  if (value !== null && typeof value === 'object') {
    out.push(path.join('.'));
    const entries = Array.isArray(value)
      ? value.map((v, i) => [String(i), v] as [string, JsonValue])
      : Object.entries(value);
    for (const [k, v] of entries) {
      collectPaths(v, [...path, k], out);
    }
  }
}

const JsonTreeViewer = forwardRef<JsonTreeViewerHandle, { data: unknown }>(function JsonTreeViewer({ data }, ref) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    // Collapse everything deeper than depth 2
    const initial = new Set<string>();
    const allPaths: string[] = [];
    collectPaths(data as JsonValue, [], allPaths);
    for (const p of allPaths) {
      const depth = p === '' ? 0 : p.split('.').length;
      if (depth >= 2) initial.add(p);
    }
    return initial;
  });

  const allPaths = useMemo(() => {
    const paths: string[] = [];
    collectPaths(data as JsonValue, [], paths);
    return paths;
  }, [data]);

  const handleToggle = useCallback((pathKey: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(pathKey)) next.delete(pathKey);
      else next.add(pathKey);
      return next;
    });
  }, []);

  useImperativeHandle(ref, () => ({
    expandAll() {
      setCollapsed(new Set());
    },
    collapseAll() {
      setCollapsed(new Set(allPaths));
    },
  }), [allPaths]);

  if (data === null || typeof data !== 'object') {
    // Primitive at root — just display it
    let displayClass = 'text-foreground';
    let displayValue = JSON.stringify(data);
    if (data === null) displayClass = 'text-muted-foreground italic';
    else if (typeof data === 'boolean') displayClass = 'text-chart-5';
    else if (typeof data === 'number') displayClass = 'text-primary';
    else if (typeof data === 'string') displayClass = 'text-chart-2';

    return (
      <div className="font-mono text-sm p-3">
        <span className={displayClass}>{displayValue}</span>
      </div>
    );
  }

  return (
    <div className="font-mono text-sm overflow-auto p-2">
      <JsonNode
        value={data as JsonValue}
        path={[]}
        collapsed={collapsed}
        onToggle={handleToggle}
        isLast={true}
        depth={0}
      />
    </div>
  );
});

export default JsonTreeViewer;
