import { useState, useEffect, useRef } from 'react';
import { executeRequest } from '../services/api';
import VariableInput from './VariableInput';
import JsonTreeEditor from './JsonTreeEditor';
import { parseCurl, generateCurl } from '../utils/curlParser';
import type { ExecuteRequest, ExecuteResponse, Environment, RequestTab, BodyType, FormDataItem, SentRequest } from '../types';

interface Props {
  environments: Environment[];
  onResponse: (response: ExecuteResponse, sentRequest: SentRequest) => void;
  initialMethod?: string;
  initialUrl?: string;
  initialHeaders?: Record<string, string>;
  initialBody?: string;
  initialQueryParams?: Record<string, string>;
  initialName?: string;
  onUpdate?: (updates: Partial<RequestTab>) => void;
  hasCollectionSource?: boolean;
  onSaveToCollection?: () => void;
}

export default function RequestBuilder({
  environments,
  onResponse,
  initialMethod = 'GET',
  initialUrl = '',
  initialHeaders = {},
  initialBody = '',
  initialQueryParams = {},
  initialName = 'Untitled',
  onUpdate,
  hasCollectionSource = false,
  onSaveToCollection,
}: Props) {
  const [method, setMethod] = useState(initialMethod);
  const [url, setUrl] = useState(initialUrl);
  const [headers, setHeaders] = useState<Array<{ key: string; value: string }>>(() =>
    Object.entries(initialHeaders).map(([key, value]) => ({ key, value }))
  );
  const [body, setBody] = useState(initialBody);
  const [bodyType, setBodyType] = useState<BodyType>('raw');
  const [formData, setFormData] = useState<FormDataItem[]>([]);
  const [queryParams, setQueryParams] = useState<Array<{ key: string; value: string }>>(() =>
    Object.entries(initialQueryParams).map(([key, value]) => ({ key, value }))
  );
  const [selectedEnvId, setSelectedEnvId] = useState<number | undefined>();
  const [loading, setLoading] = useState(false);
  const [activeSection, setActiveSection] = useState<'params' | 'headers' | 'body'>('params');
  const [curlCopied, setCurlCopied] = useState(false);
  const [bodyViewMode, setBodyViewMode] = useState<'raw' | 'tree'>('raw');

  // Track if this is the first render to skip initial onUpdate call
  const isInitialMount = useRef(true);
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  // Ref to prevent infinite loops when syncing URL and query params
  const isUpdatingFromParams = useRef(false);

  // Helper to parse query params from URL
  const parseQueryParamsFromUrl = (urlString: string): Array<{ key: string; value: string }> => {
    try {
      const urlObj = new URL(urlString.startsWith('http') ? urlString : `http://${urlString}`);
      const params: Array<{ key: string; value: string }> = [];
      urlObj.searchParams.forEach((value, key) => {
        params.push({ key, value });
      });
      return params;
    } catch {
      // Try to parse query string manually if URL is invalid
      const queryIndex = urlString.indexOf('?');
      if (queryIndex === -1) return [];
      const queryString = urlString.slice(queryIndex + 1);
      const params: Array<{ key: string; value: string }> = [];
      queryString.split('&').forEach(part => {
        const [key, value = ''] = part.split('=');
        if (key) {
          params.push({ key: decodeURIComponent(key), value: decodeURIComponent(value) });
        }
      });
      return params;
    }
  };

  // Helper to build URL with query params
  const buildUrlWithParams = (baseUrl: string, params: Array<{ key: string; value: string }>): string => {
    // Remove existing query params from URL
    let cleanUrl = baseUrl;
    const queryIndex = baseUrl.indexOf('?');
    if (queryIndex !== -1) {
      cleanUrl = baseUrl.slice(0, queryIndex);
    }

    // Build new query string from params
    const validParams = params.filter(p => p.key);
    if (validParams.length === 0) return cleanUrl;

    const queryString = validParams
      .map(p => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`)
      .join('&');
    return `${cleanUrl}?${queryString}`;
  };


  // Helper to notify parent of changes
  const notifyUpdate = (updates: {
    method?: string;
    url?: string;
    headers?: Array<{ key: string; value: string }>;
    body?: string;
    queryParams?: Array<{ key: string; value: string }>;
  }) => {
    if (isInitialMount.current) return;
    if (!onUpdateRef.current) return;

    const currentHeaders = updates.headers ?? headers;
    const currentParams = updates.queryParams ?? queryParams;
    const currentUrl = updates.url ?? url;

    const result: Partial<RequestTab> = {
      method: updates.method ?? method,
      url: currentUrl,
      headers: Object.fromEntries(currentHeaders.filter(h => h.key).map(h => [h.key, h.value])),
      body: updates.body ?? body,
      queryParams: Object.fromEntries(currentParams.filter(q => q.key).map(q => [q.key, q.value])),
    };

    // Only auto-generate tab name for fresh "Untitled" tabs when the URL changes.
    // Existing requests (from collections, imports, or user renames) keep their name.
    if (updates.url !== undefined && initialName === 'Untitled') {
      let name = 'Untitled';
      if (currentUrl) {
        try {
          const urlObj = new URL(currentUrl.startsWith('http') ? currentUrl : `http://${currentUrl}`);
          name = urlObj.pathname === '/' ? urlObj.hostname : urlObj.pathname.split('/').pop() || urlObj.hostname;
        } catch {
          const parts = currentUrl.split('/');
          name = parts[parts.length - 1] || parts[parts.length - 2] || 'Untitled';
        }
      }
      result.name = name;
    }

    onUpdateRef.current(result);
  };

  // Mark initial mount as complete after first render
  useEffect(() => {
    isInitialMount.current = false;
  }, []);

  // Note: We don't sync from selectedRequest here because:
  // 1. Initial values come from initial* props
  // 2. key={activeTabId} causes component remount on tab change
  // 3. Syncing here would overwrite user input on every render

  const handleSend = async () => {
    if (!url || url.trim() === '') {
      alert('Please enter a URL');
      return;
    }

    setLoading(true);

    try {
      const headersObj = Object.fromEntries(headers.filter(h => h.key).map(h => [h.key.trim(), h.value]));

      // url already contains query params (synced by buildUrlWithParams),
      // so pass empty query_params to avoid duplication
      const request: ExecuteRequest = {
        method,
        url,
        headers: headersObj,
        body: bodyType === 'raw' ? body : '',
        body_type: bodyType,
        form_data: bodyType === 'form-data' ? formData.filter(f => f.key) : undefined,
        query_params: {},
        environment_id: selectedEnvId
      };

      const response = await executeRequest(request);
      console.log('Response received:', response);

      // Debug: Log the body value
      console.log('Body state value:', body);
      console.log('Body type:', bodyType);
      console.log('Body to send:', bodyType === 'raw' ? body : '');

      // Create sent request info for Swagger-like display
      // Always capture the body for raw type, don't check if empty
      const sentRequest: SentRequest = {
        method,
        url,
        headers: headersObj,
        body: body, // Always pass the body, let the viewer handle display
        bodyType,
        queryParams: Object.fromEntries(queryParams.filter(q => q.key).map(q => [q.key.trim(), q.value])),
        timestamp: Date.now(),
      };

      console.log('Sent request object:', sentRequest);

      onResponse(response, sentRequest);
    } catch (err: any) {
      console.error('Request failed:', err);
      console.error('Error details:', err.response);
      alert(err.response?.data?.error || err.message || 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  const addHeader = () => {
    const newHeaders = [...headers, { key: '', value: '' }];
    setHeaders(newHeaders);
    notifyUpdate({ headers: newHeaders });
  };
  const updateHeader = (index: number, field: 'key' | 'value', value: string) => {
    const newHeaders = [...headers];
    newHeaders[index][field] = value;
    setHeaders(newHeaders);
    notifyUpdate({ headers: newHeaders });
  };
  const removeHeader = (index: number) => {
    const newHeaders = headers.filter((_, i) => i !== index);
    setHeaders(newHeaders);
    notifyUpdate({ headers: newHeaders });
  };

  const addQueryParam = () => {
    const newParams = [...queryParams, { key: '', value: '' }];
    setQueryParams(newParams);
    // Update URL with new params
    isUpdatingFromParams.current = true;
    const newUrl = buildUrlWithParams(url, newParams);
    setUrl(newUrl);
    notifyUpdate({ queryParams: newParams, url: newUrl });
    isUpdatingFromParams.current = false;
  };
  const updateQueryParam = (index: number, field: 'key' | 'value', value: string) => {
    const newParams = [...queryParams];
    newParams[index][field] = value;
    setQueryParams(newParams);
    // Update URL with new params
    isUpdatingFromParams.current = true;
    const newUrl = buildUrlWithParams(url, newParams);
    setUrl(newUrl);
    notifyUpdate({ queryParams: newParams, url: newUrl });
    isUpdatingFromParams.current = false;
  };
  const removeQueryParam = (index: number) => {
    const newParams = queryParams.filter((_, i) => i !== index);
    setQueryParams(newParams);
    // Update URL with remaining params
    isUpdatingFromParams.current = true;
    const newUrl = buildUrlWithParams(url, newParams);
    setUrl(newUrl);
    notifyUpdate({ queryParams: newParams, url: newUrl });
    isUpdatingFromParams.current = false;
  };

  // Form data management
  const addFormDataItem = () => {
    setFormData([...formData, { key: '', value: '', type: 'text' }]);
  };

  const updateFormDataItem = (index: number, field: keyof FormDataItem, value: string | File) => {
    const newFormData = [...formData];
    if (field === 'file' && value instanceof File) {
      newFormData[index] = { ...newFormData[index], file: value };
    } else if (field === 'type') {
      newFormData[index] = { ...newFormData[index], type: value as 'text' | 'file', file: undefined };
    } else {
      newFormData[index] = { ...newFormData[index], [field]: value as string };
    }
    setFormData(newFormData);
  };

  const removeFormDataItem = (index: number) => {
    setFormData(formData.filter((_, i) => i !== index));
  };

  return (
    <div className="p-3 md:p-6 h-full overflow-auto">
      {selectedEnvId && (
        <div className="p-3 mb-4 bg-blue-50 dark:bg-blue-900/30 border-l-4 border-blue-500 rounded-r-lg">
          <p className="text-sm text-blue-800 dark:text-blue-200">
            Use <code className="bg-white dark:bg-gray-700 px-2 py-0.5 rounded text-xs font-mono">{'{{variableName}}'}</code> to insert environment variables in URL, headers, params, or body
          </p>
        </div>
      )}
      <div className="mb-3 md:mb-6 space-y-2 md:space-y-0 md:flex md:gap-3 md:items-center">
        <div className="flex gap-2 items-center md:flex-1 md:min-w-0">
          <select
            value={method}
            onChange={(e) => {
              setMethod(e.target.value);
              notifyUpdate({ method: e.target.value });
            }}
            className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-gray-700 dark:text-gray-100 shadow-sm flex-shrink-0"
          >
            <option>GET</option>
            <option>POST</option>
            <option>PUT</option>
            <option>DELETE</option>
            <option>PATCH</option>
          </select>

          <div className="flex-1 min-w-0">
            <VariableInput
              value={url}
              onChange={(newUrl) => {
                // Detect pasted cURL command
                const trimmed = newUrl.trim();
                if (/^curl\s/i.test(trimmed)) {
                  try {
                    const parsed = parseCurl(trimmed);
                    setUrl(parsed.url);
                    setMethod(parsed.method);
                    // Always reset body/bodyType — if curl has no body, clear it
                    setBody(parsed.body || '');
                    setBodyType(parsed.body ? 'raw' : 'none');
                    // Always reset headers — if curl has no headers, clear them
                    const parsedHeaders = Object.entries(parsed.headers).map(([key, value]) => ({ key, value }));
                    setHeaders(parsedHeaders);
                    const parsedParams = parseQueryParamsFromUrl(parsed.url);
                    setQueryParams(parsedParams.length > 0 ? parsedParams : []);
                    notifyUpdate({
                      method: parsed.method,
                      url: parsed.url,
                      headers: parsedHeaders,
                      body: parsed.body || '',
                      queryParams: parsedParams,
                    });
                    return;
                  } catch {
                    // Not a valid curl — fall through to normal URL handling
                  }
                }

                setUrl(newUrl);
                // Parse query params from URL and update params list
                if (!isUpdatingFromParams.current) {
                  const parsedParams = parseQueryParamsFromUrl(newUrl);
                  // Merge with existing params that have keys not in URL
                  // This preserves params with empty keys being edited
                  const existingEmptyKeyParams = queryParams.filter(p => !p.key);
                  const newParams = [...parsedParams, ...existingEmptyKeyParams];
                  setQueryParams(newParams.length > 0 ? newParams : []);
                  notifyUpdate({ url: newUrl, queryParams: newParams });
                } else {
                  notifyUpdate({ url: newUrl });
                }
              }}
              placeholder="Enter request URL or paste cURL"
              environments={environments}
              selectedEnvId={selectedEnvId}
              className="shadow-sm"
            />
          </div>
        </div>

        <div className="flex gap-2 items-center flex-wrap min-w-0">
          <select
            value={selectedEnvId || ''}
            onChange={(e) => setSelectedEnvId(e.target.value ? Number(e.target.value) : undefined)}
            className="border border-gray-300 dark:border-gray-600 rounded-lg px-2 sm:px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-gray-700 dark:text-gray-100 shadow-sm flex-1 md:flex-initial min-w-0 max-w-[140px] sm:max-w-none"
          >
            <option value="">No Environment</option>
            {environments.map(env => (
              <option key={env.id} value={env.id}>{env.name}</option>
            ))}
          </select>

          <button
            onClick={handleSend}
            disabled={loading}
            className={`
              px-4 md:px-6 py-2 rounded-lg shadow-sm font-medium text-sm transition-colors duration-150
              ${loading
                ? 'bg-gray-400 text-white cursor-not-allowed'
                : 'bg-green-500 hover:bg-green-600 text-white'
              }
            `}
          >
            {loading ? 'Sending...' : 'Send'}
          </button>
          <button
            onClick={() => {
              const headersObj = Object.fromEntries(headers.filter(h => h.key).map(h => [h.key.trim(), h.value]));
              const curl = generateCurl({
                method,
                url,
                headers: headersObj,
                body: bodyType === 'raw' ? body : undefined,
              });
              navigator.clipboard.writeText(curl);
              setCurlCopied(true);
              setTimeout(() => setCurlCopied(false), 2000);
            }}
            className="px-3 md:px-4 py-2 rounded-lg shadow-sm font-medium text-sm transition-colors duration-150 bg-gray-500 hover:bg-gray-600 text-white"
            title="Copy as cURL"
          >
            {curlCopied ? 'Copied!' : 'cURL'}
          </button>
          <button
            onClick={() => {
              notifyUpdate({});
              if (onSaveToCollection) {
                onSaveToCollection();
              }
            }}
            className="px-3 md:px-4 py-2 rounded-lg shadow-sm font-medium text-sm transition-colors duration-150 bg-blue-500 hover:bg-blue-600 text-white"
            title={hasCollectionSource ? "Save to collection" : "Save to collection"}
          >
            Save
          </button>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
        <div className="flex border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setActiveSection('params')}
            className={`relative px-4 py-2.5 text-sm font-medium transition-colors ${
              activeSection === 'params'
                ? 'text-blue-600 dark:text-blue-400'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <span className="flex items-center gap-1.5">
              Params
              {queryParams.filter(p => p.key).length > 0 && (
                <span className="text-[10px] min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 font-semibold">
                  {queryParams.filter(p => p.key).length}
                </span>
              )}
            </span>
            {activeSection === 'params' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500" />
            )}
          </button>
          <button
            onClick={() => setActiveSection('headers')}
            className={`relative px-4 py-2.5 text-sm font-medium transition-colors ${
              activeSection === 'headers'
                ? 'text-blue-600 dark:text-blue-400'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <span className="flex items-center gap-1.5">
              Headers
              {headers.filter(h => h.key).length > 0 && (
                <span className="text-[10px] min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 font-semibold">
                  {headers.filter(h => h.key).length}
                </span>
              )}
            </span>
            {activeSection === 'headers' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500" />
            )}
          </button>
          <button
            onClick={() => setActiveSection('body')}
            className={`relative px-4 py-2.5 text-sm font-medium transition-colors ${
              activeSection === 'body'
                ? 'text-blue-600 dark:text-blue-400'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <span className="flex items-center gap-1.5">
              Body
              {bodyType !== 'none' && (
                <span className={`w-2 h-2 rounded-full ${
                  bodyType === 'raw' && body ? 'bg-green-500' : 'bg-yellow-500'
                }`} />
              )}
            </span>
            {activeSection === 'body' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500" />
            )}
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-4">
          {/* Params Tab */}
          {activeSection === 'params' && (
            <div>
              {queryParams.map((param, index) => (
                <div key={index} className="flex flex-col gap-1 mb-3 md:flex-row md:gap-3 md:mb-2">
                  <input
                    type="text"
                    value={param.key}
                    onChange={(e) => updateQueryParam(index, 'key', e.target.value)}
                    placeholder="Key"
                    className="w-full md:flex-1 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-gray-700 dark:text-gray-100"
                  />
                  <div className="flex gap-2 md:flex-1 md:min-w-0">
                    <div className="flex-1 min-w-0">
                      <VariableInput
                        value={param.value}
                        onChange={(value) => updateQueryParam(index, 'value', value)}
                        placeholder="Value"
                        environments={environments}
                        selectedEnvId={selectedEnvId}
                      />
                    </div>
                    <button
                      onClick={() => removeQueryParam(index)}
                      className="p-2 md:px-3 md:py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm transition-colors duration-150 shrink-0"
                    >
                      <svg className="w-4 h-4 md:hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      <span className="hidden md:inline">Remove</span>
                    </button>
                  </div>
                </div>
              ))}
              <button
                onClick={addQueryParam}
                className="mt-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm shadow-sm transition-colors duration-150"
              >
                Add Param
              </button>
            </div>
          )}

          {/* Headers Tab */}
          {activeSection === 'headers' && (
            <div>
              {headers.map((header, index) => (
                <div key={index} className="flex flex-col gap-1 mb-3 md:flex-row md:gap-3 md:mb-2">
                  <input
                    type="text"
                    value={header.key}
                    onChange={(e) => updateHeader(index, 'key', e.target.value)}
                    placeholder="Key"
                    className="w-full md:flex-1 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-gray-700 dark:text-gray-100"
                  />
                  <div className="flex gap-2 md:flex-1 md:min-w-0">
                    <div className="flex-1 min-w-0">
                      <VariableInput
                        value={header.value}
                        onChange={(value) => updateHeader(index, 'value', value)}
                        placeholder="Value"
                        environments={environments}
                        selectedEnvId={selectedEnvId}
                      />
                    </div>
                    <button
                      onClick={() => removeHeader(index)}
                      className="p-2 md:px-3 md:py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm transition-colors duration-150 shrink-0"
                    >
                      <svg className="w-4 h-4 md:hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      <span className="hidden md:inline">Remove</span>
                    </button>
                  </div>
                </div>
              ))}
              <button
                onClick={addHeader}
                className="mt-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm shadow-sm transition-colors duration-150"
              >
                Add Header
              </button>
            </div>
          )}

          {/* Body Tab */}
          {activeSection === 'body' && (
            <div>
              <div className="flex flex-wrap gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-1 mb-3 w-fit">
                <button
                  onClick={() => setBodyType('none')}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                    bodyType === 'none' ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 shadow-sm' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                  }`}
                >
                  none
                </button>
                <button
                  onClick={() => setBodyType('raw')}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                    bodyType === 'raw' ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 shadow-sm' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                  }`}
                >
                  raw
                </button>
                <button
                  onClick={() => setBodyType('form-data')}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                    bodyType === 'form-data' ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 shadow-sm' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                  }`}
                >
                  form-data
                </button>
                <button
                  onClick={() => setBodyType('x-www-form-urlencoded')}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                    bodyType === 'x-www-form-urlencoded' ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 shadow-sm' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                  }`}
                >
                  x-www-form-urlencoded
                </button>
              </div>

              {bodyType === 'none' && (
                <p className="text-gray-500 dark:text-gray-400 text-sm italic">This request does not have a body</p>
              )}

              {bodyType === 'raw' && (
                <div>
                  <div className="flex justify-end mb-2 gap-2">
                    <div className="flex bg-gray-100 dark:bg-gray-700 rounded-md p-0.5">
                      <button
                        onClick={() => setBodyViewMode('raw')}
                        className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                          bodyViewMode === 'raw'
                            ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 shadow-sm'
                            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                        }`}
                      >
                        Raw
                      </button>
                      <button
                        onClick={() => setBodyViewMode('tree')}
                        className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                          bodyViewMode === 'tree'
                            ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 shadow-sm'
                            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                        }`}
                      >
                        Tree
                      </button>
                    </div>
                    {bodyViewMode === 'raw' && (
                      <button
                        onClick={() => {
                          try {
                            const placeholders: string[] = [];
                            const safeBody = body.replace(/\{\{([^}]+)\}\}/g, (m) => {
                              const idx = placeholders.length;
                              placeholders.push(m);
                              return `"__VAR_${idx}__"`;
                            });

                            const parsed = JSON.parse(safeBody);
                            let formatted = JSON.stringify(parsed, null, 2);

                            placeholders.forEach((original, idx) => {
                              formatted = formatted.replace(`"__VAR_${idx}__"`, original);
                            });

                            setBody(formatted);
                            notifyUpdate({ body: formatted });
                          } catch {
                            // not valid JSON — ignore
                          }
                        }}
                        className="px-3 py-1 text-xs font-medium rounded-md bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                      >
                        Beautify JSON
                      </button>
                    )}
                  </div>
                  {bodyViewMode === 'raw' ? (
                    <VariableInput
                      value={body}
                      onChange={(value) => {
                        setBody(value);
                        notifyUpdate({ body: value });
                      }}
                      placeholder="Request body (JSON, text, etc.)"
                      environments={environments}
                      selectedEnvId={selectedEnvId}
                      multiline
                      jsonHighlight
                    />
                  ) : (
                    <JsonTreeEditor
                      value={body}
                      onChange={(value) => {
                        setBody(value);
                        notifyUpdate({ body: value });
                      }}
                    />
                  )}
                </div>
              )}

              {bodyType === 'form-data' && (
                <div>
                  {formData.map((item, index) => (
                    <div key={index} className="flex flex-col gap-1 mb-3 md:flex-row md:gap-3 md:mb-2 md:items-center">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={item.key}
                          onChange={(e) => updateFormDataItem(index, 'key', e.target.value)}
                          placeholder="Key"
                          className="flex-1 md:w-auto border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-gray-700 dark:text-gray-100"
                        />
                        <select
                          value={item.type}
                          onChange={(e) => updateFormDataItem(index, 'type', e.target.value)}
                          className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-gray-700 dark:text-gray-100"
                        >
                          <option value="text">Text</option>
                          <option value="file">File</option>
                        </select>
                      </div>
                      <div className="flex gap-2 md:flex-1 md:min-w-0">
                        {item.type === 'text' ? (
                          <div className="flex-1 min-w-0">
                            <VariableInput
                              value={item.value}
                              onChange={(value) => updateFormDataItem(index, 'value', value)}
                              placeholder="Value"
                              environments={environments}
                              selectedEnvId={selectedEnvId}
                            />
                          </div>
                        ) : (
                          <div className="flex-1 min-w-0">
                            <label className="flex items-center gap-2 cursor-pointer border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors dark:text-gray-200">
                              <svg className="w-4 h-4 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                              <span className="text-gray-600 dark:text-gray-300 truncate">
                                {item.file ? item.file.name : 'Choose file...'}
                              </span>
                              <input
                                type="file"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) updateFormDataItem(index, 'file', file);
                                }}
                                className="hidden"
                              />
                            </label>
                          </div>
                        )}
                        <button
                          onClick={() => removeFormDataItem(index)}
                          className="p-2 md:px-3 md:py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm transition-colors duration-150 shrink-0"
                        >
                          <svg className="w-4 h-4 md:hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                          <span className="hidden md:inline">Remove</span>
                        </button>
                      </div>
                    </div>
                  ))}
                  <button
                    onClick={addFormDataItem}
                    className="mt-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm shadow-sm transition-colors duration-150"
                  >
                    Add Field
                  </button>
                </div>
              )}

              {bodyType === 'x-www-form-urlencoded' && (
                <div>
                  {formData.map((item, index) => (
                    <div key={index} className="flex flex-col gap-1 mb-3 md:flex-row md:gap-3 md:mb-2">
                      <input
                        type="text"
                        value={item.key}
                        onChange={(e) => updateFormDataItem(index, 'key', e.target.value)}
                        placeholder="Key"
                        className="w-full md:flex-1 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-gray-700 dark:text-gray-100"
                      />
                      <div className="flex gap-2 md:flex-1 md:min-w-0">
                        <div className="flex-1 min-w-0">
                          <VariableInput
                            value={item.value}
                            onChange={(value) => updateFormDataItem(index, 'value', value)}
                            placeholder="Value"
                            environments={environments}
                            selectedEnvId={selectedEnvId}
                          />
                        </div>
                        <button
                          onClick={() => removeFormDataItem(index)}
                          className="p-2 md:px-3 md:py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm transition-colors duration-150 shrink-0"
                        >
                          <svg className="w-4 h-4 md:hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                          <span className="hidden md:inline">Remove</span>
                        </button>
                      </div>
                    </div>
                  ))}
                  <button
                    onClick={addFormDataItem}
                    className="mt-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm shadow-sm transition-colors duration-150"
                  >
                    Add Field
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
