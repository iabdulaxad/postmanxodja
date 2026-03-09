// Auth types
export interface User {
  id: number;
  email: string;
  name: string;
  created_at: string;
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: User;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
}

// Team types
export interface Team {
  id: number;
  name: string;
  created_at: string;
  members?: TeamMember[];
}

export interface TeamMember {
  id: number;
  team_id: number;
  user_id: number;
  role: 'owner' | 'member';
  joined_at: string;
  user?: User;
}

export interface TeamInvite {
  id: number;
  team_id: number;
  invitee_email: string;
  status: 'pending' | 'accepted' | 'declined';
  expires_at: string;
  created_at: string;
  team?: Team;
  inviter?: User;
  token?: string;
}

// Collection types
export interface Collection {
  id: number;
  name: string;
  description: string;
  raw_json?: string;
  environment_id?: number | null;
  team_id?: number;
  created_at: string;
}

export interface PostmanCollection {
  info: {
    _postman_id?: string;
    name: string;
    description: string;
    schema: string;
    _exporter_id?: string;
    _collection_link?: string;
  };
  item: PostmanItem[];
  variable?: PostmanVariable[];
}

export interface PostmanItem {
  name: string;
  request?: PostmanRequest;
  response?: PostmanResponse[];
  item?: PostmanItem[];
}

// Saved example response (Postman collection v2.1 format)
export interface PostmanResponse {
  name: string;
  originalRequest?: PostmanRequest;
  status: string;
  code: number;
  header?: PostmanKeyValue[];
  body: string;
  responseTime?: number;
}

export interface PostmanRequest {
  auth?: PostmanAuth;
  method: string;
  header?: PostmanKeyValue[];
  body?: PostmanRequestBody;
  url?: string | PostmanURL;
}

export interface PostmanAuth {
  type: string; // bearer, basic, apikey, oauth2, etc.
  bearer?: PostmanAuthParameter[];
  basic?: PostmanAuthParameter[];
  apikey?: PostmanAuthParameter[];
  oauth2?: PostmanAuthParameter[];
}

export interface PostmanAuthParameter {
  key: string;
  value: string;
  type?: string;
}

export interface PostmanURL {
  raw: string;
  protocol?: string;
  host?: string[];
  path?: string[];
  query?: PostmanKeyValue[];
}

export interface PostmanKeyValue {
  key: string;
  value: string;
  disabled?: boolean;
}

export interface PostmanRequestBody {
  mode: string;
  raw?: string;
  options?: {
    raw?: {
      language?: string;
    };
  };
}

export interface PostmanVariable {
  key: string;
  value: string;
  type?: string;
}

export type BodyType = 'none' | 'raw' | 'form-data' | 'x-www-form-urlencoded';

export interface FormDataItem {
  key: string;
  value: string;
  type: 'text' | 'file';
  file?: File;
}

export interface ExecuteRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string;
  body_type?: BodyType;
  form_data?: FormDataItem[];
  query_params: Record<string, string>;
  environment_id?: number;
}

export interface ExecuteResponse {
  status: number;
  status_text: string;
  headers: Record<string, string>;
  body: string;
  time: number;
}

// Request info that was sent (for display in response viewer like Swagger)
export interface SentRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string;
  bodyType?: BodyType;
  queryParams: Record<string, string>;
  timestamp: number;
}

// Combined response with request info for Swagger-like display
export interface ApiCallResult {
  request: SentRequest;
  response: ExecuteResponse;
}

export interface Environment {
  id?: number;
  name: string;
  variables: Record<string, string>;
  team_id?: number;
  created_at?: string;
}

// Tab types
export interface RequestTab {
  id: string;
  name: string;
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string;
  bodyType?: BodyType;
  formData?: FormDataItem[];
  queryParams: Record<string, string>;
  request?: PostmanRequest;
  isDirty?: boolean;
  // Collection source info for syncing changes back
  collectionId?: number;
  itemPath?: string; // Path to the item in the collection (e.g., "folder1/folder2/request")
  savedResponseIndex?: number; // Index of saved response this tab was opened from
}
