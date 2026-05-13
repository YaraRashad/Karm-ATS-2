import jwt from 'jsonwebtoken';

const jwksCache = new Map();

function certToPem(cert) {
  const lines = cert.match(/.{1,64}/g)?.join('\n') || cert;
  return `-----BEGIN CERTIFICATE-----\n${lines}\n-----END CERTIFICATE-----\n`;
}

function allowedDomains() {
  return (process.env.AZURE_AD_ALLOWED_DOMAINS || 'karmsolar.com')
    .split(',')
    .map(d => d.trim().toLowerCase())
    .filter(Boolean);
}

async function getSigningKey(tenantId, kid) {
  const cacheKey = `${tenantId}:${kid}`;
  if (jwksCache.has(cacheKey)) return jwksCache.get(cacheKey);

  const url = `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`;
  const response = await fetch(url);
  if (!response.ok) throw new Error('Could not fetch Microsoft signing keys');

  const { keys } = await response.json();
  const key = keys.find(k => k.kid === kid);
  if (!key?.x5c?.[0]) throw new Error('Microsoft signing key not found');

  const pem = certToPem(key.x5c[0]);
  jwksCache.set(cacheKey, pem);
  return pem;
}

export async function verifyMicrosoftIdToken(idToken) {
  const tenantId = process.env.AZURE_AD_TENANT_ID;
  const clientId = process.env.AZURE_AD_CLIENT_ID;
  if (!tenantId || !clientId) {
    throw new Error('AZURE_AD_TENANT_ID and AZURE_AD_CLIENT_ID must be configured');
  }

  const decoded = jwt.decode(idToken, { complete: true });
  if (!decoded?.header?.kid) throw new Error('Invalid Microsoft token');

  const pem = await getSigningKey(tenantId, decoded.header.kid);
  const payload = jwt.verify(idToken, pem, {
    algorithms: ['RS256'],
    audience: clientId,
    issuer: `https://login.microsoftonline.com/${tenantId}/v2.0`,
  });

  const email = (payload.preferred_username || payload.email || payload.upn || '').toLowerCase();
  const domain = email.split('@')[1];
  if (!email || !allowedDomains().includes(domain)) {
    throw new Error('Microsoft account is not from an allowed company domain');
  }

  const [firstName = '', ...rest] = (payload.name || '').split(' ');
  return {
    email,
    firstName: payload.given_name || firstName || email.split('@')[0],
    lastName: payload.family_name || rest.join(' ') || 'User',
    name: payload.name || email,
    oid: payload.oid,
    tenantId: payload.tid,
  };
}
