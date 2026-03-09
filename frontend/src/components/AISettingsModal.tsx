import { useState, useEffect } from 'react';
import { useTeam } from '../contexts/TeamContext';
import {
  getAISettings,
  updateAISettings,
  deleteAISettings,
  AI_MODELS,
  type AISettingsResponse,
} from '../services/ai';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function AISettingsModal({ isOpen, onClose }: Props) {
  const { currentTeam } = useTeam();
  const [settings, setSettings] = useState<AISettingsResponse | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('gpt-4o-mini');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && currentTeam) {
      loadSettings();
    }
  }, [isOpen, currentTeam?.id]);

  const loadSettings = async () => {
    if (!currentTeam) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getAISettings(currentTeam.id);
      setSettings(data);
      setModel(data.model || 'gpt-4o-mini');
      setApiKey(''); // Never pre-fill the key
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!currentTeam) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const data = await updateAISettings(currentTeam.id, {
        ...(apiKey ? { api_key: apiKey } : {}),
        model,
        provider: 'openai',
      });
      setSettings(data);
      setApiKey('');
      setSuccess('AI settings saved successfully!');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!currentTeam) return;
    setSaving(true);
    setError(null);
    try {
      await deleteAISettings(currentTeam.id);
      setSettings(null);
      setApiKey('');
      setModel('gpt-4o-mini');
      setSuccess('AI settings removed');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50">
      <div className="fixed inset-0 bg-slate-900/30" onClick={onClose} />
      <div className="relative bg-card w-full h-full md:h-auto md:rounded-xl md:max-w-lg md:mx-4 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-primary/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
              <svg className="w-5 h-5 text-primary-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714a2.25 2.25 0 00.659 1.591L19 14.5M14.25 3.104c.251.023.501.05.75.082M19 14.5l-2.47 2.47a2.25 2.25 0 01-1.59.659H9.06a2.25 2.25 0 01-1.591-.659L5 14.5m14 0V17a2 2 0 01-2 2H7a2 2 0 01-2-2v-2.5" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">AI Settings</h2>
              <p className="text-sm text-muted-foreground">
                {currentTeam?.name} - OpenAI Integration
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-accent text-muted-foreground"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : (
            <>
              {/* Status indicator */}
              {settings?.has_api_key && (
                <div className="flex items-center gap-2 p-3 bg-primary/10 border border-primary/20 rounded-lg">
                  <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                  <span className="text-sm text-primary">
                    AI enabled &middot; Key: <code className="text-xs bg-primary/10 px-1 rounded">{settings.key_preview}</code>
                  </span>
                </div>
              )}

              {/* API Key */}
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1.5">
                  OpenAI API Key {!settings?.has_api_key && <span className="text-destructive">*</span>}
                </label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={settings?.has_api_key ? 'Enter new key to update (leave empty to keep current)' : 'sk-...'}
                  className="w-full px-3 py-2.5 border border-border rounded-lg bg-card text-foreground text-sm focus:ring-2 focus:ring-ring focus:border-transparent outline-none font-mono"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Your key is stored encrypted and never shared. Get one at{' '}
                  <a
                    href="https://platform.openai.com/api-keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:text-primary/80 underline"
                  >
                    platform.openai.com
                  </a>
                </p>
              </div>

              {/* Model Selection */}
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1.5">
                  Model
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {AI_MODELS.map((m) => (
                    <button
                      key={m.value}
                      onClick={() => setModel(m.value)}
                      className={`p-2.5 rounded-lg border text-left transition-all ${
                        model === m.value
                          ? 'border-primary bg-primary/10 ring-2 ring-primary/20'
                          : 'border-border hover:border-muted-foreground'
                      }`}
                    >
                      <div className={`text-sm font-medium ${
                        model === m.value ? 'text-primary' : 'text-muted-foreground'
                      }`}>
                        {m.label}
                      </div>
                      <div className="text-xs text-muted-foreground">{m.description}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Info */}
              <div className="bg-accent border border-border rounded-lg p-3 text-sm text-accent-foreground">
                <strong>How it works:</strong> When importing UCode tables with AI enabled, the model analyzes your database schema to intelligently group tables, identify auth flows, skip unnecessary tables, and generate meaningful request bodies.
              </div>
            </>
          )}

          {/* Messages */}
          {error && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-lg text-sm">
              {error}
            </div>
          )}
          {success && (
            <div className="p-3 bg-primary/10 border border-primary/20 text-primary rounded-lg text-sm">
              {success}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex items-center justify-between">
          <div>
            {settings?.has_api_key && (
              <button
                onClick={handleDelete}
                disabled={saving}
                className="px-3 py-2 text-sm text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
              >
                Remove AI
              </button>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground border border-border rounded-lg"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || (!apiKey && !settings?.has_api_key)}
              className={`px-6 py-2 rounded-lg font-medium text-sm text-primary-foreground flex items-center gap-2 ${
                saving || (!apiKey && !settings?.has_api_key)
                  ? 'bg-muted text-muted-foreground cursor-not-allowed'
                  : 'bg-primary hover:bg-primary/90'
              }`}
            >
              {saving ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Saving...
                </>
              ) : (
                'Save Settings'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
