/**
 * DBML Parser - Parses DBML (Database Markup Language) strings into structured table data.
 * Used to import U-Code project schemas and generate CRUD collections.
 */

export interface DBMLColumn {
  name: string;
  type: string;
}

export interface DBMLTable {
  name: string;
  columns: DBMLColumn[];
}

export interface DBMLRef {
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
}

export interface DBMLSchema {
  tables: DBMLTable[];
  refs: DBMLRef[];
}

/**
 * Parse a DBML string into structured schema data.
 */
export function parseDBML(dbml: string): DBMLSchema {
  const tables: DBMLTable[] = [];
  const refs: DBMLRef[] = [];

  // Parse tables
  const tableRegex = /Table\s+(\S+)\s*\{([^}]*)}/g;
  let tableMatch: RegExpExecArray | null;

  while ((tableMatch = tableRegex.exec(dbml)) !== null) {
    const tableName = tableMatch[1];
    const body = tableMatch[2];
    const columns: DBMLColumn[] = [];

    const lines = body.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('Note')) continue;

      // Column format: column_name TYPE
      const colMatch = trimmed.match(/^(\S+)\s+(.*)/);
      if (colMatch) {
        columns.push({
          name: colMatch[1],
          type: colMatch[2].trim() || 'VARCHAR',
        });
      }
    }

    tables.push({ name: tableName, columns });
  }

  // Parse refs: Ref: table1.col > table2.col
  const refRegex = /Ref:\s*(\S+)\.(\S+)\s*>\s*(\S+)\.(\S+)/g;
  let refMatch: RegExpExecArray | null;

  while ((refMatch = refRegex.exec(dbml)) !== null) {
    refs.push({
      fromTable: refMatch[1],
      fromColumn: refMatch[2],
      toTable: refMatch[3],
      toColumn: refMatch[4],
    });
  }

  return { tables, refs };
}

/**
 * Get a default/sample value for a field based on its type.
 */
function getDefaultValue(type: string, fieldName: string): any {
  const upperType = type.toUpperCase();

  if (fieldName === 'guid') return '{{guid}}';
  if (fieldName.endsWith('_id') && upperType === 'UUID') return '{{guid}}';

  if (upperType.includes('UUID')) return '00000000-0000-0000-0000-000000000000';
  if (upperType.includes('FLOAT') || upperType.includes('INT') || upperType.includes('NUMERIC')) return 0;
  if (upperType.includes('BOOL')) return false;
  if (upperType.includes('TIMESTAMP') || upperType.includes('DATE')) return new Date().toISOString();
  if (upperType.includes('TEXT[]')) return ['value'];
  if (upperType.includes('UUID[]')) return ['00000000-0000-0000-0000-000000000000'];
  return '';
}

/**
 * Generate a sample body object for a table's create/update operations.
 */
function generateSampleBody(table: DBMLTable, excludeFields: string[] = []): Record<string, any> {
  const body: Record<string, any> = {};
  for (const col of table.columns) {
    if (excludeFields.includes(col.name)) continue;
    body[col.name] = getDefaultValue(col.type, col.name);
  }
  return body;
}

/**
 * Generate a Postman-compatible collection from parsed DBML tables.
 * Creates CRUD operations for each table plus Auth folder.
 */
