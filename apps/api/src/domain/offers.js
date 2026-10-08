export function normalizeOffer(input = {}) {
  const provider = String(input.provider ?? 'generic').trim().toLowerCase();
  const title = String(input.title ?? 'Untitled offer').trim();
  const description = String(input.description ?? '').trim();
  const kind = String(input.kind ?? 'offer').trim().toLowerCase();
  const payoutCoins = Number(input.payoutCoins ?? 0);
  const countryCode = String(input.countryCode ?? 'IN').trim().toUpperCase();
  const status = String(input.status ?? 'draft').trim().toLowerCase();

  return {
    provider,
    title,
    description,
    kind,
    payoutCoins: Number.isFinite(payoutCoins) ? payoutCoins : 0,
    countryCode,
    status,
    landingUrl: input.landingUrl ?? null,
    verificationMode: input.verificationMode ?? 'server',
  };
}

export function createOffer(input = {}) {
  const offer = normalizeOffer(input);

  if (!offer.title) {
    throw new Error('offer title is required');
  }

  if (offer.payoutCoins < 0) {
    throw new Error('offer payout coins cannot be negative');
  }

  return offer;
}

export function calculateOfferReward(offer) {
  const normalized = normalizeOffer(offer);
  return normalized.payoutCoins;
}

export function isOfferEligible(offer) {
  const normalized = normalizeOffer(offer);

  return normalized.status === 'active' && normalized.payoutCoins > 0;
}
