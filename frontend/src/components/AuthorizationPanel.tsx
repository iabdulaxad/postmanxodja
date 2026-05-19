import { Authorization, AuthType, Environment } from '../types';
import VariableInput from './VariableInput';

interface Props {
  auth: Authorization | undefined;
  onAuthChange: (auth: Authorization | undefined) => void;
  environments: Environment[];
  selectedEnvId?: number;
  hideInherit?: boolean;
  collectionAuth?: Authorization;
}

const AUTH_TYPES: { value: AuthType; label: string }[] = [
  { value: 'inherit', label: 'Inherit auth from parent' },
  { value: 'noauth', label: 'No Auth' },
  { value: 'basic', label: 'Basic Auth' },
  { value: 'bearer', label: 'Bearer Token' },
  { value: 'jwt', label: 'JWT' },
  { value: 'digest', label: 'Digest Auth' },
  { value: 'oauth1', label: 'OAuth 1.0' },
  { value: 'oauth2', label: 'OAuth 2.0' },
  { value: 'hawk', label: 'Hawk Authentication' },
  { value: 'awssig', label: 'AWS Signature' },
  { value: 'ntlm', label: 'NTLM Authentication' },
  { value: 'apikey', label: 'API Key' },
  { value: 'akamai', label: 'Akamai EdgeGrid' },
  { value: 'asap', label: 'ASAP (Atlassian)' },
];

