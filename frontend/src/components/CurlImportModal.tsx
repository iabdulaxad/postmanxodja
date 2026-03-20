import { useState } from 'react';
import { parseCurl } from '../utils/curlParser';

interface CurlImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (data: { method: string; url: string; headers: Record<string, string>; body: string }) => void;
}

export default function CurlImportModal({ isOpen, onClose, onImport }: CurlImportModalProps) {
  const [curlCommand, setCurlCommand] = useState('');
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleImport = () => {
    try {
      setError('');
      const trimmed = curlCommand.trim();

      if (!trimmed) {
        setError('Please paste a cURL command');
        return;
      }

      if (!trimmed.toLowerCase().startsWith('curl')) {
        setError('Invalid cURL command. Must start with "curl"');
        return;
      }

      const parsed = parseCurl(trimmed);

      if (!parsed.url) {
        setError('Could not extract URL from cURL command');
        return;
      }

      onImport(parsed);
      setCurlCommand('');
      onClose();
    } catch (err) {
      setError('Failed to parse cURL command. Please check the format.');
      console.error('cURL parse error:', err);
    }
  };

  const handleClose = () => {
    setCurlCommand('');
    setError('');
    onClose();
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50">
      <div className="fixed inset-0 bg-slate-900/30" onClick={handleClose} />
      <div className="relative bg-card shadow-xl w-full h-full md:h-auto md:rounded-lg md:max-w-2xl md:mx-4">
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-foreground">Import from cURL</h2>
            <button
              onClick={handleClose}
              className="text-muted-foreground hover:text-foreground"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-2">
                Paste your cURL command
              </label>
              <textarea
                value={curlCommand}
                onChange={(e) => setCurlCommand(e.target.value)}
                placeholder="curl 'https://api.example.com/users' -H 'Authorization: Bearer token'"
                className="w-full h-48 px-3 py-2 border border-border rounded-md bg-card text-foreground font-mono text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                autoFocus
              />
              {error && (
                <p className="mt-2 text-sm text-destructive">{error}</p>
              )}
            </div>

            <div className="bg-accent border border-border rounded-md p-3">
              <p className="text-sm text-accent-foreground">
                <strong>Tip:</strong> Right-click on a network request in browser DevTools →
                Copy → Copy as cURL, then paste it here!
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-6">
            <button
              onClick={handleClose}
              className="px-4 py-2 text-sm font-medium text-muted-foreground bg-card border border-border rounded-md hover:bg-accent"
            >
              Cancel
            </button>
            <button
              onClick={handleImport}
              className="px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90"
            >
              Import
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