export function generateUCodeCollection(
  schema: DBMLSchema,
  projectId: string,
  environmentId: string,
  apiKey: string,
  baseUrl: string = 'https://api.admin.u-code.io'
): any {
  const authHeaders = [
    { key: 'authorization', value: 'API-KEY', disabled: false },
    { key: 'x-api-key', value: apiKey || '{{api_key}}', disabled: false },
    { key: 'Content-Type', value: 'application/json', disabled: false },
  ];

  const items: any[] = [];

  // --- Auth folder ---
  const authFolder: any = {
    name: '🔐 Authentication',
    item: [
      {
        name: 'Register',
        request: {
          method: 'POST',
          header: [{ key: 'Content-Type', value: 'application/json', disabled: false }],
          url: {
            raw: `${baseUrl}/v2/register?project-id=${projectId}`,
            protocol: 'https',
            host: baseUrl.replace('https://', '').split('.'),
            path: ['v2', 'register'],
            query: [{ key: 'project-id', value: projectId, disabled: false }],
          },
          body: {
            mode: 'raw',
            raw: JSON.stringify({
              login: 'user@example.com',
              password: 'password123',
              name: 'John Doe',
              phone: '+1234567890',
            }, null, 2),
            options: { raw: { language: 'json' } },
          },
        },
      },
      {
        name: 'Login',
        request: {
          method: 'POST',
          header: [{ key: 'Content-Type', value: 'application/json', disabled: false }],
          url: {
            raw: `${baseUrl}/v2/login`,
            protocol: 'https',
            host: baseUrl.replace('https://', '').split('.'),
            path: ['v2', 'login'],
          },
          body: {
            mode: 'raw',
            raw: JSON.stringify({
              login: 'user@example.com',
              password: 'password123',
              project_id: projectId,
            }, null, 2),
            options: { raw: { language: 'json' } },
          },
        },
      },
      {
        name: 'Login with Options',
        request: {
          method: 'POST',
          header: [{ key: 'Content-Type', value: 'application/json', disabled: false }],
          url: {
            raw: `${baseUrl}/v2/login/with-option?project-id=${projectId}`,
            protocol: 'https',
            host: baseUrl.replace('https://', '').split('.'),
            path: ['v2', 'login', 'with-option'],
            query: [{ key: 'project-id', value: projectId, disabled: false }],
          },
          body: {
            mode: 'raw',
            raw: JSON.stringify({
              login: 'user@example.com',
              password: 'password123',
            }, null, 2),
            options: { raw: { language: 'json' } },
          },
        },
      },
      {
        name: 'Send OTP Code',
        request: {
          method: 'POST',
          header: [{ key: 'Content-Type', value: 'application/json', disabled: false }],
          url: {
            raw: `${baseUrl}/v2/send-code`,
            protocol: 'https',
            host: baseUrl.replace('https://', '').split('.'),
            path: ['v2', 'send-code'],
          },
          body: {
            mode: 'raw',
            raw: JSON.stringify({
              phone: '+1234567890',
              project_id: projectId,
            }, null, 2),
            options: { raw: { language: 'json' } },
          },
        },
      },
      {
        name: 'Reset Password',
        request: {
          method: 'PUT',
          header: authHeaders,
          url: {
            raw: `${baseUrl}/v2/reset-password`,
            protocol: 'https',
            host: baseUrl.replace('https://', '').split('.'),
            path: ['v2', 'reset-password'],
          },
          body: {
            mode: 'raw',
            raw: JSON.stringify({
              login: 'user@example.com',
              new_password: 'new_password123',
              code: '123456',
            }, null, 2),
            options: { raw: { language: 'json' } },
          },
        },
      },
    ],
  };
  items.push(authFolder);

  // --- Files folder ---
  const filesFolder: any = {
    name: '📁 Files',
    item: [
      {
        name: 'Upload File',
        request: {
          method: 'POST',
          header: [
            { key: 'authorization', value: 'API-KEY', disabled: false },
            { key: 'x-api-key', value: apiKey || '{{api_key}}', disabled: false },
          ],
          url: {
            raw: `${baseUrl}/v2/files`,
            protocol: 'https',
            host: baseUrl.replace('https://', '').split('.'),
            path: ['v2', 'files'],
          },
          body: {
            mode: 'formdata',
            formdata: [
              { key: 'file', type: 'file', src: '' },
              { key: 'title', value: 'My File', type: 'text' },
            ],
          },
        },
      },
      {
        name: 'Delete File',
        request: {
          method: 'DELETE',
          header: authHeaders,
          url: {
            raw: `${baseUrl}/v2/files/{{file_id}}`,
            protocol: 'https',
            host: baseUrl.replace('https://', '').split('.'),
            path: ['v2', 'files', '{{file_id}}'],
          },
        },
      },
    ],
  };
  items.push(filesFolder);

  // --- Table CRUD folders ---
  for (const table of schema.tables) {
    const slug = table.name;
    const sampleCreate = generateSampleBody(table, ['guid']);
    const sampleUpdate = generateSampleBody(table);

    const tableFolder: any = {
      name: `📋 ${slug}`,
      item: [
        // GET List
        {
          name: `List ${slug}`,
          request: {
            method: 'GET',
            header: authHeaders,
            url: {
              raw: `${baseUrl}/v2/items/${slug}?from-ofs=true&offset=0&limit=10`,
              protocol: 'https',
              host: baseUrl.replace('https://', '').split('.'),
              path: ['v2', 'items', slug],
              query: [
                { key: 'from-ofs', value: 'true', disabled: false },
                { key: 'offset', value: '0', disabled: false },
                { key: 'limit', value: '10', disabled: false },
              ],
            },
          },
        },
        // GET List with Relations
        {
          name: `List ${slug} (with relations)`,
          request: {
            method: 'GET',
            header: authHeaders,
            url: {
              raw: `${baseUrl}/v2/items/${slug}?from-ofs=true&offset=0&limit=10&data=${encodeURIComponent(JSON.stringify({ with_relations: true }))}`,
              protocol: 'https',
              host: baseUrl.replace('https://', '').split('.'),
              path: ['v2', 'items', slug],
              query: [
                { key: 'from-ofs', value: 'true', disabled: false },
                { key: 'offset', value: '0', disabled: false },
                { key: 'limit', value: '10', disabled: false },
                { key: 'data', value: JSON.stringify({ with_relations: true }), disabled: false },
              ],
            },
          },
        },
        // GET Single
        {
          name: `Get ${slug} by ID`,
          request: {
            method: 'GET',
            header: authHeaders,
            url: {
              raw: `${baseUrl}/v2/items/${slug}/{{guid}}?from-ofs=true`,
              protocol: 'https',
              host: baseUrl.replace('https://', '').split('.'),
              path: ['v2', 'items', slug, '{{guid}}'],
              query: [
                { key: 'from-ofs', value: 'true', disabled: false },
              ],
            },
          },
        },
        // CREATE
        {
          name: `Create ${slug}`,
          request: {
            method: 'POST',
            header: authHeaders,
            url: {
              raw: `${baseUrl}/v2/items/${slug}?from-ofs=true`,
              protocol: 'https',
              host: baseUrl.replace('https://', '').split('.'),
              path: ['v2', 'items', slug],
              query: [
                { key: 'from-ofs', value: 'true', disabled: false },
              ],
            },
            body: {
              mode: 'raw',
              raw: JSON.stringify({ data: sampleCreate, disable_faas: true }, null, 2),
              options: { raw: { language: 'json' } },
            },
          },
        },
        // UPDATE Single
        {
          name: `Update ${slug}`,
          request: {
            method: 'PUT',
            header: authHeaders,
            url: {
              raw: `${baseUrl}/v2/items/${slug}?from-ofs=true`,
              protocol: 'https',
              host: baseUrl.replace('https://', '').split('.'),
              path: ['v2', 'items', slug],
              query: [
                { key: 'from-ofs', value: 'true', disabled: false },
              ],
            },
            body: {
              mode: 'raw',
              raw: JSON.stringify({ data: sampleUpdate, disable_faas: true }, null, 2),
              options: { raw: { language: 'json' } },
            },
          },
        },
        // UPDATE Multiple
        {
          name: `Update Multiple ${slug}`,
          request: {
            method: 'PATCH',
            header: authHeaders,
            url: {
              raw: `${baseUrl}/v2/items/${slug}?from-ofs=true`,
              protocol: 'https',
              host: baseUrl.replace('https://', '').split('.'),
              path: ['v2', 'items', slug],
              query: [
                { key: 'from-ofs', value: 'true', disabled: false },
              ],
            },
            body: {
              mode: 'raw',
              raw: JSON.stringify({
                data: {
                  objects: [
                    { guid: '{{guid_1}}', ...Object.fromEntries(Object.entries(sampleCreate).slice(0, 2)) },
                    { guid: '{{guid_2}}', ...Object.fromEntries(Object.entries(sampleCreate).slice(0, 2)) },
                  ],
                },
                disable_faas: true,
              }, null, 2),
              options: { raw: { language: 'json' } },
            },
          },
        },
        // DELETE Single
        {
          name: `Delete ${slug}`,
          request: {
            method: 'DELETE',
            header: authHeaders,
            url: {
              raw: `${baseUrl}/v2/items/${slug}/{{guid}}?from-ofs=true`,
              protocol: 'https',
              host: baseUrl.replace('https://', '').split('.'),
              path: ['v2', 'items', slug, '{{guid}}'],
              query: [
                { key: 'from-ofs', value: 'true', disabled: false },
              ],
            },
          },
        },
        // DELETE Multiple
        {
          name: `Delete Multiple ${slug}`,
          request: {
            method: 'DELETE',
            header: authHeaders,
            url: {
              raw: `${baseUrl}/v2/items/${slug}?from-ofs=true`,
              protocol: 'https',
              host: baseUrl.replace('https://', '').split('.'),
              path: ['v2', 'items', slug],
              query: [
                { key: 'from-ofs', value: 'true', disabled: false },
              ],
            },
            body: {
              mode: 'raw',
              raw: JSON.stringify({ ids: ['{{guid_1}}', '{{guid_2}}'] }, null, 2),
              options: { raw: { language: 'json' } },
            },
          },
        },
        // Aggregation
        {
          name: `Aggregate ${slug}`,
          request: {
            method: 'POST',
            header: authHeaders,
            url: {
              raw: `${baseUrl}/v2/items/${slug}/aggregation`,
              protocol: 'https',
              host: baseUrl.replace('https://', '').split('.'),
              path: ['v2', 'items', slug, 'aggregation'],
            },
            body: {
              mode: 'raw',
              raw: JSON.stringify({
                data: {
                  pipeline: [
                    { $group: { _id: null, count: { $sum: 1 } } },
                  ],
                },
              }, null, 2),
              options: { raw: { language: 'json' } },
            },
          },
        },
      ],
    };

    items.push(tableFolder);
  }

  // Build the full Postman collection
  return {
    info: {
      name: `UCode Project (${projectId.slice(0, 8)}...)`,
      description: `Auto-generated CRUD collection for UCode project.\nProject ID: ${projectId}\nEnvironment ID: ${environmentId}\nTables: ${schema.tables.length}\nGenerated at: ${new Date().toISOString()}`,
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    },
    item: items,
    variable: [
      { key: 'base_url', value: baseUrl, type: 'string' },
      { key: 'api_key', value: apiKey, type: 'string' },
      { key: 'project_id', value: projectId, type: 'string' },
      { key: 'environment_id', value: environmentId, type: 'string' },
      { key: 'guid', value: '00000000-0000-0000-0000-000000000000', type: 'string' },
      { key: 'guid_1', value: '00000000-0000-0000-0000-000000000001', type: 'string' },
      { key: 'guid_2', value: '00000000-0000-0000-0000-000000000002', type: 'string' },
      { key: 'file_id', value: '', type: 'string' },
    ],
  };
}