export default function AuthorizationPanel({
  auth,
  onAuthChange,
  environments,
  selectedEnvId,
  hideInherit = false,
  collectionAuth,
}: Props) {
  const authType = auth?.type || 'noauth';

  const handleAuthTypeChange = (type: AuthType) => {
    if (type === 'noauth' || type === 'inherit') {
      onAuthChange(undefined);
    } else {
      onAuthChange({ type });
    }
  };

  const updateAuth = (updates: Partial<Authorization>) => {
    if (!auth) {
      onAuthChange({ type: authType, ...updates });
    } else {
      onAuthChange({ ...auth, ...updates });
    }
  };

  return (
    <div className="space-y-4">
      {/* Auth Type Selection */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">
          Authorization Type
        </label>
        <select
          value={authType}
          onChange={(e) => handleAuthTypeChange(e.target.value as AuthType)}
          className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-ring focus:border-ring outline-none bg-card text-foreground"
        >
          {AUTH_TYPES.filter(t => !(hideInherit && t.value === 'inherit')).map((type) => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </select>
      </div>

      {/* No Auth */}
      {authType === 'noauth' && (
        <div className="p-3 bg-muted rounded-lg">
          <p className="text-sm text-muted-foreground italic">
            This request does not have any authorization
          </p>
        </div>
      )}

      {/* Inherit */}
      {authType === 'inherit' && (
        <div className="p-3 bg-muted rounded-lg space-y-1">
          <p className="text-sm text-muted-foreground italic">
            This request inherits authorization from the collection.
          </p>
          {collectionAuth && collectionAuth.type !== 'noauth' ? (
            <p className="text-xs text-primary font-medium">
              Collection auth: {collectionAuth.type.charAt(0).toUpperCase() + collectionAuth.type.slice(1)}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              No collection auth configured — open collection settings to set one.
            </p>
          )}
        </div>
      )}

      {/* Basic Auth */}
      {authType === 'basic' && (
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Username
            </label>
            <input
              type="text"
              value={auth?.basic?.username || ''}
              onChange={(e) =>
                updateAuth({ basic: { ...auth?.basic, username: e.target.value, password: auth?.basic?.password || '' } })
              }
              placeholder="Enter username"
              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-ring focus:border-ring outline-none bg-card text-foreground"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Password
            </label>
            <input
              type="password"
              value={auth?.basic?.password || ''}
              onChange={(e) =>
                updateAuth({ basic: { ...auth?.basic, username: auth?.basic?.username || '', password: e.target.value } })
              }
              placeholder="Enter password"
              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-ring focus:border-ring outline-none bg-card text-foreground"
            />
          </div>
        </div>
      )}

      {/* Bearer Token */}
      {authType === 'bearer' && (
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">
            Token
          </label>
          <VariableInput
            value={auth?.bearer?.token || ''}
            onChange={(value) =>
              updateAuth({ bearer: { token: value } })
            }
            placeholder="Enter bearer token"
            environments={environments}
            selectedEnvId={selectedEnvId}
          />
        </div>
      )}

      {/* JWT */}
      {authType === 'jwt' && (
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Token
            </label>
            <VariableInput
              value={auth?.jwt?.token || ''}
              onChange={(value) =>
                updateAuth({ jwt: { ...auth?.jwt, token: value } })
              }
              placeholder="Enter JWT token"
              environments={environments}
              selectedEnvId={selectedEnvId}
              multiline
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Payload (Optional)
            </label>
            <VariableInput
              value={auth?.jwt?.payload || ''}
              onChange={(value) =>
                updateAuth({ jwt: { ...auth?.jwt, payload: value } })
              }
              placeholder="Enter JWT payload"
              environments={environments}
              selectedEnvId={selectedEnvId}
              multiline
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Secret (Optional)
            </label>
            <input
              type="password"
              value={auth?.jwt?.secret || ''}
              onChange={(e) =>
                updateAuth({ jwt: { ...auth?.jwt, secret: e.target.value } })
              }
              placeholder="Enter JWT secret"
              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-ring focus:border-ring outline-none bg-card text-foreground"
            />
          </div>
        </div>
      )}

      {/* Digest Auth */}
      {authType === 'digest' && (
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Username
            </label>
            <input
              type="text"
              value={auth?.digest?.username || ''}
              onChange={(e) =>
                updateAuth({ digest: { ...auth?.digest, username: e.target.value } })
              }
              placeholder="Enter username"
              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-ring focus:border-ring outline-none bg-card text-foreground"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Password
            </label>
            <input
              type="password"
              value={auth?.digest?.password || ''}
              onChange={(e) =>
                updateAuth({ digest: { ...auth?.digest, password: e.target.value } })
              }
              placeholder="Enter password"
              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-ring focus:border-ring outline-none bg-card text-foreground"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Realm (Optional)
            </label>
            <input
              type="text"
              value={auth?.digest?.realm || ''}
              onChange={(e) =>
                updateAuth({ digest: { ...auth?.digest, realm: e.target.value } })
              }
              placeholder="Enter realm"
              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-ring focus:border-ring outline-none bg-card text-foreground"
            />
          </div>
        </div>
      )}

      {/* OAuth 1.0 */}
      {authType === 'oauth1' && (
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Consumer Key
            </label>
            <VariableInput
              value={auth?.oauth1?.consumerKey || ''}
              onChange={(value) =>
                updateAuth({ oauth1: { ...auth?.oauth1, consumerKey: value } })
              }
              placeholder="Enter consumer key"
              environments={environments}
              selectedEnvId={selectedEnvId}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Consumer Secret
            </label>
            <input
              type="password"
              value={auth?.oauth1?.consumerSecret || ''}
              onChange={(e) =>
                updateAuth({ oauth1: { ...auth?.oauth1, consumerSecret: e.target.value } })
              }
              placeholder="Enter consumer secret"
              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-ring focus:border-ring outline-none bg-card text-foreground"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Access Token
            </label>
            <VariableInput
              value={auth?.oauth1?.accessToken || ''}
              onChange={(value) =>
                updateAuth({ oauth1: { ...auth?.oauth1, accessToken: value } })
              }
              placeholder="Enter access token"
              environments={environments}
              selectedEnvId={selectedEnvId}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Access Token Secret
            </label>
            <input
              type="password"
              value={auth?.oauth1?.accessTokenSecret || ''}
              onChange={(e) =>
                updateAuth({ oauth1: { ...auth?.oauth1, accessTokenSecret: e.target.value } })
              }
              placeholder="Enter access token secret"
              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-ring focus:border-ring outline-none bg-card text-foreground"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Signature Method
            </label>
            <select
              value={auth?.oauth1?.signatureMethod || 'HMAC-SHA1'}
              onChange={(e) =>
                updateAuth({ oauth1: { ...auth?.oauth1, signatureMethod: e.target.value } })
              }
              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-ring focus:border-ring outline-none bg-card text-foreground"
            >
              <option>HMAC-SHA1</option>
              <option>HMAC-SHA256</option>
              <option>PLAINTEXT</option>
            </select>
          </div>
        </div>
      )}

      {/* OAuth 2.0 */}
      {authType === 'oauth2' && (
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Access Token
            </label>
            <VariableInput
              value={auth?.oauth2?.accessToken || ''}
              onChange={(value) =>
                updateAuth({ oauth2: { ...auth?.oauth2, accessToken: value } })
              }
              placeholder="Enter access token"
              environments={environments}
              selectedEnvId={selectedEnvId}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Token Type
            </label>
            <select
              value={auth?.oauth2?.tokenType || 'Bearer'}
              onChange={(e) =>
                updateAuth({ oauth2: { ...auth?.oauth2, tokenType: e.target.value } })
              }
              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-ring focus:border-ring outline-none bg-card text-foreground"
            >
              <option>Bearer</option>
              <option>MAC</option>
              <option>DPoP</option>
            </select>
          </div>
        </div>
      )}

      {/* Hawk */}
      {authType === 'hawk' && (
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Auth ID
            </label>
            <VariableInput
              value={auth?.hawk?.authId || ''}
              onChange={(value) =>
                updateAuth({ hawk: { ...auth?.hawk, authId: value } })
              }
              placeholder="Enter auth ID"
              environments={environments}
              selectedEnvId={selectedEnvId}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Auth Key
            </label>
            <input
              type="password"
              value={auth?.hawk?.authKey || ''}
              onChange={(e) =>
                updateAuth({ hawk: { ...auth?.hawk, authKey: e.target.value } })
              }
              placeholder="Enter auth key"
              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-ring focus:border-ring outline-none bg-card text-foreground"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Algorithm
            </label>
            <select
              value={auth?.hawk?.algorithm || 'sha256'}
              onChange={(e) =>
                updateAuth({ hawk: { ...auth?.hawk, algorithm: e.target.value } })
              }
              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-ring focus:border-ring outline-none bg-card text-foreground"
            >
              <option value="sha256">SHA256</option>
              <option value="sha1">SHA1</option>
            </select>
          </div>
        </div>
      )}

      {/* AWS Signature */}
      {authType === 'awssig' && (
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Access Key
            </label>
            <VariableInput
              value={auth?.awssig?.accessKey || ''}
              onChange={(value) =>
                updateAuth({ awssig: { ...auth?.awssig, accessKey: value } })
              }
              placeholder="Enter access key"
              environments={environments}
              selectedEnvId={selectedEnvId}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Secret Key
            </label>
            <input
              type="password"
              value={auth?.awssig?.secretKey || ''}
              onChange={(e) =>
                updateAuth({ awssig: { ...auth?.awssig, secretKey: e.target.value } })
              }
              placeholder="Enter secret key"
              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-ring focus:border-ring outline-none bg-card text-foreground"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Region
            </label>
            <input
              type="text"
              value={auth?.awssig?.region || ''}
              onChange={(e) =>
                updateAuth({ awssig: { ...auth?.awssig, region: e.target.value } })
              }
              placeholder="e.g., us-east-1"
              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-ring focus:border-ring outline-none bg-card text-foreground"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Service
            </label>
            <input
              type="text"
              value={auth?.awssig?.service || ''}
              onChange={(e) =>
                updateAuth({ awssig: { ...auth?.awssig, service: e.target.value } })
              }
              placeholder="e.g., ec2, s3"
              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-ring focus:border-ring outline-none bg-card text-foreground"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Session Token (Optional)
            </label>
            <input
              type="password"
              value={auth?.awssig?.sessionToken || ''}
              onChange={(e) =>
                updateAuth({ awssig: { ...auth?.awssig, sessionToken: e.target.value } })
              }
              placeholder="Enter session token"
              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-ring focus:border-ring outline-none bg-card text-foreground"
            />
          </div>
        </div>
      )}

      {/* NTLM */}
      {authType === 'ntlm' && (
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Username
            </label>
            <input
              type="text"
              value={auth?.ntlm?.username || ''}
              onChange={(e) =>
                updateAuth({ ntlm: { ...auth?.ntlm, username: e.target.value } })
              }
              placeholder="Enter username"
              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-ring focus:border-ring outline-none bg-card text-foreground"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Password
            </label>
            <input
              type="password"
              value={auth?.ntlm?.password || ''}
              onChange={(e) =>
                updateAuth({ ntlm: { ...auth?.ntlm, password: e.target.value } })
              }
              placeholder="Enter password"
              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-ring focus:border-ring outline-none bg-card text-foreground"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Domain (Optional)
            </label>
            <input
              type="text"
              value={auth?.ntlm?.domain || ''}
              onChange={(e) =>
                updateAuth({ ntlm: { ...auth?.ntlm, domain: e.target.value } })
              }
              placeholder="Enter domain"
              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-ring focus:border-ring outline-none bg-card text-foreground"
            />
          </div>
        </div>
      )}

      {/* API Key */}
      {authType === 'apikey' && (
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Key Name
            </label>
            <input
              type="text"
              value={auth?.apikey?.key || ''}
              onChange={(e) =>
                updateAuth({ apikey: { ...auth?.apikey, key: e.target.value } })
              }
              placeholder="e.g., api_key, X-API-Key"
              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-ring focus:border-ring outline-none bg-card text-foreground"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Value
            </label>
            <VariableInput
              value={auth?.apikey?.value || ''}
              onChange={(value) =>
                updateAuth({ apikey: { ...auth?.apikey, value } })
              }
              placeholder="Enter API key value"
              environments={environments}
              selectedEnvId={selectedEnvId}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Add to
            </label>
            <select
              value={auth?.apikey?.addTo || 'header'}
              onChange={(e) =>
                updateAuth({ apikey: { ...auth?.apikey, addTo: e.target.value as 'header' | 'query' } })
              }
              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-ring focus:border-ring outline-none bg-card text-foreground"
            >
              <option value="header">Header</option>
              <option value="query">Query Param</option>
            </select>
          </div>
        </div>
      )}

      {/* Akamai EdgeGrid */}
      {authType === 'akamai' && (
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Client Token
            </label>
            <VariableInput
              value={auth?.akamai?.clientToken || ''}
              onChange={(value) =>
                updateAuth({ akamai: { ...auth?.akamai, clientToken: value } })
              }
              placeholder="Enter client token"
              environments={environments}
              selectedEnvId={selectedEnvId}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Client Secret
            </label>
            <input
              type="password"
              value={auth?.akamai?.clientSecret || ''}
              onChange={(e) =>
                updateAuth({ akamai: { ...auth?.akamai, clientSecret: e.target.value } })
              }
              placeholder="Enter client secret"
              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-ring focus:border-ring outline-none bg-card text-foreground"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Access Token
            </label>
            <VariableInput
              value={auth?.akamai?.accessToken || ''}
              onChange={(value) =>
                updateAuth({ akamai: { ...auth?.akamai, accessToken: value } })
              }
              placeholder="Enter access token"
              environments={environments}
              selectedEnvId={selectedEnvId}
            />
          </div>
        </div>
      )}

      {/* ASAP */}
      {authType === 'asap' && (
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Issuer
            </label>
            <input
              type="text"
              value={auth?.asap?.issuer || ''}
              onChange={(e) =>
                updateAuth({ asap: { ...auth?.asap, issuer: e.target.value } })
              }
              placeholder="Enter issuer"
              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-ring focus:border-ring outline-none bg-card text-foreground"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Subject
            </label>
            <input
              type="text"
              value={auth?.asap?.subject || ''}
              onChange={(e) =>
                updateAuth({ asap: { ...auth?.asap, subject: e.target.value } })
              }
              placeholder="Enter subject"
              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-ring focus:border-ring outline-none bg-card text-foreground"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Key ID
            </label>
            <input
              type="text"
              value={auth?.asap?.keyId || ''}
              onChange={(e) =>
                updateAuth({ asap: { ...auth?.asap, keyId: e.target.value } })
              }
              placeholder="Enter key ID"
              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-ring focus:border-ring outline-none bg-card text-foreground"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Private Key
            </label>
            <VariableInput
              value={auth?.asap?.privateKey || ''}
              onChange={(value) =>
                updateAuth({ asap: { ...auth?.asap, privateKey: value } })
              }
              placeholder="Enter private key"
              environments={environments}
              selectedEnvId={selectedEnvId}
              multiline
            />
          </div>
        </div>
      )}
    </div>
  );
}


