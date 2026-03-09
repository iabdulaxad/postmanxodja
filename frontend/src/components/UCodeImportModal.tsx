import { useState, useEffect } from 'react';
import { parseDBML, generateUCodeCollection, generateAIUCodeCollection } from '../utils/dbmlParser';
import { useTeam } from '../contexts/TeamContext';
import { getAISettings, analyzeDBML, AIAnalysisResult, AIAnalyzeResponse } from '../services/ai';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onImport: (collectionJSON: string) => void;
}

export default function UCodeImportModal({ isOpen, onClose, onImport }: Props) {
  const { currentTeam } = useTeam();
  const [projectId, setProjectId] = useState('');
  const [environmentId, setEnvironmentId] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('https://api.admin.u-code.io');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<'config' | 'preview' | 'ai-preview'>('config');
  const [parsedData, setParsedData] = useState<{
    tables: number;
    tableNames: string[];
    collectionJSON: string;
  } | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // AI state
  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiAvailable, setAiAvailable] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysisResult | null>(null);
  const [aiModel, setAiModel] = useState('');
  const [rawDBML, setRawDBML] = useState('');

  // Table selection state
  const [selectedTables, setSelectedTables] = useState<Set<string>>(new Set());
  const [allTableNames, setAllTableNames] = useState<string[]>([]);
  const [tableSearch, setTableSearch] = useState('');

  // Check if AI is available for the current team
  useEffect(() => {
    if (isOpen && currentTeam && currentTeam.name !== 'Personal') {
      getAISettings(currentTeam.id)
        .then((settings) => {
          setAiAvailable(settings.is_enabled && settings.has_api_key);
          setAiEnabled(settings.is_enabled && settings.has_api_key);
          setAiModel(settings.model);
        })
        .catch(() => {
          setAiAvailable(false);
          setAiEnabled(false);
        });
    } else {
      setAiAvailable(false);
      setAiEnabled(false);
    }
  }, [isOpen, currentTeam]);

  const handleFetchAndGenerate = async () => {
    if (!projectId.trim() || !environmentId.trim()) {
      setError('Project ID and Environment ID are required');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const url = `${baseUrl}/v1/chart?project-id=${encodeURIComponent(projectId.trim())}&environment-id=${encodeURIComponent(environmentId.trim())}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { 'authorization': 'API-KEY', 'x-api-key': apiKey } : {}),
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.status !== 'OK' || !data.data?.dbml) {
        throw new Error(data.description || 'Failed to fetch project schema');
      }

      const dbml = data.data.dbml;
      setRawDBML(dbml);
      const schema = parseDBML(dbml);

      if (schema.tables.length === 0) {
        throw new Error('No tables found in the project schema');
      }

      if (aiEnabled && currentTeam) {
        // AI path: analyze with OpenAI
        await handleAIAnalysis(dbml, schema);
      } else {
        // Standard path: generate CRUD for all tables
        const collection = generateUCodeCollection(
          schema,
          projectId.trim(),
          environmentId.trim(),
          apiKey.trim(),
          baseUrl.trim()
        );

        const collectionJSON = JSON.stringify(collection, null, 2);

        setParsedData({
          tables: schema.tables.length,
          tableNames: schema.tables.map(t => t.name),
          collectionJSON,
        });

        setStep('preview');
      }
    } catch (err: any) {
      if (err.name === 'TypeError' && err.message.includes('fetch')) {
        setError('Network error: Unable to reach the server. The request may be blocked by CORS. Try using the direct DBML paste option.');
      } else {
        setError(err.message || 'Failed to fetch project schema');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleAIAnalysis = async (dbml: string, schema: ReturnType<typeof parseDBML>) => {
    if (!currentTeam) return;
    setAiLoading(true);

    try {
      const result: AIAnalyzeResponse = await analyzeDBML(currentTeam.id, {
        dbml,
        project_id: projectId.trim(),
        environment_id: environmentId.trim(),
        base_url: baseUrl.trim(),
        ucode_api_key: apiKey.trim(),
      });

      setAiAnalysis(result.analysis);

      // Initialize table selection: all tables except AI-skipped ones
      const allNames = schema.tables.map(t => t.name);
      setAllTableNames(allNames);
      const skipSet = new Set(result.analysis.skip_tables || []);
      setSelectedTables(new Set(allNames.filter(n => !skipSet.has(n))));
      setTableSearch('');

      setStep('ai-preview');
    } catch (err: any) {
      setError(err.message || 'AI analysis failed. You can try again or disable AI mode.');
    } finally {
      setAiLoading(false);
    }
  };

  const handleImport = () => {
    if (step === 'ai-preview' && aiAnalysis && rawDBML) {
      // Regenerate collection with the user's table selection
      const schema = parseDBML(rawDBML);
      const collection = generateAIUCodeCollection(
        schema,
        aiAnalysis,
        projectId.trim(),
        environmentId.trim(),
        apiKey.trim(),
        baseUrl.trim(),
        selectedTables
      );
      const json = JSON.stringify(collection, null, 2);
      onImport(json);
      handleReset();
    } else if (parsedData) {
      onImport(parsedData.collectionJSON);
      handleReset();
    }
  };

  const handleFallbackToStandard = () => {
    if (!rawDBML) return;
    const schema = parseDBML(rawDBML);
    const collection = generateUCodeCollection(
      schema,
      projectId.trim() || 'unknown-project',
      environmentId.trim() || 'unknown-env',
      apiKey.trim(),
      baseUrl.trim()
    );
    const collectionJSON = JSON.stringify(collection, null, 2);
    setParsedData({
      tables: schema.tables.length,
      tableNames: schema.tables.map(t => t.name),
      collectionJSON,
    });
    setAiAnalysis(null);
    setStep('preview');
  };

  const handleReset = () => {
    setStep('config');
    setParsedData(null);
    setError(null);
    setProjectId('');
    setEnvironmentId('');
    setApiKey('');
    setBaseUrl('https://api.admin.u-code.io');
    setShowAdvanced(false);
    setAiAnalysis(null);
    setRawDBML('');
    setShowPaste(false);
    setPastedDBML('');
    setSelectedTables(new Set());
    setAllTableNames([]);
    setTableSearch('');
    onClose();
  };

  // Paste DBML directly fallback
  const [showPaste, setShowPaste] = useState(false);
  const [pastedDBML, setPastedDBML] = useState('');

  const handlePasteImport = async () => {
    if (!pastedDBML.trim()) {
      setError('Please paste the DBML content');
      return;
    }

    try {
      const schema = parseDBML(pastedDBML);

      if (schema.tables.length === 0) {
        throw new Error('No tables found in the DBML content');
      }

      setRawDBML(pastedDBML);

      if (aiEnabled && currentTeam) {
        setLoading(true);
        await handleAIAnalysis(pastedDBML, schema);
        setLoading(false);
      } else {
        const collection = generateUCodeCollection(
          schema,
          projectId.trim() || 'unknown-project',
          environmentId.trim() || 'unknown-env',
          apiKey.trim(),
          baseUrl.trim()
        );

        const collectionJSON = JSON.stringify(collection, null, 2);

        setParsedData({
          tables: schema.tables.length,
          tableNames: schema.tables.map(t => t.name),
          collectionJSON,
        });

        setStep('preview');
        setShowPaste(false);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to parse DBML');
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const isAIProcessing = loading || aiLoading;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 backdrop-blur-sm">
      <div className="bg-card shadow-2xl w-full h-full md:h-auto md:rounded-xl md:max-w-2xl md:mx-4 md:max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className={`px-6 py-4 border-b border-border flex items-center justify-between ${
          aiEnabled
            ? 'bg-primary/10'
            : 'bg-primary/5'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
              aiEnabled ? 'bg-primary' : 'bg-primary'
            }`}>
              {aiEnabled ? (
                <svg className="w-5 h-5 text-primary-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              ) : (
                <svg className="w-5 h-5 text-primary-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                </svg>
              )}
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                Import from UCode {aiEnabled && <span className="text-primary text-sm ml-1">AI</span>}
              </h2>
              <p className="text-sm text-muted-foreground">
                {step === 'config' ? 'Enter your project details' :
                 step === 'ai-preview' ? `AI organized ${aiAnalysis?.table_count_essential || 0} essential tables` :
                 `${parsedData?.tables} tables found`}
              </p>
            </div>
          </div>
          <button
            onClick={handleReset}
            className="p-2 rounded-lg hover:bg-accent text-muted-foreground"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* AI Loading Overlay */}
          {aiLoading && (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <div className="relative">
                <div className="w-16 h-16 rounded-full border-4 border-primary/20 animate-spin border-t-primary" />
                <svg className="absolute inset-0 m-auto w-6 h-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <div className="text-center">
                <p className="text-lg font-medium text-foreground">AI is analyzing your schema...</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Grouping tables, identifying auth flows, filtering out noise
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  Using {aiModel || 'GPT-4o Mini'} • This may take 10-30 seconds
                </p>
              </div>
            </div>
          )}

          {step === 'config' && !showPaste && !aiLoading && (
            <div className="space-y-4">
              {/* AI Toggle */}
              {aiAvailable && (
                <div className="flex items-center justify-between p-3 bg-gradient-to-r primary/10 border border-primary/20 rounded-lg">
                  <div className="flex items-center gap-2">
                    <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                    <div>
                      <span className="text-sm font-medium text-muted-foreground">AI Smart Import</span>
                      <p className="text-xs text-muted-foreground">Groups tables, identifies auth flows, skips noise</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setAiEnabled(!aiEnabled)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      aiEnabled ? 'bg-primary' : 'bg-muted'
                    }`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-background transition-transform ${
                      aiEnabled ? 'translate-x-6' : 'translate-x-1'
                    }`} />
                  </button>
                </div>
              )}

              {/* Project ID */}
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1.5">
                  Project ID <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  placeholder="e.g. 3323bfe2-b147-41fd-9d24-ca7c929d6abd"
                  className="w-full px-3 py-2.5 border border-border rounded-lg bg-card text-foreground text-sm focus:ring-2 focus:ring-ring focus:border-transparent outline-none font-mono"
                />
              </div>

              {/* Environment ID */}
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1.5">
                  Environment ID <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  value={environmentId}
                  onChange={(e) => setEnvironmentId(e.target.value)}
                  placeholder="e.g. fdb116b5-2833-49c8-adfd-0a8616d6c586"
                  className="w-full px-3 py-2.5 border border-border rounded-lg bg-card text-foreground text-sm focus:ring-2 focus:ring-ring focus:border-transparent outline-none font-mono"
                />
              </div>

              {/* Advanced Settings Toggle */}
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
              >
                <svg
                  className={`w-4 h-4 transition-transform ${showAdvanced ? 'rotate-90' : ''}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                Advanced Settings
              </button>

              {showAdvanced && (
                <div className="space-y-4 pl-4 border-l-2 border-primary/20">
                  {/* API Key */}
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">
                      API Key
                    </label>
                    <input
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="Your UCode API key (for generated requests)"
                      className="w-full px-3 py-2.5 border border-border rounded-lg bg-card text-foreground text-sm focus:ring-2 focus:ring-ring focus:border-transparent outline-none font-mono"
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      If provided, the API key will be embedded in generated requests
                    </p>
                  </div>

                  {/* Base URL */}
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">
                      Base URL
                    </label>
                    <input
                      type="text"
                      value={baseUrl}
                      onChange={(e) => setBaseUrl(e.target.value)}
                      placeholder="https://api.admin.u-code.io"
                      className="w-full px-3 py-2.5 border border-border rounded-lg bg-card text-foreground text-sm focus:ring-2 focus:ring-ring focus:border-transparent outline-none font-mono"
                    />
                  </div>
                </div>
              )}

              {/* Divider with "or" */}
              <div className="flex items-center gap-3 pt-2">
                <div className="flex-1 border-t border-border" />
                <span className="text-xs text-muted-foreground">or</span>
                <div className="flex-1 border-t border-border" />
              </div>

              {/* Paste DBML option */}
              <button
                type="button"
                onClick={() => setShowPaste(true)}
                className="w-full px-4 py-3 border-2 border-dashed border-border rounded-lg text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Paste DBML directly
              </button>
            </div>
          )}

          {step === 'config' && showPaste && !aiLoading && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="block text-sm font-medium text-muted-foreground">
                  Paste DBML Content
                </label>
                <button
                  onClick={() => setShowPaste(false)}
                  className="text-sm text-primary hover:text-primary/80"
                >
                  ← Back to URL fetch
                </button>
              </div>
              <textarea
                value={pastedDBML}
                onChange={(e) => setPastedDBML(e.target.value)}
                placeholder={`Table users {\n  guid VARCHAR\n  name VARCHAR\n  email VARCHAR\n}\n\nTable orders {\n  guid VARCHAR\n  users_id UUID\n  total FLOAT\n}`}
                rows={12}
                className="w-full px-3 py-2.5 border border-border rounded-lg bg-card text-foreground text-sm focus:ring-2 focus:ring-ring focus:border-transparent outline-none font-mono resize-none"
              />
              {aiEnabled && (
                <div className="text-xs text-primary flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                  AI mode enabled — DBML will be analyzed by AI after parsing
                </div>
              )}
              <button
                onClick={handlePasteImport}
                disabled={isAIProcessing}
                className={`w-full py-2.5 text-primary-foreground rounded-lg font-medium text-sm ${
                  isAIProcessing ? 'bg-muted text-muted-foreground cursor-not-allowed' :
                  aiEnabled ? 'bg-primary hover:bg-primary/90' :
                  'bg-primary hover:bg-primary/90'
                }`}
              >
                {isAIProcessing ? 'Processing...' : aiEnabled ? 'Parse & Analyze with AI' : 'Parse DBML'}
              </button>
            </div>
          )}

          {step === 'preview' && parsedData && (
            <div className="space-y-4">
              {/* Stats */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-primary/10 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-primary">{parsedData.tables}</div>
                  <div className="text-xs text-primary/70">Tables</div>
                </div>
                <div className="bg-accent rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-foreground">{parsedData.tables * 9}</div>
                  <div className="text-xs text-foreground/70">CRUD Requests</div>
                </div>
                <div className="bg-primary/5 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-primary">{parsedData.tables * 9 + 7}</div>
                  <div className="text-xs text-primary/70">Total Requests</div>
                </div>
              </div>

              {/* Description */}
              <div className="bg-background rounded-lg p-4">
                <h4 className="text-sm font-medium text-muted-foreground mb-2">Generated for each table:</h4>
                <div className="grid grid-cols-3 gap-1.5 text-xs">
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block w-11 text-center py-0.5 rounded text-primary-foreground bg-primary font-bold">GET</span>
                    List records
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block w-11 text-center py-0.5 rounded text-primary-foreground bg-primary font-bold">GET</span>
                    With relations
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block w-11 text-center py-0.5 rounded text-primary-foreground bg-primary font-bold">GET</span>
                    Single by ID
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block w-11 text-center py-0.5 rounded text-primary-foreground bg-primary font-bold">POST</span>
                    Create
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block w-11 text-center py-0.5 rounded text-primary-foreground bg-primary font-bold">PUT</span>
                    Update
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block w-11 text-center py-0.5 rounded text-primary-foreground bg-primary font-bold">PATCH</span>
                    Update multi
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block w-11 text-center py-0.5 rounded text-destructive-foreground bg-destructive font-bold">DEL</span>
                    Delete single
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block w-11 text-center py-0.5 rounded text-destructive-foreground bg-destructive font-bold">DEL</span>
                    Delete multi
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block w-11 text-center py-0.5 rounded text-primary-foreground bg-primary font-bold">POST</span>
                    Aggregate
                  </span>
                </div>
              </div>

              {/* Table list */}
              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-2">Tables ({parsedData.tables}):</h4>
                <div className="max-h-48 overflow-y-auto border border-border rounded-lg">
                  {parsedData.tableNames.map((name, i) => (
                    <div
                      key={name}
                      className={`px-3 py-1.5 text-sm font-mono text-muted-foreground ${
                        i % 2 === 0 ? 'bg-background' : ''
                      }`}
                    >
                      <span className="text-muted-foreground mr-2 text-xs">{i + 1}.</span>
                      {name}
                    </div>
                  ))}
                </div>
              </div>

              {/* Auth + Files note */}
              <div className="bg-accent border border-border rounded-lg p-3 text-sm text-accent-foreground">
                <strong>Also includes:</strong> Authentication (Register, Login, Login with Options, Send OTP, Reset Password) and Files (Upload, Delete) folders.
              </div>
            </div>
          )}

          {/* AI Preview */}
          {step === 'ai-preview' && aiAnalysis && (
            <div className="space-y-4">
              {/* AI Summary */}
              <div className="bg-gradient-to-r primary/10 rounded-lg p-4 border border-primary/20">
                <div className="flex items-center gap-2 mb-2">
                  <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                  <h4 className="text-sm font-semibold text-primary">AI Analysis Complete</h4>
                </div>
                <p className="text-sm text-muted-foreground">{aiAnalysis.project_summary}</p>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-4 gap-2">
                <div className="bg-primary/10 rounded-lg p-3 text-center">
                  <div className="text-xl font-bold text-primary">{aiAnalysis.table_count_total}</div>
                  <div className="text-xs text-primary/70">Total Tables</div>
                </div>
                <div className="bg-primary/10 rounded-lg p-3 text-center">
                  <div className="text-xl font-bold text-primary">{aiAnalysis.table_count_essential}</div>
                  <div className="text-xs text-primary/70">Essential</div>
                </div>
                <div className="bg-background rounded-lg p-3 text-center">
                  <div className="text-xl font-bold text-muted-foreground">{aiAnalysis.table_count_skipped}</div>
                  <div className="text-xs text-muted-foreground">Skipped</div>
                </div>
                <div className="bg-accent rounded-lg p-3 text-center">
                  <div className="text-xl font-bold text-foreground">{aiAnalysis.domains.length}</div>
                  <div className="text-xs text-foreground/70">Domains</div>
                </div>
              </div>

              {/* Auth Tables */}
              {aiAnalysis.auth_tables.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                    <span className="text-base">🔐</span> Auth Tables ({aiAnalysis.auth_tables.length})
                  </h4>
                  <div className="space-y-2">
                    {aiAnalysis.auth_tables.map((auth) => (
                      <div key={auth.table_name} className="bg-muted border border-border rounded-lg p-3">
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-sm text-foreground">{auth.table_name}</span>
                          <span className="text-xs bg-muted text-foreground px-2 py-0.5 rounded-full">{auth.auth_type}</span>
                        </div>
                        <div className="mt-1.5 text-xs text-muted-foreground">
                          Login fields: {auth.login_fields.join(', ')} {auth.has_roles && '• Has roles'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Domains */}
              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-2">Domains</h4>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {aiAnalysis.domains.map((domain) => (
                    <details key={domain.name} className="border border-border rounded-lg">
                      <summary className="px-3 py-2 cursor-pointer hover:bg-accent flex items-center gap-2 text-sm">
                        <span>{domain.icon}</span>
                        <span className="font-medium text-muted-foreground">{domain.name}</span>
                        <span className="text-xs text-muted-foreground">
                          ({domain.tables.length} tables)
                        </span>
                        <span className="text-xs text-muted-foreground ml-auto">{domain.description}</span>
                      </summary>
                      <div className="border-t border-border">
                        {domain.tables.map((t) => (
                          <div key={t.name} className="px-4 py-1.5 text-xs font-mono text-muted-foreground flex items-center gap-2">
                            {t.essential ? (
                              <span className="text-primary" title="Essential">⭐</span>
                            ) : (
                              <span className="text-muted-foreground" title="Non-essential">○</span>
                            )}
                            {t.name}
                            <span className="text-muted-foreground font-sans ml-auto">{t.purpose}</span>
                          </div>
                        ))}
                      </div>
                    </details>
                  ))}
                </div>
              </div>

              {/* Skipped Tables */}
              {aiAnalysis.skip_tables.length > 0 && (
                <details className="border border-border rounded-lg">
                  <summary className="px-3 py-2 cursor-pointer hover:bg-accent text-sm text-muted-foreground">
                    Skipped tables ({aiAnalysis.skip_tables.length}) — click to expand
                  </summary>
                  <div className="border-t border-border px-3 py-2">
                    <div className="flex flex-wrap gap-1.5">
                      {aiAnalysis.skip_tables.map((name) => (
                        <span key={name} className="text-xs px-2 py-0.5 bg-muted text-muted-foreground rounded font-mono">
                          {name}
                        </span>
                      ))}
                    </div>
                  </div>
                </details>
              )}

              {/* Customize Tables Selection */}
              {allTableNames.length > 0 && (
                <div className="border border-border rounded-lg overflow-hidden">
                  <div className="bg-accent px-3 py-2.5">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-sm font-medium text-accent-foreground flex items-center gap-1.5">
                        <span className="text-base">☑️</span> Customize Tables ({selectedTables.size}/{allTableNames.length})
                      </h4>
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => setSelectedTables(new Set(allTableNames))}
                          className="text-xs px-2 py-0.5 rounded bg-muted text-accent-foreground hover:bg-accent"
                        >
                          Select All
                        </button>
                        <button
                          onClick={() => setSelectedTables(new Set())}
                          className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground hover:bg-accent"
                        >
                          Deselect All
                        </button>
                      </div>
                    </div>
                    {/* Search */}
                    <div className="relative">
                      <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                      <input
                        type="text"
                        placeholder="Search tables..."
                        value={tableSearch}
                        onChange={(e) => setTableSearch(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 text-xs rounded border border-border bg-card text-muted-foreground placeholder-muted-foreground focus:ring-1 focus:ring-ring focus:border-primary outline-none"
                      />
                    </div>
                  </div>
                  <div className="max-h-56 overflow-y-auto">
                    {(() => {
                      const authNames = new Set((aiAnalysis.auth_tables || []).map(a => a.table_name));
                      const skipNames = new Set(aiAnalysis.skip_tables || []);
                      const essentialNames = new Set<string>();
                      for (const d of aiAnalysis.domains) {
                        for (const t of d.tables) {
                          if (t.essential) essentialNames.add(t.name);
                        }
                      }
                      const query = tableSearch.toLowerCase();
                      const filtered = allTableNames.filter(n => n.toLowerCase().includes(query));
                      if (filtered.length === 0) {
                        return (
                          <div className="px-3 py-4 text-xs text-muted-foreground text-center">
                            No tables match "{tableSearch}"
                          </div>
                        );
                      }
                      return filtered.map((name, i) => {
                        const isAuth = authNames.has(name);
                        const isSkip = skipNames.has(name);
                        const isEssential = essentialNames.has(name);
                        const isChecked = selectedTables.has(name);
                        return (
                          <label
                            key={name}
                            className={`flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer hover:bg-accent ${
                              i % 2 === 0 ? 'bg-card' : 'bg-background'
                            } ${!isChecked ? 'opacity-60' : ''}`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {
                                setSelectedTables(prev => {
                                  const next = new Set(prev);
                                  if (next.has(name)) next.delete(name);
                                  else next.add(name);
                                  return next;
                                });
                              }}
                              className="rounded border-border text-primary focus:ring-ring h-3.5 w-3.5"
                            />
                            <span className="font-mono text-muted-foreground flex-1 truncate">{name}</span>
                            <span className="flex gap-1 shrink-0">
                              {isAuth && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">auth</span>
                              )}
                              {isEssential && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">essential</span>
                              )}
                              {isSkip && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">skipped</span>
                              )}
                            </span>
                          </label>
                        );
                      });
                    })()}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Error */}
          {error && !aiLoading && (
            <div className="mt-4 p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-lg text-sm">
              {error}
              {aiEnabled && (
                <button
                  onClick={() => { setAiEnabled(false); setError(null); }}
                  className="block mt-2 text-xs text-destructive hover:text-destructive/80 underline"
                >
                  Disable AI and try standard import
                </button>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex items-center justify-between">
          {(step === 'preview' || step === 'ai-preview') && (
            <button
              onClick={() => { setStep('config'); setParsedData(null); setAiAnalysis(null); }}
              className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
            >
              ← Back
            </button>
          )}
          <div className="flex-1" />
          <div className="flex gap-3">
            <button
              onClick={handleReset}
              className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground border border-border rounded-lg"
            >
              Cancel
            </button>
            {step === 'config' && !showPaste && !aiLoading && (
              <button
                onClick={handleFetchAndGenerate}
                disabled={loading || !projectId.trim() || !environmentId.trim()}
                className={`px-6 py-2 rounded-lg font-medium text-sm text-primary-foreground flex items-center gap-2 ${
                  loading || !projectId.trim() || !environmentId.trim()
                    ? 'bg-muted text-muted-foreground cursor-not-allowed'
                    : aiEnabled
                      ? 'bg-primary hover:bg-primary/90'
                      : 'bg-primary hover:bg-primary/90'
                }`}
              >
                {loading ? (
                  <>
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Fetching...
                  </>
                ) : (
                  <>
                    {aiEnabled ? (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                    )}
                    {aiEnabled ? 'Fetch & AI Analyze' : 'Fetch & Generate'}
                  </>
                )}
              </button>
            )}
            {step === 'ai-preview' && (
              <>
                <button
                  onClick={handleFallbackToStandard}
                  className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground border border-border rounded-lg"
                >
                  Import All (no AI)
                </button>
                <button
                  onClick={handleImport}
                  disabled={selectedTables.size === 0}
                  className={`px-6 py-2 rounded-lg font-medium text-sm text-primary-foreground flex items-center gap-2 ${
                    selectedTables.size === 0
                      ? 'bg-muted text-muted-foreground cursor-not-allowed'
                      : 'bg-primary hover:bg-primary/90'
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Import AI Collection ({selectedTables.size} tables)
                </button>
              </>
            )}
            {step === 'preview' && (
              <button
                onClick={handleImport}
                className="px-6 py-2 rounded-lg font-medium text-sm text-primary-foreground bg-primary hover:bg-primary/90 flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Import Collection
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
