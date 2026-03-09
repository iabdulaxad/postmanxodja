import { useState } from 'react';
import { importCollection, createCollection } from '../services/api';
import { useTeam } from '../contexts/TeamContext';
import InputModal from './InputModal';

interface Props {
  onImportSuccess: () => void;
  onUCodeImport?: () => void;
}

export default function CollectionImporter({ onImportSuccess, onUCodeImport }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const { currentTeam } = useTeam();

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentTeam) return;

    setLoading(true);
    setError(null);

    try {
      const text = await file.text();
      await importCollection(currentTeam.id, text);
      onImportSuccess();
      e.target.value = '';
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to import collection');
    } finally {
      setLoading(false);
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
        <div className="flex gap-2">
          <button
            onClick={() => setShowCreateModal(true)}
            disabled={loading}
            className={`
              flex-1 px-3 py-2 rounded-lg shadow-sm font-medium text-sm
               flex items-center justify-center gap-1
              ${loading
                ? 'bg-gray-400 text-white cursor-not-allowed'
                : 'bg-primary hover:bg-primary/90 text-primary-foreground'
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
              flex-1 px-3 py-2 rounded-lg shadow-sm font-medium text-sm
               flex items-center justify-center gap-1 cursor-pointer
              ${loading
                ? 'bg-gray-400 text-white cursor-not-allowed'
                : 'bg-accent hover:bg-accent/80 text-foreground border border-border'
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
                flex-1 px-3 py-2 rounded-lg shadow-sm font-medium text-sm
                flex items-center justify-center gap-1
                ${loading
                  ? 'bg-gray-400 text-white cursor-not-allowed'
                  : 'bg-purple-500 hover:bg-purple-600 text-white'
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
          <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 rounded-lg text-sm">
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
    </>
  );
}
