import { useState, useCallback, useMemo } from 'react';

interface JsonTreeEditorProps {
  value: string;
  onChange: (value: string) => void;
}

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

interface NodeProps {
  keyName?: string;
  value: JsonValue;
  path: string[];
  collapsed: Set<string>;
  onToggle: (path: string) => void;
  onValueChange: (path: string[], newValue: JsonValue) => void;
  isLast: boolean;
  depth: number;
}

function JsonNode({ keyName, value, path, collapsed, onToggle, onValueChange, isLast, depth }: NodeProps) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const pathKey = path.join('.');
  const indent = depth * 20;

  const startEdit = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (typeof value === 'object' && value !== null) return;
    setEditValue(typeof value === 'string' ? value : JSON.stringify(value));
    setEditing(true);
  }, [value]);

  const commitEdit = useCallback(() => {
    setEditing(false);
    let parsed: JsonValue;
    if (editValue === 'null') parsed = null;
    else if (editValue === 'true') parsed = true;
    else if (editValue === 'false') parsed = false;
    else if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(editValue)) parsed = Number(editValue);
    else parsed = editValue;
    onValueChange(path, parsed);
  }, [editValue, path, onValueChange]);

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
    } else if (typeof value === 'number') {
      displayClass = 'text-primary';
    } else if (typeof value === 'string') {
      displayClass = 'text-chart-2';
      displayValue = `"${value}"`;
    }

    return (
      <div className="flex items-center py-0.5 hover:bg-accent/50 group/node" style={{ paddingLeft: indent }}>
        {keyName !== undefined && (
          <span className="text-chart-1 mr-1">"{keyName}"<span className="text-muted-foreground">: </span></span>
        )}
        {editing ? (
          <input
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitEdit();
              if (e.key === 'Escape') setEditing(false);
            }}
            className="text-sm px-1 py-0 border border-ring rounded bg-card text-foreground outline-none min-w-[60px]"
            autoFocus
          />
        ) : (
          <span
            className={`${displayClass} cursor-pointer hover:underline`}
            onDoubleClick={startEdit}
            title="Double-click to edit"
          >
            {displayValue}
          </span>
        )}
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
              onValueChange={onValueChange}
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

export default function JsonTreeEditor({ value, onChange }: JsonTreeEditorProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const parsed = useMemo((): { valid: true; data: JsonValue } | { valid: false } => {
    try {
      return { valid: true, data: JSON.parse(value) };
    } catch {
      return { valid: false };
    }
  }, [value]);

  const handleToggle = useCallback((pathKey: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(pathKey)) next.delete(pathKey);
      else next.add(pathKey);
      return next;
    });
  }, []);

  const handleValueChange = useCallback((path: string[], newValue: JsonValue) => {
    if (!parsed.valid) return;
    const root = JSON.parse(JSON.stringify(parsed.data));

    let current: any = root;
    for (let i = 0; i < path.length - 1; i++) {
      current = current[Array.isArray(current) ? Number(path[i]) : path[i]];
    }
    const lastKey = path[path.length - 1];
    current[Array.isArray(current) ? Number(lastKey) : lastKey] = newValue;

    onChange(JSON.stringify(root, null, 2));
  }, [parsed, onChange]);

  if (!parsed.valid) {
    return (
      <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-lg border border-destructive/20">
        Invalid JSON - switch to Raw mode to fix syntax errors
      </div>
    );
  }

  return (
    <div className="font-mono text-sm overflow-auto max-h-[400px] border border-border rounded-lg bg-card p-2">
      <JsonNode
        value={parsed.data}
        path={[]}
        collapsed={collapsed}
        onToggle={handleToggle}
        onValueChange={handleValueChange}
        isLast={true}
        depth={0}
      />
    </div>
  );
}
