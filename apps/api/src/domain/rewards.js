export function createRewardEvent(input = {}) {
  const userId = String(input.userId ?? 'unknown-user');
  const offerId = String(input.offerId ?? 'unknown-offer');
  const rewardCoins = Number(input.rewardCoins ?? 0);
  const status = String(input.status ?? 'pending').trim().toLowerCase();

  if (!Number.isFinite(rewardCoins) || rewardCoins < 0) {
    throw new Error('reward coins must be a non-negative number');
  }

  return {
    userId,
    offerId,
    rewardCoins,
    status: status || 'pending',
    direction: 'credit',
    balanceDelta: rewardCoins,
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
}

export function createReferralReward(input = {}) {
  const referrerUserId = String(input.referrerUserId ?? 'unknown-referrer');
  const referredUserId = String(input.referredUserId ?? 'unknown-referred');
  const rewardCoins = Number(input.rewardCoins ?? 0);

  return {
    referrerUserId,
    referredUserId,
    rewardCoins,
    status: 'pending',
    direction: 'credit',
    balanceDelta: rewardCoins,
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
}

export function resolveRewardStatus(value) {
  const status = String(value ?? 'pending').trim().toLowerCase();

  if (status === 'approved' || status === 'pending' || status === 'reversed') {
    return status;
  }

  return 'pending';
}

export function processRewardEvent(input = {}) {
  const event = createRewardEvent(input);
  const resolvedStatus = resolveRewardStatus(input.status);

  return {
    ...event,
    status: resolvedStatus,
    balanceDelta: resolvedStatus === 'reversed' ? 0 : event.rewardCoins,
    direction: resolvedStatus === 'reversed' ? 'debit' : 'credit',
  };
}
