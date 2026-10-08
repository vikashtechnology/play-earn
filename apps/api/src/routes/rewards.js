import { createRewardEvent, processRewardEvent, resolveRewardStatus } from '../domain/rewards.js';

const rewardStore = new Map();

const seededRewards = [
  {
    id: 'reward-1',
    userId: 'user-123',
    offerId: 'offer-1',
    rewardCoins: 120,
    status: 'pending',
  },
];

for (const reward of seededRewards) {
  rewardStore.set(`${reward.userId}:${reward.id}`, createRewardEvent(reward));
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

export function listRewardsForUser(userId) {
  return [...rewardStore.values()]
    .filter((reward) => reward.userId === userId)
    .map((reward) => ({ ...reward, status: resolveRewardStatus(reward.status) }));
}

export async function handleRewardsRoute(req, res, userId, pathname) {
  if (req.method === 'GET' && pathname === `/api/v1/rewards/${userId}`) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ rewards: listRewardsForUser(userId) }));
    return;
  }

  if (req.method === 'POST' && pathname === `/api/v1/rewards/${userId}`) {
    try {
      const payload = await readBody(req);
      const reward = processRewardEvent({
        userId,
        offerId: payload.offerId ?? 'unknown-offer',
        rewardCoins: Number(payload.rewardCoins ?? 0),
        status: payload.status ?? 'pending',
      });

      const rewardId = payload.id ?? `reward-${Date.now()}`;
      rewardStore.set(`${userId}:${rewardId}`, { ...reward, id: rewardId });

      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ reward: { ...reward, id: rewardId } }));
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown reward error';
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: message }));
      return;
    }
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: false, error: 'reward route not found' }));
}
