import { applyWalletTransaction, createWalletState } from '../domain/wallet.js';

const walletStore = new Map();

export function getWalletForUser(userId) {
  const existing = walletStore.get(userId);

  if (existing) {
    return existing;
  }

  const wallet = createWalletState({ balance: 0, currencyCode: 'INR', transactions: [] });
  walletStore.set(userId, wallet);
  return wallet;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    req.on('data', (chunk) => {
      chunks.push(chunk);
    });

    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');

      if (!raw) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(new Error('invalid JSON body'));
      }
    });

    req.on('error', reject);
  });
}

export async function handleWalletRoute(req, res, userId, pathname) {
  const wallet = getWalletForUser(userId);

  if (req.method === 'GET' && pathname === `/api/v1/wallet/${userId}`) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      userId,
      balance: wallet.balance,
      currencyCode: wallet.currencyCode,
      transactions: wallet.transactions,
    }));
    return;
  }

  if (req.method === 'POST' && pathname === `/api/v1/wallet/${userId}/transactions`) {
    try {
      const payload = await readBody(req);
      const nextWallet = applyWalletTransaction(wallet, {
        ...payload,
        metadata: payload.metadata ?? {},
      });

      walletStore.set(userId, nextWallet);

      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        userId,
        balance: nextWallet.balance,
        currencyCode: nextWallet.currencyCode,
        transactions: nextWallet.transactions,
      }));
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown wallet error';
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: message }));
      return;
    }
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: false, error: 'wallet route not found' }));
}