/**
 * Generate a Postman-compatible collection using AI analysis results.
 * Groups tables into logical domains, builds smart auth flows, skips unnecessary tables.
 */
export function generateAIUCodeCollection(
  schema: DBMLSchema,
  analysis: import('../services/ai').AIAnalysisResult,
  projectId: string,
  environmentId: string,
  apiKey: string,
  baseUrl: string = 'https://api.admin.u-code.io',
  selectedTables?: Set<string>
): any {
  const authHeaders = [
    { key: 'authorization', value: 'API-KEY', disabled: false },
    { key: 'x-api-key', value: apiKey || '{{api_key}}', disabled: false },
    { key: 'Content-Type', value: 'application/json', disabled: false },
  ];

  const items: any[] = [];
  // If selectedTables is provided, skip any table NOT in the set; otherwise use AI skip_tables
  const skipSet = selectedTables
    ? new Set(schema.tables.map(t => t.name).filter(n => !selectedTables.has(n)))
    : new Set(analysis.skip_tables || []);

  // Build a map of table name -> DBMLTable for quick lookup
  const tableMap = new Map<string, DBMLTable>();
  for (const t of schema.tables) {
    tableMap.set(t.name, t);
  }

  // --- AI-driven Auth folders ---
  if (analysis.auth_tables && analysis.auth_tables.length > 0) {
    for (const authTable of analysis.auth_tables) {
      // If selectedTables provided, skip auth tables the user deselected
      if (selectedTables && !selectedTables.has(authTable.table_name)) continue;
      const authItems: any[] = [];

      // Register
      const registerBody = authTable.register_fields || {};
      authItems.push({
        name: `Register (${authTable.auth_type})`,
        request: {
          method: 'POST',
          header: [{ key: 'Content-Type', value: 'application/json', disabled: false }],
          url: {
            raw: `${baseUrl}/v2/register?project-id=${projectId}`,
            query: [{ key: 'project-id', value: projectId, disabled: false }],
          },
          body: {
            mode: 'raw',
            raw: JSON.stringify(registerBody, null, 2),
            options: { raw: { language: 'json' } },
          },
        },
      });

      // Login
      const loginBody = authTable.login_body || { login: '', password: '' };
      authItems.push({
        name: `Login (${authTable.auth_type})`,
        request: {
          method: 'POST',
          header: [{ key: 'Content-Type', value: 'application/json', disabled: false }],
          url: {
            raw: `${baseUrl}/v2/login`,
          },
          body: {
            mode: 'raw',
            raw: JSON.stringify({ ...loginBody, project_id: projectId }, null, 2),
            options: { raw: { language: 'json' } },
          },
        },
      });

      // Login with options
      authItems.push({
        name: `Login with Options (${authTable.auth_type})`,
        request: {
          method: 'POST',
          header: [{ key: 'Content-Type', value: 'application/json', disabled: false }],
          url: {
            raw: `${baseUrl}/v2/login/with-option?project-id=${projectId}`,
            query: [{ key: 'project-id', value: projectId, disabled: false }],
          },
          body: {
            mode: 'raw',
            raw: JSON.stringify(loginBody, null, 2),
            options: { raw: { language: 'json' } },
          },
        },
      });

      // Send OTP
      authItems.push({
        name: `Send OTP (${authTable.auth_type})`,
        request: {
          method: 'POST',
          header: [{ key: 'Content-Type', value: 'application/json', disabled: false }],
          url: { raw: `${baseUrl}/v2/send-code` },
          body: {
            mode: 'raw',
            raw: JSON.stringify({ phone: '+1234567890', project_id: projectId }, null, 2),
            options: { raw: { language: 'json' } },
          },
        },
      });

      // Reset Password
      authItems.push({
        name: `Reset Password (${authTable.auth_type})`,
        request: {
          method: 'PUT',
          header: authHeaders,
          url: { raw: `${baseUrl}/v2/reset-password` },
          body: {
            mode: 'raw',
            raw: JSON.stringify({ login: '', new_password: '', code: '123456' }, null, 2),
            options: { raw: { language: 'json' } },
          },
        },
      });

      // Also add CRUD for the auth table itself
      const dbmlTable = tableMap.get(authTable.table_name);
      if (dbmlTable) {
        authItems.push(...generateTableCRUDItems(dbmlTable, authHeaders, baseUrl));
      }

      items.push({
        name: `🔐 ${authTable.auth_type.charAt(0).toUpperCase() + authTable.auth_type.slice(1)} Auth (${authTable.table_name})`,
        item: authItems,
      });
    }
  }

  // --- Files folder ---
  items.push({
    name: '📁 Files',
    item: [
      {
        name: 'Upload File',
        request: {
          method: 'POST',
          header: [
            { key: 'authorization', value: 'API-KEY', disabled: false },
            { key: 'x-api-key', value: apiKey || '{{api_key}}', disabled: false },
          ],
          url: { raw: `${baseUrl}/v2/files` },
          body: {
            mode: 'formdata',
            formdata: [
              { key: 'file', type: 'file', src: '' },
              { key: 'title', value: 'My File', type: 'text' },
            ],
          },
        },
      },
      {
        name: 'Delete File',
        request: {
          method: 'DELETE',
          header: authHeaders,
          url: { raw: `${baseUrl}/v2/files/{{file_id}}` },
        },
      },
    ],
  });

  // --- Domain-grouped table folders ---
  const authTableNames = new Set((analysis.auth_tables || []).map(a => a.table_name));

  for (const domain of analysis.domains) {
    const domainItems: any[] = [];

    for (const tableInfo of domain.tables) {
      // Skip tables marked by AI, or already handled as auth tables
      if (skipSet.has(tableInfo.name) || authTableNames.has(tableInfo.name)) continue;

      const dbmlTable = tableMap.get(tableInfo.name);
      if (!dbmlTable) continue;

      const tableCrudItems = generateTableCRUDItems(dbmlTable, authHeaders, baseUrl);

      domainItems.push({
        name: `${tableInfo.essential ? '⭐' : '📋'} ${tableInfo.name}`,
        item: tableCrudItems,
      });
    }

    if (domainItems.length > 0) {
      items.push({
        name: `${domain.icon} ${domain.name}`,
        item: domainItems,
      });
    }
  }

  // --- Any tables not covered by domains (orphans) ---
  const coveredTables = new Set<string>();
  for (const domain of analysis.domains) {
    for (const t of domain.tables) coveredTables.add(t.name);
  }
  for (const authT of analysis.auth_tables || []) coveredTables.add(authT.table_name);
  for (const s of analysis.skip_tables || []) coveredTables.add(s);

  const orphanTables = schema.tables.filter(t => !coveredTables.has(t.name) && !skipSet.has(t.name));
  if (orphanTables.length > 0) {
    const orphanItems: any[] = [];
    for (const table of orphanTables) {
      orphanItems.push({
        name: `📋 ${table.name}`,
        item: generateTableCRUDItems(table, authHeaders, baseUrl),
      });
    }
    items.push({
      name: '📦 Other Tables',
      item: orphanItems,
    });
  }

  return {
    info: {
      name: `UCode Project (${projectId.slice(0, 8)}...) - AI Organized`,
      description: `AI-organized CRUD collection.\n${analysis.project_summary}\nProject ID: ${projectId}\nEnvironment ID: ${environmentId}\nTotal: ${analysis.table_count_total} tables | Essential: ${analysis.table_count_essential} | Skipped: ${analysis.table_count_skipped}\nGenerated at: ${new Date().toISOString()}`,
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    },
    item: items,
    variable: [
      { key: 'base_url', value: baseUrl, type: 'string' },
      { key: 'api_key', value: apiKey, type: 'string' },
      { key: 'project_id', value: projectId, type: 'string' },
      { key: 'environment_id', value: environmentId, type: 'string' },
      { key: 'guid', value: '00000000-0000-0000-0000-000000000000', type: 'string' },
      { key: 'guid_1', value: '00000000-0000-0000-0000-000000000001', type: 'string' },
      { key: 'guid_2', value: '00000000-0000-0000-0000-000000000002', type: 'string' },
      { key: 'file_id', value: '', type: 'string' },
    ],
  };
}

