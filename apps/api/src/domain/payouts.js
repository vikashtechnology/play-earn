export function createPayoutRequest(input = {}) {
  const userId = String(input.userId ?? 'unknown-user');
  const amount = Number(input.amount ?? 0);
  const provider = String(input.provider ?? 'razorpayx').trim().toLowerCase();
  const payoutType = String(input.payoutType ?? 'upi').trim().toLowerCase();
  const status = String(input.status ?? 'pending').trim().toLowerCase();

  return {
    userId,
    amount: Number.isFinite(amount) ? Math.max(0, amount) : 0,
    provider,
    payoutType,
    status: status === 'pending' || status === 'approved' || status === 'reversed' ? status : 'pending',
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
}

export function createUserRedemption(input = {}) {
  const userId = String(input.userId ?? 'unknown-user');
  const type = String(input.type ?? 'gift_card').trim().toLowerCase();
  const coinsRequired = Number(input.coinsRequired ?? 0);
  const cashAddon = Number(input.cashAddon ?? 0);
  const status = String(input.status ?? 'pending').trim().toLowerCase();

  return {
    userId,
    type,
    coinsRequired: Number.isFinite(coinsRequired) ? Math.max(0, coinsRequired) : 0,
    cashAddon: Number.isFinite(cashAddon) ? Math.max(0, cashAddon) : 0,
    status: status === 'pending' || status === 'approved' || status === 'reversed' ? status : 'pending',
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
}

export function resolvePayoutStatus(value) {
  const status = String(value ?? 'pending').trim().toLowerCase();

  if (status === 'pending' || status === 'approved' || status === 'reversed') {
    return status;
  }

  return 'pending';
}

export function isPayoutAllowed(payout) {
  if (!payout) {
    return false;
  }

  return Number(payout.amount ?? 0) > 0 && ['upi', 'bank'].includes(String(payout.payoutType ?? '').trim().toLowerCase());
}
