import { useState, useEffect } from 'react';
import { getEnvironments, createEnvironment, updateEnvironment, deleteEnvironment } from '../services/api';
import { useTeam } from '../contexts/TeamContext';
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

  const handleDelete = async (id: number) => {
    if (!currentTeam) return;
    if (confirm('Delete this environment?')) {
      try {
        await deleteEnvironment(currentTeam.id, id);
        loadEnvironments();
      } catch (err) {
        console.error('Failed to delete environment:', err);
      }
    }
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
        className="flex justify-between items-center p-4 cursor-pointer hover:bg-accent"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <span className="text-muted-foreground text-xs">{isExpanded ? '▼' : '▶'}</span>
          Environments
          <span className="text-xs text-muted-foreground font-normal">({environments.length})</span>
        </h3>
        {!showForm && isExpanded && (
          <button
            onClick={(e) => { e.stopPropagation(); setShowForm(true); }}
            className="px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white text-xs rounded-lg shadow-sm "
          >
            New
          </button>
        )}
      </div>

      {isExpanded && showForm && (
        <div className="mx-4 mb-4 p-4 bg-muted rounded-lg border border-border">
          <div className="p-3 mb-4 bg-yellow-50 dark:bg-yellow-900/20 border-l-4 border-yellow-400 rounded-r-lg">
            <p className="text-xs text-yellow-800 dark:text-yellow-200">
              Define variables here, then use them in requests with <code className="bg-white dark:bg-gray-600 px-1.5 py-0.5 rounded text-xs font-mono">{'{{variableName}}'}</code>
            </p>
          </div>
          <input
            type="text"
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            placeholder="Environment name"
            className="w-full border border-border rounded-lg px-3 py-2 mb-4 text-sm focus:ring-2 focus:ring-ring focus:border-primary outline-none bg-card text-foreground"
          />

          <h4 className="font-semibold text-foreground mb-3 text-sm">Variables</h4>
          <div className="max-h-48 overflow-y-auto">
            {formVariables.map((variable, index) => (
              <div key={index} className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={variable.key}
                  onChange={(e) => updateVariable(index, 'key', e.target.value)}
                  placeholder="Key"
                  className="w-1/3 min-w-0 border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-ring focus:border-primary outline-none bg-card text-foreground"
                />
                <input
                  type="text"
                  value={variable.value}
                  onChange={(e) => updateVariable(index, 'value', e.target.value)}
                  placeholder="Value"
                  title={variable.value}
                  className="flex-1 min-w-0 border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-ring focus:border-primary outline-none truncate bg-card text-foreground"
                />
                <button
                  onClick={() => removeVariable(index)}
                  className="px-3 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm  flex-shrink-0"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={addVariable}
            className="mb-4 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg text-sm shadow-sm "
          >
            Add Variable
          </button>

          <div className="flex gap-2">
            <button
              onClick={handleSubmit}
              className="px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg text-sm shadow-sm "
            >
              Save
            </button>
            <button
              onClick={resetForm}
              className="px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-lg text-sm shadow-sm "
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {isExpanded && (
        <div className="px-4 pb-4 max-h-48 overflow-y-auto">
          {environments.map(env => (
            <div
              key={env.id}
              className="p-3 mb-2 bg-muted border border-border rounded-lg flex justify-between items-center hover:bg-accent "
            >
              <div className="min-w-0 flex-1 mr-2">
                <div className="font-semibold text-foreground text-sm truncate">{env.name}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {Object.keys(env.variables).length} variables
                </div>
              </div>
              <div className="flex gap-1 flex-shrink-0">
                <button
                  onClick={() => handleEdit(env)}
                  className="px-2 py-1 bg-primary hover:bg-primary/90 text-primary-foreground text-xs rounded "
                >
                  Edit
                </button>
                <button
                  onClick={() => env.id && handleDelete(env.id)}
                  className="px-2 py-1 bg-red-500 hover:bg-red-600 text-white text-xs rounded "
                >
                  Del
                </button>
              </div>
            </div>
          ))}
          {environments.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-2">No environments yet</p>
          )}
        </div>
      )}
    </div>
  );
}
