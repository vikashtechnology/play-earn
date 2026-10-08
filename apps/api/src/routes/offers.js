import { calculateOfferReward, createOffer, isOfferEligible } from '../domain/offers.js';
import { parseOfferCreateInput } from '@rewards-platform/validation';

const offerStore = new Map();

const seededOffers = [
  {
    id: 'offer-1',
    provider: 'tapjoy',
    title: 'Quick Survey',
    description: 'Take a 5 minute survey',
    kind: 'survey',
    payoutCoins: 120,
    countryCode: 'IN',
    status: 'active',
  },
  {
    id: 'offer-2',
    provider: 'offerwall',
    title: 'Play Store App Install',
    description: 'Install an approved app from Play Store',
    kind: 'install',
    payoutCoins: 200,
    countryCode: 'IN',
    status: 'active',
    landingUrl: 'https://play.google.com/store/apps/details?id=com.example.partner',
  },
];

for (const offer of seededOffers) {
  offerStore.set(offer.id, createOffer(offer));
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

export function listOffers() {
  return [...offerStore.values()]
    .filter((offer) => isOfferEligible(offer))
    .map((offer) => ({
      ...offer,
      rewardCoins: calculateOfferReward(offer),
    }));
}

export async function handleOffersRoute(req, res, pathname) {
  if (req.method === 'GET' && pathname === '/api/v1/offers') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ offers: listOffers() }));
    return;
  }

  if (req.method === 'POST' && pathname === '/api/v1/offers') {
    try {
      const payload = parseOfferCreateInput(await readBody(req));
      const offer = createOffer(payload);

      const offerId = `offer-${Date.now()}`;
      offerStore.set(offerId, { ...offer, id: offerId });

      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        offer: {
          ...offer,
          id: offerId,
          rewardCoins: calculateOfferReward(offer),
        },
      }));
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown offer error';
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: message }));
      return;
    }
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: false, error: 'offer route not found' }));
}
