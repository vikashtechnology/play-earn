function normalizeAmount(value) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    throw new Error('amount must be a positive number');
  }

  return numericValue;
}

function normalizeDirection(direction) {
  const normalized = String(direction ?? '').toLowerCase();

  if (normalized !== 'credit' && normalized !== 'debit') {
    throw new Error('direction must be either credit or debit');
  }

  return normalized;
}

function normalizeTransaction(entry = {}) {
  const direction = normalizeDirection(entry.direction);
  const amount = normalizeAmount(entry.amount);
  const type = String(entry.type ?? 'adjustment');
  const reason = String(entry.reason ?? 'manual_adjustment');
  const sourceType = String(entry.sourceType ?? 'system');
  const sourceId = entry.sourceId ?? null;
  const metadata = entry.metadata ?? {};
  const status = String(entry.status ?? 'pending');

  return {
    id: entry.id ?? `txn-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    type,
    direction,
    amount,
    reason,
    sourceType,
    sourceId,
    status,
    metadata,
    createdAt: entry.createdAt ?? new Date().toISOString(),
  };
}

export function createWalletState({ balance = 0, currencyCode = 'INR', transactions = [] } = {}) {
  const parsedBalance = Number(balance ?? 0);

  if (!Number.isFinite(parsedBalance)) {
    throw new Error('wallet balance must be numeric');
  }

  return {
    balance: parsedBalance,
    currencyCode,
    transactions: transactions.map((entry) => normalizeTransaction(entry)),
  };
}

export function buildWalletSnapshot(entries = []) {
  const transactions = entries.map((entry) => normalizeTransaction(entry));
  const balance = transactions.reduce((total, entry) => {
    if (entry.direction === 'credit') {
      return total + entry.amount;
    }

    return total - entry.amount;
  }, 0);

  return {
    balance,
    currencyCode: 'INR',
    transactions,
  };
}

export function applyWalletTransaction(wallet, entry) {
  const state = createWalletState(wallet);
  const transaction = normalizeTransaction(entry);
  const nextBalance = transaction.direction === 'credit'
    ? state.balance + transaction.amount
    : state.balance - transaction.amount;

  if (transaction.direction === 'debit' && state.balance < transaction.amount) {
    throw new Error('insufficient funds');
  }

  return {
    ...state,
    balance: nextBalance,
    transactions: [...state.transactions, transaction],
  };
}
