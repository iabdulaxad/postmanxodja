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
    let displayClass = 'text-gray-800 dark:text-gray-200';
    let displayValue = String(value);

    if (value === null) {
      displayClass = 'text-gray-400 dark:text-gray-500 italic';
      displayValue = 'null';
    } else if (typeof value === 'boolean') {
      displayClass = 'text-purple-600 dark:text-purple-400';
    } else if (typeof value === 'number') {
      displayClass = 'text-blue-600 dark:text-blue-400';
    } else if (typeof value === 'string') {
      displayClass = 'text-green-600 dark:text-green-400';
      displayValue = `"${value}"`;
    }

    return (
      <div className="flex items-center py-0.5 hover:bg-gray-50 dark:hover:bg-gray-700/50 group/node" style={{ paddingLeft: indent }}>
        {keyName !== undefined && (
          <span className="text-red-600 dark:text-red-400 mr-1">"{keyName}"<span className="text-gray-500 dark:text-gray-400">: </span></span>
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
            className="text-sm px-1 py-0 border border-blue-500 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 outline-none min-w-[60px]"
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
        <span className="text-gray-500 dark:text-gray-400">{comma}</span>
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
        className="flex items-center py-0.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50"
        style={{ paddingLeft: indent }}
        onClick={() => onToggle(pathKey)}
      >
        <span className="w-4 h-4 flex items-center justify-center text-gray-400 dark:text-gray-500 mr-1 flex-shrink-0 text-xs select-none">
          {isCollapsed ? '▶' : '▼'}
        </span>
        {keyName !== undefined && (
          <span className="text-red-600 dark:text-red-400 mr-1">"{keyName}"<span className="text-gray-500 dark:text-gray-400">: </span></span>
        )}
        <span className="text-gray-700 dark:text-gray-300">{openBrace}</span>
        {isCollapsed && (
          <>
            <span className="text-gray-400 dark:text-gray-500 mx-1 text-xs">
              {entries.length} {entries.length === 1 ? (isArray ? 'item' : 'key') : (isArray ? 'items' : 'keys')}
            </span>
            <span className="text-gray-700 dark:text-gray-300">{closeBrace}{comma}</span>
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
            <span className="text-gray-700 dark:text-gray-300 ml-5">{closeBrace}{comma}</span>
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
      <div className="p-3 text-sm text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
        Invalid JSON - switch to Raw mode to fix syntax errors
      </div>
    );
  }

  return (
    <div className="font-mono text-sm overflow-auto max-h-[400px] border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 p-2">
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
