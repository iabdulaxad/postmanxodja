/**
 * AI Settings service - manages team OpenAI configuration and DBML analysis
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080/api';

const getAuthHeaders = () => {
  const token = localStorage.getItem('access_token');
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
};

export interface AISettingsResponse {
  id: number;
  team_id: number;
  provider: string;
  model: string;
  is_enabled: boolean;
  has_api_key: boolean;
  key_preview: string;
  created_at: string;
  updated_at: string;
}

export interface AISettingsRequest {
  api_key?: string;
  provider?: string;
  model?: string;
}

export interface AIAnalysisTable {
  name: string;
  essential: boolean;
  purpose: string;
  auth_type: string | null;
}

export interface AIAnalysisDomain {
  name: string;
  icon: string;
  description: string;
  tables: AIAnalysisTable[];
}

export interface AIAuthTable {
  table_name: string;
  auth_type: string;
  login_fields: string[];
  register_fields: Record<string, string>;
  login_body: Record<string, string>;
  has_roles: boolean;
  client_type_table: string;
}

export interface AIAnalysisResult {
  project_summary: string;
  domains: AIAnalysisDomain[];
  auth_tables: AIAuthTable[];
  skip_tables: string[];
  table_count_total: number;
  table_count_essential: number;
  table_count_skipped: number;
}

export interface AIAnalyzeResponse {
  analysis: AIAnalysisResult;
  model: string;
  provider: string;
}

export const AI_MODELS = [
  { value: 'gpt-4o', label: 'GPT-4o', description: 'Most capable, best analysis' },
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini', description: 'Fast & cheap, good quality' },
  { value: 'gpt-4-turbo', label: 'GPT-4 Turbo', description: 'Previous generation, reliable' },
  { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo', description: 'Fastest, basic analysis' },
  { value: 'o1', label: 'O1', description: 'Reasoning model, thorough' },
  { value: 'o1-mini', label: 'O1 Mini', description: 'Reasoning model, compact' },
  { value: 'o3-mini', label: 'O3 Mini', description: 'Latest reasoning model' },
];

export const getAISettings = async (teamId: number): Promise<AISettingsResponse> => {
  const response = await fetch(`${API_BASE_URL}/teams/${teamId}/ai-settings`, {
    headers: getAuthHeaders(),
  });
  if (!response.ok) throw new Error('Failed to get AI settings');
  return response.json();
};

export const updateAISettings = async (teamId: number, settings: AISettingsRequest): Promise<AISettingsResponse> => {
  const response = await fetch(`${API_BASE_URL}/teams/${teamId}/ai-settings`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(settings),
  });
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error || 'Failed to update AI settings');
  }
  return response.json();
};

export const deleteAISettings = async (teamId: number): Promise<void> => {
  const response = await fetch(`${API_BASE_URL}/teams/${teamId}/ai-settings`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  if (!response.ok) throw new Error('Failed to delete AI settings');
};

export const analyzeDBML = async (teamId: number, data: {
  dbml: string;
  project_id: string;
  environment_id: string;
  base_url: string;
  ucode_api_key: string;
}): Promise<AIAnalyzeResponse> => {
  const response = await fetch(`${API_BASE_URL}/teams/${teamId}/ai-analyze`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error || 'AI analysis failed');
  }
  return response.json();
};
