import { useState, useEffect, useCallback, useRef } from 'react';
import { getEnvironments, createEnvironment, updateEnvironment, deleteEnvironment } from '../services/api';
import { useTeam } from '../contexts/TeamContext';
import ConfirmModal from './ConfirmModal';
import type { Environment } from '../types';

interface Props {
  onUpdate: () => void;
}

interface EnvModalProps {
  isOpen: boolean;
  editingEnv: Environment | null;
  onClose: () => void;
  onSave: (name: string, variables: Record<string, string>) => Promise<void>;
}

function EnvironmentModal({ isOpen, editingEnv, onClose, onSave }: EnvModalProps) {
  const [formName, setFormName] = useState('');
  const [formVariables, setFormVariables] = useState<Array<{ key: string; value: string }>>([]);
  const [saving, setSaving] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setFormName(editingEnv?.name ?? '');
      setFormVariables(
        editingEnv ? Object.entries(editingEnv.variables).map(([key, value]) => ({ key, value })) : []
      );
      setTimeout(() => modalRef.current?.focus(), 10);
    }
  }, [isOpen, editingEnv]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!isOpen) return;
    if (e.key === 'Escape') { onClose(); return; }
    if (e.key === 'Tab' && modalRef.current) {
      const focusable = modalRef.current.querySelectorAll<HTMLElement>(
        'button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }, [isOpen, onClose]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const addVariable = () => setFormVariables(v => [...v, { key: '', value: '' }]);
  const updateVariable = (index: number, field: 'key' | 'value', value: string) => {
    setFormVariables(v => v.map((item, i) => i === index ? { ...item, [field]: value } : item));
  };
  const removeVariable = (index: number) => setFormVariables(v => v.filter((_, i) => i !== index));

  const handleSubmit = async () => {
    if (!formName.trim()) return;
    setSaving(true);
    try {
      const variables = Object.fromEntries(formVariables.filter(v => v.key).map(v => [v.key, v.value]));
      await onSave(formName.trim(), variables);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true">
      <div className="fixed inset-0 bg-slate-900/30" onClick={onClose} />
      <div
        ref={modalRef}
        tabIndex={-1}
        className="relative bg-card shadow-xl rounded-lg w-[calc(100%-2rem)] max-w-lg mx-4 outline-none flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <h2 className="text-base font-semibold text-foreground">
            {editingEnv ? 'Edit Environment' : 'New Environment'}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label="Close"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 overflow-y-auto flex-1">
          <div className="mb-4 p-3 bg-primary/10 border-l-4 border-primary rounded-r-lg">
            <p className="text-xs text-primary">
              Use variables in requests with{' '}
              <code className="bg-card px-1.5 py-0.5 rounded font-mono">{'{{variableName}}'}</code>
            </p>
          </div>

          <label className="block text-xs font-medium text-foreground mb-1">Environment Name</label>
          <input
            type="text"
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            placeholder="e.g. Production"
            className="w-full border border-border rounded-md px-3 py-2 mb-4 text-sm focus:ring-2 focus:ring-ring focus:border-primary outline-none bg-card text-foreground"
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          />

          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-medium text-foreground">Variables</h4>
            <button
              onClick={addVariable}
              className="text-xs text-primary hover:text-primary/80 transition-colors"
            >
              + Add Variable
            </button>
          </div>

          {formVariables.length > 0 ? (
            <div className="border border-border rounded-md overflow-hidden divide-y divide-border">
              {/* Column headers */}
              <div className="flex text-[10px] font-semibold uppercase tracking-wide text-muted-foreground bg-muted/50">
                <span className="w-2/5 px-3 py-1.5 border-r border-border">Key</span>
                <span className="flex-1 px-3 py-1.5">Value</span>
                <span className="w-7" />
              </div>
              {formVariables.map((variable, index) => (
                <div key={index} className="flex items-stretch group hover:bg-muted/30 transition-colors">
                  <input
                    type="text"
                    value={variable.key}
                    onChange={(e) => updateVariable(index, 'key', e.target.value)}
                    placeholder="KEY"
                    className="w-2/5 px-3 py-2 text-sm bg-transparent text-foreground outline-none border-r border-border placeholder:text-muted-foreground/50 font-mono"
                  />
                  <input
                    type="text"
                    value={variable.value}
                    onChange={(e) => updateVariable(index, 'value', e.target.value)}
                    placeholder="value"
                    title={variable.value}
                    className="flex-1 min-w-0 px-3 py-2 text-sm bg-transparent text-foreground outline-none placeholder:text-muted-foreground/50"
                  />
                  <button
                    onClick={() => removeVariable(index)}
                    className="w-7 flex items-center justify-center border-l border-border text-muted-foreground/40 hover:text-destructive hover:bg-destructive/5 transition-colors shrink-0 opacity-0 group-hover:opacity-100 outline-none"
                    aria-label={`Remove variable ${variable.key || index + 1}`}
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="border border-dashed border-border rounded-md py-6 text-center text-sm text-muted-foreground">
              No variables yet — click <strong>+ Add Variable</strong> to add one
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-border bg-muted/20 shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-foreground bg-accent hover:bg-accent/80 rounded-md transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || !formName.trim()}
            className="px-4 py-2 text-sm font-medium bg-primary hover:bg-primary/90 text-primary-foreground rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : editingEnv ? 'Save Changes' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function EnvironmentPanel({ onUpdate }: Props) {
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEnv, setEditingEnv] = useState<Environment | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
  const [isExpanded, setIsExpanded] = useState(true);
  const { currentTeam } = useTeam();

  useEffect(() => {
    if (currentTeam) loadEnvironments();
    else setEnvironments([]);
  }, [currentTeam?.id]);

  const loadEnvironments = async () => {
    if (!currentTeam) return;
    try {
      const data = await getEnvironments(currentTeam.id);
      setEnvironments(data);
      onUpdate();
    } catch (err) {
      console.error('Failed to load environments:', err);
    }
  };

  const handleSave = async (name: string, variables: Record<string, string>) => {
    if (!currentTeam) return;
    if (editingEnv?.id) {
      await updateEnvironment(currentTeam.id, editingEnv.id, { name, variables });
    } else {
      await createEnvironment(currentTeam.id, { name, variables });
    }
    loadEnvironments();
  };

  const openNew = () => { setEditingEnv(null); setModalOpen(true); };
  const openEdit = (env: Environment) => { setEditingEnv(env); setModalOpen(true); };
  const closeModal = () => { setModalOpen(false); setEditingEnv(null); };

  const handleConfirmDelete = async () => {
    if (!currentTeam || !deleteTargetId) return;
    try {
      await deleteEnvironment(currentTeam.id, deleteTargetId);
      loadEnvironments();
    } catch (err) {
      console.error('Failed to delete environment:', err);
    }
    setDeleteTargetId(null);
  };

  if (!currentTeam) {
    return (
      <div className="p-4 border-t border-border bg-card">
        <p className="text-sm text-muted-foreground">Select a team to manage environments</p>
      </div>
    );
  }

  return (
    <>
      <div className="border-t border-border bg-card">
        {/* Header */}
        <div
          className="flex justify-between items-center px-3 py-2 cursor-pointer hover:bg-accent"
          onClick={() => setIsExpanded(e => !e)}
        >
          <h3 className="font-semibold text-foreground text-sm flex items-center gap-1.5">
            <svg className={`w-3 h-3 text-muted-foreground transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            Environments
            <span className="text-xs text-muted-foreground font-normal">({environments.length})</span>
          </h3>
          {isExpanded && (
            <button
              onClick={(e) => { e.stopPropagation(); openNew(); }}
              className="px-2 py-1 bg-primary hover:bg-primary/90 text-primary-foreground text-[10px] rounded-lg shadow-sm focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="New environment"
            >
              New
            </button>
          )}
        </div>

        {/* Environment list */}
        {isExpanded && (
          <div className="px-3 pb-2 max-h-48 overflow-y-auto">
            {environments.length === 0 ? (
              <div className="text-center py-4">
                <svg className="w-8 h-8 mx-auto text-muted-foreground/50 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <p className="text-sm text-muted-foreground">No environments yet</p>
                <p className="text-xs text-muted-foreground/70 mt-0.5">Click New to create one</p>
              </div>
            ) : (
              environments.map(env => (
                <div
                  key={env.id}
                  className="p-2 mb-1 bg-muted border border-border rounded-lg flex justify-between items-center hover:bg-accent group"
                >
                  <div className="min-w-0 flex-1 mr-2">
                    <div className="font-semibold text-foreground text-sm truncate">{env.name}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {Object.keys(env.variables).length} variable{Object.keys(env.variables).length !== 1 ? 's' : ''}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button
                      onClick={() => openEdit(env)}
                      className="px-2 py-1 bg-primary hover:bg-primary/90 text-primary-foreground text-xs rounded-lg focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => env.id && setDeleteTargetId(env.id)}
                      className="px-2 py-1 bg-destructive hover:bg-destructive/90 text-destructive-foreground text-xs rounded-lg focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      Del
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Create / Edit modal */}
      <EnvironmentModal
        isOpen={modalOpen}
        editingEnv={editingEnv}
        onClose={closeModal}
        onSave={handleSave}
      />

      {/* Delete confirmation */}
      <ConfirmModal
        isOpen={!!deleteTargetId}
        title="Delete environment?"
        message="Are you sure you want to delete this environment? This action cannot be undone."
        confirmText="Delete"
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTargetId(null)}
        variant="danger"
      />
    </>
  );
}
