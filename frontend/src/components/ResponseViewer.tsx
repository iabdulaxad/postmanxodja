import { useState, useMemo } from 'react';
import type { ExecuteResponse, SentRequest } from '../types';
import { generateCurl } from '../utils/curlParser';

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
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden mb-3">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
      >
        <div className="flex items-center gap-2">
          <svg
            className={`w-4 h-4 text-gray-500 dark:text-gray-400 transition-transform ${isOpen ? 'rotate-90' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className="font-medium text-sm text-gray-700 dark:text-gray-300">{title}</span>
          {count !== undefined && (
            <span className="text-xs bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded-full">
              {count}
            </span>
          )}
        </div>
      </button>
      {isOpen && (
        <div className="p-4 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700">
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
    string: 'text-green-600 dark:text-green-400',
    integer: 'text-blue-600 dark:text-blue-400',
    number: 'text-blue-600 dark:text-blue-400',
    boolean: 'text-orange-600 dark:text-orange-400',
    array: 'text-purple-600 dark:text-purple-400',
    object: 'text-yellow-600 dark:text-yellow-400',
    null: 'text-gray-500 dark:text-gray-400',
  };

  const hasChildren = schema.type === 'object' && schema.properties && Object.keys(schema.properties).length > 0;
  const hasArrayItems = schema.type === 'array' && schema.items && schema.items.type === 'object';

  return (
    <div style={{ marginLeft: indent }}>
      <div className="flex items-center gap-2 py-1">
        {(hasChildren || hasArrayItems) && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="w-4 h-4 flex items-center justify-center text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
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
            <span className="font-mono text-sm text-gray-800 dark:text-gray-200">{name}</span>
            <span className="text-gray-400">:</span>
          </>
        )}

        <span className={`font-mono text-sm font-medium ${typeColors[schema.type] || 'text-gray-600'}`}>
          {schema.type}
          {schema.type === 'array' && schema.items && (
            <span className="text-gray-500">[{schema.items.type}]</span>
          )}
        </span>

        {schema.example !== undefined && schema.type !== 'object' && schema.type !== 'array' && (
          <span className="text-xs text-gray-500 dark:text-gray-400 ml-2 truncate max-w-[200px]">
            example: <span className="font-mono">{JSON.stringify(schema.example)}</span>
          </span>
        )}
      </div>

      {isExpanded && hasChildren && schema.properties && (
        <div className="border-l border-gray-300 dark:border-gray-600 ml-2">
          {Object.entries(schema.properties).map(([key, value]) => (
            <SchemaTree key={key} schema={value} name={key} depth={depth + 1} />
          ))}
        </div>
      )}

      {isExpanded && hasArrayItems && schema.items?.properties && (
        <div className="border-l border-gray-300 dark:border-gray-600 ml-2">
          <div className="text-xs text-gray-500 dark:text-gray-400 py-1 ml-4">Array items:</div>
          {Object.entries(schema.items.properties).map(([key, value]) => (
            <SchemaTree key={key} schema={value} name={key} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

// Method color helper
function getMethodColor(method: string): string {
  const colors: Record<string, string> = {
    GET: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    POST: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    PUT: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    PATCH: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
    DELETE: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  };
  return colors[method.toUpperCase()] || 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300';
}

export default function ResponseViewer({ response, request, onSaveResponse, canSaveResponse }: Props) {
  const [activeTab, setActiveTab] = useState<'body' | 'headers' | 'request' | 'schema'>('body');
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [saveResponseName, setSaveResponseName] = useState('');

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

  if (!response && !request) {
    return (
      <div className="p-8 text-gray-400 dark:text-gray-500 text-center">
        Send a request to see the response here
      </div>
    );
  }

  const getStatusColor = (status: number) => {
    if (status >= 200 && status < 300) return '#28a745';
    if (status >= 300 && status < 400) return '#ffc107';
    return '#dc3545';
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
    <div className="h-full w-full flex flex-col p-6 overflow-hidden">
      {/* Status Bar */}
      {response && (
        <div className="mb-4 flex gap-6 items-center bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 shadow-sm flex-wrap">
          {request && (
            <div className="flex items-center gap-2">
              <span className={`font-bold text-sm px-3 py-1 rounded ${getMethodColor(request.method)}`}>
                {request.method}
              </span>
              <span className="text-sm text-gray-600 dark:text-gray-400 max-w-[300px] truncate" title={request.url}>
                {request.url}
              </span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Status:</span>
            <span
              className="font-bold text-base px-3 py-1 rounded"
              style={{
                color: getStatusColor(response.status),
                backgroundColor: response.status >= 200 && response.status < 300 ? '#d4edda' :
                                 response.status >= 400 ? '#f8d7da' : '#fff3cd'
              }}
            >
              {response.status_text || `${response.status} ${getStatusText(response.status)}`}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Time:</span>
            <span className="font-semibold text-base text-gray-800 dark:text-gray-200">{response.time}ms</span>
          </div>
          {/* Save Response Button */}
          {canSaveResponse && onSaveResponse && (
            <div className="flex items-center gap-2 ml-auto">
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
                    className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-gray-700 dark:text-gray-100 w-48"
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
                    className="px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white text-sm rounded-lg font-medium transition-colors"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => {
                      setShowSaveInput(false);
                      setSaveResponseName('');
                    }}
                    className="px-3 py-1.5 bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-200 text-sm rounded-lg font-medium transition-colors"
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
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-500 hover:bg-purple-600 text-white text-sm rounded-lg font-medium transition-colors shadow-sm"
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
      <div className="mb-4 flex gap-2 border-b border-gray-300 dark:border-gray-700 overflow-x-auto">
        <button
          onClick={() => setActiveTab('body')}
          className={`
            px-5 py-2.5 font-semibold text-sm transition-all duration-150 border-b-2 whitespace-nowrap
            ${activeTab === 'body'
              ? 'border-blue-500 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30'
              : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'
            }
          `}
        >
          Response Body
        </button>
        <button
          onClick={() => setActiveTab('headers')}
          className={`
            px-5 py-2.5 font-semibold text-sm transition-all duration-150 border-b-2 whitespace-nowrap
            ${activeTab === 'headers'
              ? 'border-blue-500 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30'
              : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'
            }
          `}
        >
          Response Headers ({response ? Object.keys(response.headers).length : 0})
        </button>
        {request && (
          <button
            onClick={() => setActiveTab('request')}
            className={`
              px-5 py-2.5 font-semibold text-sm transition-all duration-150 border-b-2 whitespace-nowrap
              ${activeTab === 'request'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30'
                : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'
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
              px-5 py-2.5 font-semibold text-sm transition-all duration-150 border-b-2 whitespace-nowrap
              ${activeTab === 'schema'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30'
                : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'
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
          <div className="h-full w-full bg-white dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-600 rounded-lg shadow-md overflow-auto">
            {response.body ? (
              <pre className="m-0 p-5 whitespace-pre-wrap break-all font-mono text-sm text-gray-900 dark:text-gray-100 leading-6 max-w-full">
                {formatJSON(response.body)}
              </pre>
            ) : (
              <div className="h-full flex items-center justify-center text-gray-400 dark:text-gray-500 text-lg">
                No response body
              </div>
            )}
          </div>
        )}

        {/* Response Headers Tab */}
        {activeTab === 'headers' && response && (
          <div className="h-full w-full bg-white dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-600 rounded-lg shadow-md p-5 overflow-auto">
            {Object.keys(response.headers).length > 0 ? (
              Object.entries(response.headers).map(([key, value]) => (
                <div key={key} className="mb-4 pb-4 border-b border-gray-200 dark:border-gray-700 last:border-b-0 last:pb-0 last:mb-0">
                  <div className="font-bold text-sm text-blue-600 dark:text-blue-400 mb-2">{key}</div>
                  <div className="text-sm text-gray-800 dark:text-gray-200 break-all font-mono bg-gray-50 dark:bg-gray-700 p-2 rounded">{value}</div>
                </div>
              ))
            ) : (
              <div className="h-full flex items-center justify-center text-gray-400 dark:text-gray-500 text-lg">
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
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
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
                <code className="flex-1 text-sm font-mono bg-gray-100 dark:bg-gray-800 p-2 rounded break-all text-gray-800 dark:text-gray-200">
                  {request.url}
                </code>
              </div>
              {request.timestamp && (
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  Sent at: {new Date(request.timestamp).toLocaleString()}
                </div>
              )}
            </CollapsibleSection>

            {/* Query Parameters Section */}
            {Object.keys(request.queryParams).length > 0 && (
              <CollapsibleSection title="Query Parameters" count={Object.keys(request.queryParams).length} defaultOpen={true}>
                <div className="space-y-2">
                  {Object.entries(request.queryParams).map(([key, value]) => (
                    <div key={key} className="flex items-start gap-2">
                      <span className="font-medium text-sm text-purple-600 dark:text-purple-400 min-w-[120px]">{key}:</span>
                      <span className="text-sm text-gray-700 dark:text-gray-300 font-mono break-all">{value}</span>
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
                    <div key={key} className="flex items-start gap-2">
                      <span className="font-medium text-sm text-blue-600 dark:text-blue-400 min-w-[150px]">{key}:</span>
                      <span className="text-sm text-gray-700 dark:text-gray-300 font-mono break-all">{value}</span>
                    </div>
                  ))}
                </div>
              </CollapsibleSection>
            )}

            {/* Request Body Section - Always show if bodyType is 'raw' */}
            {(hasRequestBody || request.bodyType === 'raw') && (
              <CollapsibleSection title="Request Body" defaultOpen={true}>
                {request.bodyType && (
                  <div className="mb-2 text-xs text-gray-500 dark:text-gray-400">
                    Type: <span className="font-mono bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">{request.bodyType}</span>
                  </div>
                )}
                {request.body ? (
                  <pre className="text-sm font-mono bg-gray-100 dark:bg-gray-800 p-3 rounded overflow-auto max-h-[300px] text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-all">
                    {formatJSON(request.body)}
                  </pre>
                ) : (
                  <div className="text-sm text-gray-500 dark:text-gray-400 italic">
                    No body content
                  </div>
                )}
              </CollapsibleSection>
            )}
          </div>
        )}

        {/* Schema Tab (Swagger-style) */}
        {activeTab === 'schema' && jsonSchema && (
          <div className="h-full w-full bg-white dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-600 rounded-lg shadow-md overflow-auto">
            <div className="p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                  <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Response Schema
                </h3>
                <div className="flex gap-2 text-xs">
                  <span className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded">string</span>
                  <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded">integer</span>
                  <span className="px-2 py-1 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 rounded">boolean</span>
                  <span className="px-2 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 rounded">array</span>
                  <span className="px-2 py-1 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 rounded">object</span>
                </div>
              </div>

              <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-gray-50 dark:bg-gray-900">
                <SchemaTree schema={jsonSchema} />
              </div>
            </div>

            {/* Raw JSON Schema */}
            <div className="p-4 border-t border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-medium text-sm text-gray-700 dark:text-gray-300">Raw JSON Schema</h4>
                <button
                  onClick={() => navigator.clipboard.writeText(JSON.stringify(jsonSchema, null, 2))}
                  className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Copy
                </button>
              </div>
              <pre className="text-xs font-mono bg-gray-900 dark:bg-gray-950 text-gray-300 p-3 rounded-lg overflow-auto max-h-[200px]">
                {JSON.stringify(jsonSchema, null, 2)}
              </pre>
            </div>
          </div>
        )}

        {/* No response state */}
        {activeTab === 'body' && !response && (
          <div className="h-full flex items-center justify-center text-gray-400 dark:text-gray-500 text-lg">
            Send a request to see the response
          </div>
        )}
      </div>
    </div>
  );
}
