import { createHmac, timingSafeEqual } from 'node:crypto';

function encode(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function sign(unsignedToken, secret) {
  return createHmac('sha256', secret).update(unsignedToken).digest();
}

export function issueAccessToken({ subject, scope, secret, now = Date.now, claims = {} }) {
  const issuedAt = Math.floor(now() / 1000);
  const header = encode({ alg: 'HS256', typ: 'JWT' });
  const payload = encode({
    sub: subject,
    scope,
    aud: 'play-earn-api',
    iat: issuedAt,
    exp: issuedAt + 900,
    ...claims,
  });
  const unsignedToken = `${header}.${payload}`;

  return `${unsignedToken}.${sign(unsignedToken, secret).toString('base64url')}`;
}

export function verifyAccessToken(token, secret, { scope, now = Date.now } = {}) {
  if (typeof token !== 'string' || token.length > 8192) {
    return null;
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }

  try {
    const [encodedHeader, encodedPayload, encodedSignature] = parts;
    const header = JSON.parse(Buffer.from(encodedHeader, 'base64url').toString('utf8'));
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    if (header.alg !== 'HS256' || header.typ !== 'JWT') {
      return null;
    }

    const expected = sign(`${encodedHeader}.${encodedPayload}`, secret);
    const actual = Buffer.from(encodedSignature, 'base64url');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      return null;
    }

    const nowSeconds = Math.floor(now() / 1000);
    if (payload.aud !== 'play-earn-api' || !Number.isInteger(payload.exp) || payload.exp <= nowSeconds) {
      return null;
    }
    if (scope && payload.scope !== scope) {
      return null;
    }
    if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}