/**
 * Helper: generate the 9 CRUD items for a single table.
 */
function generateTableCRUDItems(
  table: DBMLTable,
  authHeaders: any[],
  baseUrl: string
): any[] {
  const slug = table.name;
  const sampleCreate = generateSampleBody(table, ['guid']);
  const sampleUpdate = generateSampleBody(table);

  return [
    {
      name: `List ${slug}`,
      request: {
        method: 'GET',
        header: authHeaders,
        url: {
          raw: `${baseUrl}/v2/items/${slug}?from-ofs=true&offset=0&limit=10`,
          query: [
            { key: 'from-ofs', value: 'true', disabled: false },
            { key: 'offset', value: '0', disabled: false },
            { key: 'limit', value: '10', disabled: false },
          ],
        },
      },
    },
    {
      name: `List ${slug} (with relations)`,
      request: {
        method: 'GET',
        header: authHeaders,
        url: {
          raw: `${baseUrl}/v2/items/${slug}?from-ofs=true&offset=0&limit=10&data=${encodeURIComponent(JSON.stringify({ with_relations: true }))}`,
          query: [
            { key: 'from-ofs', value: 'true', disabled: false },
            { key: 'offset', value: '0', disabled: false },
            { key: 'limit', value: '10', disabled: false },
            { key: 'data', value: JSON.stringify({ with_relations: true }), disabled: false },
          ],
        },
      },
    },
    {
      name: `Get ${slug} by ID`,
      request: {
        method: 'GET',
        header: authHeaders,
        url: {
          raw: `${baseUrl}/v2/items/${slug}/{{guid}}?from-ofs=true`,
          query: [{ key: 'from-ofs', value: 'true', disabled: false }],
        },
      },
    },
    {
      name: `Create ${slug}`,
      request: {
        method: 'POST',
        header: authHeaders,
        url: {
          raw: `${baseUrl}/v2/items/${slug}?from-ofs=true`,
          query: [{ key: 'from-ofs', value: 'true', disabled: false }],
        },
        body: {
          mode: 'raw',
          raw: JSON.stringify({ data: sampleCreate, disable_faas: true }, null, 2),
          options: { raw: { language: 'json' } },
        },
      },
    },
    {
      name: `Update ${slug}`,
      request: {
        method: 'PUT',
        header: authHeaders,
        url: {
          raw: `${baseUrl}/v2/items/${slug}?from-ofs=true`,
          query: [{ key: 'from-ofs', value: 'true', disabled: false }],
        },
        body: {
          mode: 'raw',
          raw: JSON.stringify({ data: sampleUpdate, disable_faas: true }, null, 2),
          options: { raw: { language: 'json' } },
        },
      },
    },
    {
      name: `Update Multiple ${slug}`,
      request: {
        method: 'PATCH',
        header: authHeaders,
        url: {
          raw: `${baseUrl}/v2/items/${slug}?from-ofs=true`,
          query: [{ key: 'from-ofs', value: 'true', disabled: false }],
        },
        body: {
          mode: 'raw',
          raw: JSON.stringify({
            data: {
              objects: [
                { guid: '{{guid_1}}', ...Object.fromEntries(Object.entries(sampleCreate).slice(0, 2)) },
                { guid: '{{guid_2}}', ...Object.fromEntries(Object.entries(sampleCreate).slice(0, 2)) },
              ],
            },
            disable_faas: true,
          }, null, 2),
          options: { raw: { language: 'json' } },
        },
      },
    },
    {
      name: `Delete ${slug}`,
      request: {
        method: 'DELETE',
        header: authHeaders,
        url: {
          raw: `${baseUrl}/v2/items/${slug}/{{guid}}?from-ofs=true`,
          query: [{ key: 'from-ofs', value: 'true', disabled: false }],
        },
      },
    },
    {
      name: `Delete Multiple ${slug}`,
      request: {
        method: 'DELETE',
        header: authHeaders,
        url: {
          raw: `${baseUrl}/v2/items/${slug}?from-ofs=true`,
          query: [{ key: 'from-ofs', value: 'true', disabled: false }],
        },
        body: {
          mode: 'raw',
          raw: JSON.stringify({ ids: ['{{guid_1}}', '{{guid_2}}'] }, null, 2),
          options: { raw: { language: 'json' } },
        },
      },
    },
    {
      name: `Aggregate ${slug}`,
      request: {
        method: 'POST',
        header: authHeaders,
        url: {
          raw: `${baseUrl}/v2/items/${slug}/aggregation`,
        },
        body: {
          mode: 'raw',
          raw: JSON.stringify({
            data: {
              pipeline: [
                { $group: { _id: null, count: { $sum: 1 } } },
              ],
            },
          }, null, 2),
          options: { raw: { language: 'json' } },
        },
      },
    },
  ];
}
