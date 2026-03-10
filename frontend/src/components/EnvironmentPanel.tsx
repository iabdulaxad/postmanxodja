import { useState, useEffect } from 'react';
import { getEnvironments, createEnvironment, updateEnvironment, deleteEnvironment } from '../services/api';
import { useTeam } from '../contexts/TeamContext';
import ConfirmModal from './ConfirmModal';
import type { Environment } from '../types';

interface Props {
  onUpdate: () => void;
}

export default function EnvironmentPanel({ onUpdate }: Props) {
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingEnv, setEditingEnv] = useState<Environment | null>(null);
  const [formName, setFormName] = useState('');
  const [formVariables, setFormVariables] = useState<Array<{ key: string; value: string }>>([]);
  const [isExpanded, setIsExpanded] = useState(true);
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
  const { currentTeam } = useTeam();

  useEffect(() => {
    if (currentTeam) {
      loadEnvironments();
    } else {
      setEnvironments([]);
    }
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

  const handleSubmit = async () => {
    if (!currentTeam) return;
    const variables = Object.fromEntries(formVariables.filter(v => v.key).map(v => [v.key, v.value]));

    try {
      if (editingEnv?.id) {
        await updateEnvironment(currentTeam.id, editingEnv.id, { name: formName, variables });
      } else {
        await createEnvironment(currentTeam.id, { name: formName, variables });
      }
      resetForm();
      loadEnvironments();
    } catch (err) {
      console.error('Failed to save environment:', err);
    }
  };

  const handleEdit = (env: Environment) => {
    setEditingEnv(env);
    setFormName(env.name);
    setFormVariables(Object.entries(env.variables).map(([key, value]) => ({ key, value })));
    setShowForm(true);
  };

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

  const resetForm = () => {
    setShowForm(false);
    setEditingEnv(null);
    setFormName('');
    setFormVariables([]);
  };

  const addVariable = () => setFormVariables([...formVariables, { key: '', value: '' }]);
  const updateVariable = (index: number, field: 'key' | 'value', value: string) => {
    const newVars = [...formVariables];
    newVars[index][field] = value;
    setFormVariables(newVars);
  };
  const removeVariable = (index: number) => setFormVariables(formVariables.filter((_, i) => i !== index));

  if (!currentTeam) {
    return (
      <div className="p-4 border-t border-border bg-card">
        <p className="text-sm text-muted-foreground">Select a team to manage environments</p>
      </div>
    );
  }

  return (
    <div className="border-t border-border bg-card">
      <div
        className="flex justify-between items-center px-3 py-2 cursor-pointer hover:bg-accent"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <h3 className="font-semibold text-foreground text-sm flex items-center gap-1.5">
          <svg className={`w-3 h-3 text-muted-foreground transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          Environments
          <span className="text-xs text-muted-foreground font-normal">({environments.length})</span>
        </h3>
        {!showForm && isExpanded && (
          <button
            onClick={(e) => { e.stopPropagation(); setShowForm(true); }}
            className="px-2 py-1 bg-primary hover:bg-primary/90 text-primary-foreground text-[10px] rounded-lg shadow-sm focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="New environment"
          >
            New
          </button>
        )}
      </div>

      {isExpanded && showForm && (
        <div className="mx-3 mb-2 p-3 bg-muted rounded-lg border border-border">
          <div className="p-2 mb-2 bg-primary/10 border-l-4 border-primary rounded-r-lg">
            <p className="text-xs text-primary">
              Define variables here, then use them in requests with <code className="bg-card px-1.5 py-0.5 rounded text-xs font-mono">{'{{variableName}}'}</code>
            </p>
          </div>
          <label htmlFor="env-name" className="block text-xs font-medium text-foreground mb-1">Environment Name</label>
          <input
            id="env-name"
            type="text"
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            placeholder="e.g. Production"
            className="w-full border border-border rounded-lg px-2 py-1.5 mb-2 text-sm focus:ring-2 focus:ring-ring focus:border-primary outline-none bg-card text-foreground"
          />

          <h4 className="font-semibold text-foreground mb-2 text-xs">Variables</h4>
          <div className="max-h-48 overflow-y-auto">
            {formVariables.map((variable, index) => (
              <div key={index} className="flex gap-2 mb-2">
                <div className="w-1/3 min-w-0">
                  <label htmlFor={`env-var-key-${index}`} className="sr-only">Variable key</label>
                  <input
                    id={`env-var-key-${index}`}
                    type="text"
                    value={variable.key}
                    onChange={(e) => updateVariable(index, 'key', e.target.value)}
                    placeholder="Key"
                    className="w-full border border-border rounded-lg px-2 py-1 text-xs focus:ring-2 focus:ring-ring focus:border-primary outline-none bg-card text-foreground"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <label htmlFor={`env-var-value-${index}`} className="sr-only">Variable value</label>
                  <input
                    id={`env-var-value-${index}`}
                    type="text"
                    value={variable.value}
                    onChange={(e) => updateVariable(index, 'value', e.target.value)}
                    placeholder="Value"
                    title={variable.value}
                    className="w-full border border-border rounded-lg px-2 py-1 text-xs focus:ring-2 focus:ring-ring focus:border-primary outline-none truncate bg-card text-foreground"
                  />
                </div>
                <button
                  onClick={() => removeVariable(index)}
                  className="px-2 py-1 bg-destructive hover:bg-destructive/90 text-destructive-foreground rounded-lg text-xs shrink-0 focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`Remove variable ${variable.key || index + 1}`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={addVariable}
            className="mb-2 px-3 py-1 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg text-xs shadow-sm focus-visible:ring-2 focus-visible:ring-ring"
          >
            Add Variable
          </button>

          <div className="flex gap-2">
            <button
              onClick={handleSubmit}
              className="px-3 py-1 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg text-xs shadow-sm focus-visible:ring-2 focus-visible:ring-ring"
            >
              Save
            </button>
            <button
              onClick={resetForm}
              className="px-3 py-1 bg-muted hover:bg-accent text-foreground rounded-lg text-xs shadow-sm focus-visible:ring-2 focus-visible:ring-ring"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {isExpanded && (
        <div className="px-3 pb-2 max-h-48 overflow-y-auto">
          {environments.map(env => (
            <div
              key={env.id}
              className="p-2 mb-1 bg-muted border border-border rounded-lg flex justify-between items-center hover:bg-accent"
            >
              <div className="min-w-0 flex-1 mr-2">
                <div className="font-semibold text-foreground text-sm truncate">{env.name}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {Object.keys(env.variables).length} variables
                </div>
              </div>
              <div className="flex gap-1 shrink-0">
                <button
                  onClick={() => handleEdit(env)}
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
          ))}
          {environments.length === 0 && (
            <div className="text-center py-4">
              <svg className="w-8 h-8 mx-auto text-muted-foreground/50 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <p className="text-sm text-muted-foreground">No environments yet</p>
              <p className="text-xs text-muted-foreground/70 mt-0.5">Create one to use variables in requests</p>
            </div>
          )}
        </div>
      )}

      <ConfirmModal
        isOpen={!!deleteTargetId}
        title="Delete environment?"
        message="Are you sure you want to delete this environment? This action cannot be undone."
        confirmText="Delete"
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTargetId(null)}
        variant="danger"
      />
    </div>
  );
}
