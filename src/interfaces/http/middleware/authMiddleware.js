import crypto from 'node:crypto';

function b64urlDecode(value) {
  return Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

function safeEqual(a, b) {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

export function verifyJwtHs256(token, secret) {
  const [header, payload, signature] = token.split('.');
  if (!header || !payload || !signature) throw new Error('Malformed JWT');

  const content = `${header}.${payload}`;
  const expected = crypto.createHmac('sha256', secret)
    .update(content)
    .digest('base64url');

  if (!safeEqual(expected, signature)) throw new Error('Invalid JWT signature');

  const decodedPayload = JSON.parse(b64urlDecode(payload));
  if (decodedPayload.exp && Date.now() / 1000 > decodedPayload.exp) {
    throw new Error('JWT expired');
  }

  return decodedPayload;
}

export function authMiddleware({ jwtSecret, logger }) {
  return function enforceAuth(req, res) {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'Unauthorized' }));
      return false;
    }

    try {
      req.user = verifyJwtHs256(token, jwtSecret);
      return true;
    } catch (error) {
      logger.error({ error: error.message }, 'Auth failed');
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'Unauthorized' }));
      return false;
    }
  };
}
