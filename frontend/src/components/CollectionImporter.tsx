import { useState } from 'react';
import { importCollection, createCollection } from '../services/api';
import { useTeam } from '../contexts/TeamContext';
import InputModal from './InputModal';

interface Props {
  onImportSuccess: () => void;
  onUCodeImport?: () => void;
}

interface DuplicateInfo {
  name: string;
  collectionJSON: string;
}

export default function CollectionImporter({ onImportSuccess, onUCodeImport }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [duplicateInfo, setDuplicateInfo] = useState<DuplicateInfo | null>(null);
  const { currentTeam } = useTeam();

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentTeam) return;

    setLoading(true);
    setError(null);

    const text = await file.text();
    e.target.value = '';

    try {
      await importCollection(currentTeam.id, text);
      onImportSuccess();
    } catch (err: any) {
      if (err.response?.status === 409) {
        setDuplicateInfo({
          name: err.response.data.name,
          collectionJSON: text,
        });
      } else {
        setError(err.response?.data?.error || 'Failed to import collection');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDuplicateChoice = async (mode: 'replace' | 'duplicate') => {
    if (!duplicateInfo || !currentTeam) return;

    setLoading(true);
    setError(null);

    try {
      await importCollection(currentTeam.id, duplicateInfo.collectionJSON, mode);
      onImportSuccess();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to import collection');
    } finally {
      setLoading(false);
      setDuplicateInfo(null);
    }
  };

  const handleCreateCollection = async (name: string) => {
    if (!currentTeam) return;

    setLoading(true);
    setError(null);

    try {
      await createCollection(currentTeam.id, name);
      onImportSuccess();
      setShowCreateModal(false);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create collection');
    } finally {
      setLoading(false);
    }
  };

  if (!currentTeam) {
    return (
      <div className="p-4 border-b border-border bg-card">
        <p className="text-sm text-muted-foreground">Select a team to manage collections</p>
      </div>
    );
  }

  return (
    <>
      <div className="p-4 border-b border-border bg-card">
        <div className="flex gap-1.5">
          <button
            onClick={() => setShowCreateModal(true)}
            disabled={loading}
            className={`
              flex-1 px-3 py-2 rounded-lg font-medium text-sm
              flex items-center justify-center gap-1.5 transition-colors
              ${loading
                ? 'bg-muted text-muted-foreground cursor-not-allowed'
                : 'bg-primary/10 hover:bg-primary/20 text-primary dark:bg-primary/15 dark:hover:bg-primary/25'
              }
            `}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New
          </button>
          <label
            htmlFor="file-upload"
            className={`
              flex-1 px-3 py-2 rounded-lg font-medium text-sm
              flex items-center justify-center gap-1.5 cursor-pointer transition-colors
              ${loading
                ? 'bg-muted text-muted-foreground cursor-not-allowed'
                : 'bg-accent hover:bg-accent/70 text-accent-foreground dark:hover:bg-accent/80'
              }
            `}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Import
          </label>
          {onUCodeImport && (
            <button
              onClick={onUCodeImport}
              disabled={loading}
              className={`
                flex-1 px-3 py-2 rounded-lg font-medium text-sm
                flex items-center justify-center gap-1.5 transition-colors
                ${loading
                  ? 'bg-muted text-muted-foreground cursor-not-allowed'
                  : 'bg-primary/10 hover:bg-primary/20 text-primary dark:bg-primary/15 dark:hover:bg-primary/25'
                }
              `}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
              </svg>
              UCode
            </button>
          )}
          <input
            id="file-upload"
            type="file"
            accept=".json"
            onChange={handleFileUpload}
            disabled={loading}
            className="hidden"
          />
        </div>
        {error && (
          <div className="mt-3 p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-lg text-sm">
            {error}
          </div>
        )}
      </div>

      <InputModal
        isOpen={showCreateModal}
        onCancel={() => setShowCreateModal(false)}
        onConfirm={handleCreateCollection}
        title="Create Collection"
        placeholder="My Collection"
        confirmText="Create"
      />

      {/* Duplicate Collection Dialog */}
      {duplicateInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-card border border-border rounded-xl shadow-lg p-6 max-w-sm w-full mx-4">
            <h3 className="text-lg font-semibold text-foreground mb-2">Collection Already Exists</h3>
            <p className="text-sm text-muted-foreground mb-5">
              A collection named <span className="font-medium text-foreground">"{duplicateInfo.name}"</span> already exists. What would you like to do?
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => handleDuplicateChoice('replace')}
                disabled={loading}
                className="w-full px-4 py-2.5 rounded-lg font-medium text-sm bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                Replace Existing
              </button>
              <button
                onClick={() => handleDuplicateChoice('duplicate')}
                disabled={loading}
                className="w-full px-4 py-2.5 rounded-lg font-medium text-sm bg-accent text-accent-foreground hover:bg-accent/70 transition-colors disabled:opacity-50"
              >
                Keep Both
              </button>
              <button
                onClick={() => setDuplicateInfo(null)}
                disabled={loading}
                className="w-full px-4 py-2.5 rounded-lg font-medium text-sm text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
