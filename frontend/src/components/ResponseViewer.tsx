import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import type { ExecuteResponse, SentRequest } from '../types';
import { generateCurl } from '../utils/curlParser';
import JsonTreeViewer, { type JsonTreeViewerHandle } from './JsonTreeViewer';

interface Props {
  response: ExecuteResponse | null;
  request?: SentRequest | null;
  onSaveResponse?: (name: string) => void;
  canSaveResponse?: boolean;
}

// Collapsible section component
function CollapsibleSection({
  title,
  count,
  children,
  defaultOpen = false
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border border-border rounded-lg overflow-hidden mb-3">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-4 py-3 bg-muted hover:bg-accent transition-colors"
      >
        <div className="flex items-center gap-2">
          <svg
            className={`w-4 h-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-90' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className="font-medium text-sm text-foreground">{title}</span>
          {count !== undefined && (
            <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
              {count}
            </span>
          )}
        </div>
      </button>
      {isOpen && (
        <div className="p-4 bg-background border-t border-border">
          {children}
        </div>
      )}
    </div>
  );
}

// Swagger-style JSON Schema type
interface JsonSchemaType {
  type: string;
  items?: JsonSchemaType;
  properties?: Record<string, JsonSchemaType>;
  example?: unknown;
}

// Get Swagger-style type from value
function getSwaggerType(value: unknown): JsonSchemaType {
  if (value === null) {
    return { type: 'null', example: null };
  }
  if (value === undefined) {
    return { type: 'undefined' };
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return { type: 'array', items: { type: 'unknown' } };
    }
    return {
      type: 'array',
      items: getSwaggerType(value[0]),
      example: value.length > 0 ? value.slice(0, 2) : undefined
    };
  }
  if (typeof value === 'object') {
    const properties: Record<string, JsonSchemaType> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      properties[k] = getSwaggerType(v);
    }
    return { type: 'object', properties };
  }
  if (typeof value === 'number') {
    return {
      type: Number.isInteger(value) ? 'integer' : 'number',
      example: value
    };
  }
  if (typeof value === 'boolean') {
    return { type: 'boolean', example: value };
  }
  return { type: 'string', example: value };
}

// Generate JSON Schema from parsed JSON
function generateJsonSchema(obj: unknown): JsonSchemaType {
  return getSwaggerType(obj);
}

// Render Swagger-style schema tree
function SchemaTree({ schema, name, depth = 0 }: { schema: JsonSchemaType; name?: string; depth?: number }) {
  const [isExpanded, setIsExpanded] = useState(depth < 2);
  const indent = depth * 16;

  const typeColors: Record<string, string> = {
    string: 'text-chart-2',
    integer: 'text-primary',
    number: 'text-primary',
    boolean: 'text-chart-5',
    array: 'text-chart-1',
    object: 'text-foreground',
    null: 'text-muted-foreground',
  };

  const hasChildren = schema.type === 'object' && schema.properties && Object.keys(schema.properties).length > 0;
  const hasArrayItems = schema.type === 'array' && schema.items && schema.items.type === 'object';

  return (
    <div style={{ marginLeft: indent }}>
      <div className="flex items-center gap-2 py-1">
        {(hasChildren || hasArrayItems) && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="w-4 h-4 flex items-center justify-center text-muted-foreground hover:text-foreground"
          >
            <svg
              className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}
        {!hasChildren && !hasArrayItems && <span className="w-4" />}

        {name && (
          <>
            <span className="font-mono text-sm text-foreground">{name}</span>
            <span className="text-muted-foreground">:</span>
          </>
        )}

        <span className={`font-mono text-sm font-medium ${typeColors[schema.type] || 'text-muted-foreground'}`}>
          {schema.type}
          {schema.type === 'array' && schema.items && (
            <span className="text-muted-foreground">[{schema.items.type}]</span>
          )}
        </span>

        {schema.example !== undefined && schema.type !== 'object' && schema.type !== 'array' && (
          <span className="text-xs text-muted-foreground ml-2 truncate max-w-[200px]">
            example: <span className="font-mono">{JSON.stringify(schema.example)}</span>
          </span>
        )}
      </div>

      {isExpanded && hasChildren && schema.properties && (
        <div className="border-l border-border ml-2">
          {Object.entries(schema.properties).map(([key, value]) => (
            <SchemaTree key={key} schema={value} name={key} depth={depth + 1} />
          ))}
        </div>
      )}

      {isExpanded && hasArrayItems && schema.items?.properties && (
        <div className="border-l border-border ml-2">
          <div className="text-xs text-muted-foreground py-1 ml-4">Array items:</div>
          {Object.entries(schema.items.properties).map(([key, value]) => (
            <SchemaTree key={key} schema={value} name={key} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

// Method color helper
function getMethodColor(_method: string): string {
  return 'bg-primary/10 text-primary';
}

export default function ResponseViewer({ response, request, onSaveResponse, canSaveResponse }: Props) {
  const [activeTab, setActiveTab] = useState<'body' | 'headers' | 'request' | 'schema'>('body');
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [saveResponseName, setSaveResponseName] = useState('');
  const [bodyViewMode, setBodyViewMode] = useState<'pretty' | 'raw' | 'preview'>('pretty');
  const [wordWrap, setWordWrap] = useState(true);
  const [copied, setCopied] = useState(false);
  const treeRef = useRef<JsonTreeViewerHandle>(null);

  // Parse response body for schema
  const parsedBody = useMemo(() => {
    if (!response?.body) return null;
    try {
      return JSON.parse(response.body);
    } catch {
      return null;
    }
  }, [response?.body]);

  // Generate JSON Schema
  const jsonSchema = useMemo(() => {
    if (!parsedBody) return null;
    try {
      return generateJsonSchema(parsedBody);
    } catch {
      return null;
    }
  }, [parsedBody]);

  // Detect content type
  const isHtml = useMemo(() => {
    if (!response) return false;
    const ct = Object.entries(response.headers).find(([k]) => k.toLowerCase() === 'content-type')?.[1] || '';
    return ct.includes('text/html');
  }, [response]);

  const isJson = parsedBody !== null;

  // Auto-select best view mode when response changes
  useEffect(() => {
    if (isJson) setBodyViewMode('pretty');
    else if (isHtml) setBodyViewMode('preview');
    else setBodyViewMode('raw');
  }, [response?.body, isJson, isHtml]);

  // Copy handler
  const handleCopyBody = useCallback(() => {
    if (!response?.body) return;
    try {
      navigator.clipboard.writeText(JSON.stringify(JSON.parse(response.body), null, 2));
    } catch {
      navigator.clipboard.writeText(response.body);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [response?.body]);

  if (!response && !request) {
    return (
      <div className="p-8 text-muted-foreground text-center">
        Send a request to see the response here
      </div>
    );
  }

  const getStatusColor = (status: number) => {
    if (status >= 200 && status < 300) return '#16a34a'; // green-600
    if (status >= 300 && status < 400) return '#ca8a04'; // yellow-600
    return '#dc2626'; // red-600
  };

  const getStatusText = (status: number) => {
    const statusTexts: Record<number, string> = {
      200: 'OK',
      201: 'Created',
      204: 'No Content',
      400: 'Bad Request',
      401: 'Unauthorized',
      403: 'Forbidden',
      404: 'Not Found',
      500: 'Internal Server Error',
      502: 'Bad Gateway',
      503: 'Service Unavailable',
    };
    return statusTexts[status] || 'Unknown';
  };

  const formatJSON = (str: string) => {
    try {
      return JSON.stringify(JSON.parse(str), null, 2);
    } catch {
      return str;
    }
  };

  // Check if request has a body (could be empty string which is valid for display)
  const hasRequestBody = request && (request.body !== undefined && request.body !== null);

  return (
    <div className="h-full w-full flex flex-col p-3 md:p-6 overflow-hidden">
      {/* Status Bar */}
      {response && (
        <div className="mb-3 md:mb-4 flex flex-col sm:flex-row gap-2 sm:gap-3 md:gap-6 bg-card rounded-lg border border-border p-2.5 sm:p-3 md:p-4 shadow-sm sm:items-center flex-wrap">
          {request && (
            <div className="flex items-center gap-2 min-w-0">
              <span className={`font-bold text-sm px-3 py-1 rounded ${getMethodColor(request.method)}`}>
                {request.method}
              </span>
              <span className="text-sm text-muted-foreground truncate min-w-0 flex-1" title={request.url}>
                {request.url}
              </span>
            </div>
          )}
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-xs sm:text-sm font-medium text-muted-foreground">Status:</span>
            <span
              className="font-bold text-base px-3 py-1 rounded"
              style={{
                color: getStatusColor(response.status),
                backgroundColor: response.status >= 200 && response.status < 300
                  ? 'rgba(22, 163, 74, 0.1)'
                  : response.status >= 300 && response.status < 400
                    ? 'rgba(202, 138, 4, 0.1)'
                    : 'rgba(220, 38, 38, 0.1)'
              }}
            >
              {response.status_text || `${response.status} ${getStatusText(response.status)}`}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-xs sm:text-sm font-medium text-muted-foreground">Time:</span>
            <span
              className={`font-semibold text-sm sm:text-base px-2 py-0.5 rounded ${
                response.time < 200
                  ? 'text-green-700 bg-green-100 dark:text-green-400 dark:bg-green-900/30'
                  : response.time < 1000
                    ? 'text-yellow-700 bg-yellow-100 dark:text-yellow-400 dark:bg-yellow-900/30'
                    : 'text-red-700 bg-red-100 dark:text-red-400 dark:bg-red-900/30'
              }`}
            >
              {response.time}ms
            </span>
          </div>
          {/* Save Response Button */}
          {canSaveResponse && onSaveResponse && (
            <div className="flex items-center gap-2 w-full md:w-auto md:ml-auto">
              {showSaveInput ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={saveResponseName}
                    onChange={(e) => setSaveResponseName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && saveResponseName.trim()) {
                        onSaveResponse(saveResponseName.trim());
                        setSaveResponseName('');
                        setShowSaveInput(false);
                      } else if (e.key === 'Escape') {
                        setShowSaveInput(false);
                        setSaveResponseName('');
                      }
                    }}
                    placeholder="Response name..."
                    className="border border-border rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-ring focus:border-ring outline-none bg-card text-foreground w-full md:w-48"
                    autoFocus
                  />
                  <button
                    onClick={() => {
                      if (saveResponseName.trim()) {
                        onSaveResponse(saveResponseName.trim());
                        setSaveResponseName('');
                        setShowSaveInput(false);
                      }
                    }}
                    className="px-3 py-1.5 bg-primary hover:bg-primary/90 text-primary-foreground text-sm rounded-lg font-medium transition-colors"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => {
                      setShowSaveInput(false);
                      setSaveResponseName('');
                    }}
                    className="px-3 py-1.5 bg-muted hover:bg-accent text-foreground text-sm rounded-lg font-medium transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => {
                    const defaultName = `${response.status} ${getStatusText(response.status)}`;
                    setSaveResponseName(defaultName);
                    setShowSaveInput(true);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-primary hover:bg-primary/90 text-primary-foreground text-sm rounded-lg font-medium transition-colors shadow-sm"
                  title="Save this response as an example"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                  </svg>
                  Save Response
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="mb-3 md:mb-4 flex gap-1 sm:gap-2 border-b border-border overflow-x-auto">
        <button
          onClick={() => setActiveTab('body')}
          className={`
            px-3 sm:px-5 py-2 sm:py-2.5 font-semibold text-xs sm:text-sm transition-all duration-150 border-b-2 whitespace-nowrap
            ${activeTab === 'body'
              ? 'border-primary text-primary bg-primary/10'
              : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-accent'
            }
          `}
        >
          Response Body
        </button>
        <button
          onClick={() => setActiveTab('headers')}
          className={`
            px-3 sm:px-5 py-2 sm:py-2.5 font-semibold text-xs sm:text-sm transition-all duration-150 border-b-2 whitespace-nowrap
            ${activeTab === 'headers'
              ? 'border-primary text-primary bg-primary/10'
              : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-accent'
            }
          `}
        >
          Response Headers ({response ? Object.keys(response.headers).length : 0})
        </button>
        {request && (
          <button
            onClick={() => setActiveTab('request')}
            className={`
              px-3 sm:px-5 py-2 sm:py-2.5 font-semibold text-xs sm:text-sm transition-all duration-150 border-b-2 whitespace-nowrap
              ${activeTab === 'request'
                ? 'border-primary text-primary bg-primary/10'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-accent'
              }
            `}
          >
            Request Details
          </button>
        )}
        {jsonSchema && (
          <button
            onClick={() => setActiveTab('schema')}
            className={`
              px-3 sm:px-5 py-2 sm:py-2.5 font-semibold text-xs sm:text-sm transition-all duration-150 border-b-2 whitespace-nowrap
              ${activeTab === 'schema'
                ? 'border-primary text-primary bg-primary/10'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-accent'
              }
            `}
          >
            <span className="flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
              Schema
            </span>
          </button>
        )}
      </div>

      {/* Content Area */}
      <div className="flex-1 min-h-0 min-w-0 overflow-auto">
        {/* Response Body Tab */}
        {activeTab === 'body' && response && (
          <div className="h-full w-full bg-card border-2 border-border rounded-lg shadow-md overflow-hidden flex flex-col">
            {response.body ? (
              <>
                {/* Toolbar */}
                <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border bg-muted flex-shrink-0 flex-wrap">
                  {/* View mode pills */}
                  <div className="flex bg-muted rounded-md p-0.5">
                    {isJson && (
                      <button
                        onClick={() => setBodyViewMode('pretty')}
                        className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                          bodyViewMode === 'pretty'
                            ? 'bg-card text-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        Pretty
                      </button>
                    )}
                    <button
                      onClick={() => setBodyViewMode('raw')}
                      className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                        bodyViewMode === 'raw'
                          ? 'bg-card text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      Raw
                    </button>
                    {isHtml && (
                      <button
                        onClick={() => setBodyViewMode('preview')}
                        className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                          bodyViewMode === 'preview'
                            ? 'bg-card text-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        Preview
                      </button>
                    )}
                  </div>

                  <div className="flex-1" />

                  {/* Pretty mode: Expand/Collapse All */}
                  {bodyViewMode === 'pretty' && isJson && (
                    <div className="flex gap-1">
                      <button
                        onClick={() => treeRef.current?.expandAll()}
                        className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-accent rounded transition-colors"
                        title="Expand All"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                        </svg>
                      </button>
                      <button
                        onClick={() => treeRef.current?.collapseAll()}
                        className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-accent rounded transition-colors"
                        title="Collapse All"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9V4.5M9 9H4.5M9 9L3.5 3.5M9 15v4.5M9 15H4.5M9 15l-5.5 5.5M15 9h4.5M15 9V4.5M15 9l5.5-5.5M15 15h4.5M15 15v4.5m0-4.5l5.5 5.5" />
                        </svg>
                      </button>
                    </div>
                  )}

                  {/* Raw mode: Word wrap toggle */}
                  {bodyViewMode === 'raw' && (
                    <button
                      onClick={() => setWordWrap(!wordWrap)}
                      className={`px-2 py-1 text-xs rounded transition-colors ${
                        wordWrap
                          ? 'bg-primary/10 text-primary'
                          : 'text-muted-foreground hover:bg-accent'
                      }`}
                      title={wordWrap ? 'Disable word wrap' : 'Enable word wrap'}
                    >
                      Wrap
                    </button>
                  )}

                  {/* Copy button */}
                  <button
                    onClick={handleCopyBody}
                    className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-accent rounded transition-colors flex items-center gap-1"
                  >
                    {copied ? (
                      <>
                        <svg className="w-3.5 h-3.5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Copied
                      </>
                    ) : (
                      <>
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        Copy
                      </>
                    )}
                  </button>
                </div>

                {/* Body content */}
                <div className="flex-1 min-h-0 overflow-auto">
                  {bodyViewMode === 'pretty' && isJson ? (
                    <JsonTreeViewer ref={treeRef} data={parsedBody} />
                  ) : bodyViewMode === 'preview' && isHtml ? (
                    <iframe
                      srcDoc={response.body}
                      sandbox="allow-same-origin"
                      className="w-full h-full border-0 bg-background"
                      title="Response Preview"
                    />
                  ) : (
                    <pre className={`m-0 p-5 font-mono text-sm text-foreground leading-6 max-w-full ${
                      wordWrap ? 'whitespace-pre-wrap break-all' : 'whitespace-pre'
                    }`}>
                      {formatJSON(response.body)}
                    </pre>
                  )}
                </div>
              </>
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground text-lg">
                No response body
              </div>
            )}
          </div>
        )}

        {/* Response Headers Tab */}
        {activeTab === 'headers' && response && (
          <div className="h-full w-full bg-card border-2 border-border rounded-lg shadow-md p-5 overflow-auto">
            {Object.keys(response.headers).length > 0 ? (
              Object.entries(response.headers).map(([key, value]) => (
                <div key={key} className="mb-4 pb-4 border-b border-border last:border-b-0 last:pb-0 last:mb-0">
                  <div className="font-bold text-sm text-primary mb-2">{key}</div>
                  <div className="text-sm text-foreground break-all font-mono bg-muted p-2 rounded">{value}</div>
                </div>
              ))
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground text-lg">
                No headers
              </div>
            )}
          </div>
        )}

        {/* Request Details Tab */}
        {activeTab === 'request' && request && (
          <div className="h-full w-full overflow-auto">
            {/* Copy as cURL */}
            <div className="mb-3 flex justify-end">
              <button
                onClick={() => {
                  const curl = generateCurl({
                    method: request.method,
                    url: request.url,
                    headers: request.headers,
                    body: request.body || undefined,
                  });
                  navigator.clipboard.writeText(curl);
                  const btn = document.activeElement as HTMLButtonElement;
                  const orig = btn.textContent;
                  btn.textContent = 'Copied!';
                  setTimeout(() => { btn.textContent = orig; }, 2000);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-muted text-muted-foreground rounded-lg hover:bg-accent transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                Copy as cURL
              </button>
            </div>

            {/* Request URL Section */}
            <CollapsibleSection title="Request URL" defaultOpen={true}>
              <div className="flex items-center gap-3 mb-3">
                <span className={`font-bold text-sm px-3 py-1 rounded ${getMethodColor(request.method)}`}>
                  {request.method}
                </span>
                <code className="flex-1 text-sm font-mono bg-muted p-2 rounded break-all text-foreground">
                  {request.url}
                </code>
              </div>
              {request.timestamp && (
                <div className="text-xs text-muted-foreground">
                  Sent at: {new Date(request.timestamp).toLocaleString()}
                </div>
              )}
            </CollapsibleSection>

            {/* Query Parameters Section */}
            {Object.keys(request.queryParams).length > 0 && (
              <CollapsibleSection title="Query Parameters" count={Object.keys(request.queryParams).length} defaultOpen={true}>
                <div className="space-y-2">
                  {Object.entries(request.queryParams).map(([key, value]) => (
                    <div key={key} className="flex flex-col md:flex-row md:items-start gap-0.5 md:gap-2">
                      <span className="font-medium text-sm text-primary shrink-0">{key}:</span>
                      <span className="text-sm text-foreground font-mono break-all">{value}</span>
                    </div>
                  ))}
                </div>
              </CollapsibleSection>
            )}

            {/* Request Headers Section */}
            {Object.keys(request.headers).length > 0 && (
              <CollapsibleSection title="Request Headers" count={Object.keys(request.headers).length}>
                <div className="space-y-2">
                  {Object.entries(request.headers).map(([key, value]) => (
                    <div key={key} className="flex flex-col md:flex-row md:items-start gap-0.5 md:gap-2">
                      <span className="font-medium text-sm text-primary shrink-0">{key}:</span>
                      <span className="text-sm text-foreground font-mono break-all">{value}</span>
                    </div>
                  ))}
                </div>
              </CollapsibleSection>
            )}

            {/* Request Body Section - Always show if bodyType is 'raw' */}
            {(hasRequestBody || request.bodyType === 'raw') && (
              <CollapsibleSection title="Request Body" defaultOpen={true}>
                {request.bodyType && (
                  <div className="mb-2 text-xs text-muted-foreground">
                    Type: <span className="font-mono bg-muted px-1.5 py-0.5 rounded">{request.bodyType}</span>
                  </div>
                )}
                {request.body ? (
                  <pre className="text-sm font-mono bg-muted p-3 rounded overflow-auto max-h-[300px] text-foreground whitespace-pre-wrap break-all">
                    {formatJSON(request.body)}
                  </pre>
                ) : (
                  <div className="text-sm text-muted-foreground italic">
                    No body content
                  </div>
                )}
              </CollapsibleSection>
            )}
          </div>
        )}

        {/* Schema Tab (Swagger-style) */}
        {activeTab === 'schema' && jsonSchema && (
          <div className="h-full w-full bg-card border-2 border-border rounded-lg shadow-md overflow-auto">
            <div className="p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-foreground flex items-center gap-2">
                  <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Response Schema
                </h3>
                <div className="hidden md:flex gap-2 text-xs">
                  <span className="px-2 py-1 bg-chart-2/20 text-chart-2 rounded">string</span>
                  <span className="px-2 py-1 bg-primary/10 text-primary rounded">integer</span>
                  <span className="px-2 py-1 bg-chart-5/20 text-chart-5 rounded">boolean</span>
                  <span className="px-2 py-1 bg-chart-1/20 text-chart-1 rounded">array</span>
                  <span className="px-2 py-1 bg-accent text-foreground rounded">object</span>
                </div>
              </div>

              <div className="border border-border rounded-lg p-4 bg-muted">
                <SchemaTree schema={jsonSchema} />
              </div>
            </div>

            {/* Raw JSON Schema */}
            <div className="p-4 border-t border-border">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-medium text-sm text-foreground">Raw JSON Schema</h4>
                <button
                  onClick={() => navigator.clipboard.writeText(JSON.stringify(jsonSchema, null, 2))}
                  className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium bg-muted text-muted-foreground rounded hover:bg-accent transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Copy
                </button>
              </div>
              <pre className="text-xs font-mono bg-foreground text-background p-3 rounded-lg overflow-auto max-h-[200px]">
                {JSON.stringify(jsonSchema, null, 2)}
              </pre>
            </div>
          </div>
        )}

        {/* No response state */}
        {activeTab === 'body' && !response && (
          <div className="h-full flex items-center justify-center text-muted-foreground text-lg">
            Send a request to see the response
          </div>
        )}
      </div>
    </div>
  );
}
