import { useState } from 'react';
import AuthorizationPanel from './AuthorizationPanel';
import type { Authorization, Environment } from '../types';

interface Props {
  isOpen: boolean;
  collectionName: string;
  initialAuth?: Authorization;
  environments: Environment[];
  onSave: (auth: Authorization | undefined) => void;
  onClose: () => void;
}

export default function CollectionSettingsModal({
  isOpen,
  collectionName,
  initialAuth,
  environments,
  onSave,
  onClose,
}: Props) {
  const [auth, setAuth] = useState<Authorization | undefined>(initialAuth);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-xl shadow-2xl w-full max-w-lg mx-4 flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Collection Settings</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{collectionName}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-muted-foreground hover:bg-accent rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <p className="text-xs text-muted-foreground mb-3">
            Auth set here is applied as a header to all requests in this collection that use <strong>Inherit auth from parent</strong>.
          </p>
          <AuthorizationPanel
            auth={auth}
            onAuthChange={setAuth}
            environments={environments}
            hideInherit
          />
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-border shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground border border-border rounded-lg hover:bg-muted/50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => { onSave(auth); onClose(); }}
            className="px-4 py-2 text-sm font-medium bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
