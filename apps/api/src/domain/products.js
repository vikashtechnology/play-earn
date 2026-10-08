export function createProduct(input = {}) {
  const sku = String(input.sku ?? 'unknown-sku').trim();
  const title = String(input.title ?? 'Untitled product').trim();
  const description = String(input.description ?? '').trim();
  const priceCoins = Number(input.priceCoins ?? 0);
  const cashAddon = Number(input.cashAddon ?? 0);
  const status = String(input.status ?? 'draft').trim().toLowerCase();

  if (!sku) {
    throw new Error('product sku is required');
  }

  if (!title) {
    throw new Error('product title is required');
  }

  return {
    sku,
    title,
    description,
    priceCoins: Number.isFinite(priceCoins) ? Math.max(0, priceCoins) : 0,
    cashAddon: Number.isFinite(cashAddon) ? Math.max(0, cashAddon) : 0,
    status: status === 'active' || status === 'draft' ? status : 'draft',
  };
}

export function createOrder(input = {}) {
  const userId = String(input.userId ?? 'unknown-user');
  const productId = String(input.productId ?? 'unknown-product');
  const quantity = Number(input.quantity ?? 1);
  const coinsSpent = Number(input.coinsSpent ?? 0);
  const cashSpent = Number(input.cashSpent ?? 0);
  const totalAmount = Number(input.totalAmount ?? coinsSpent + cashSpent);

  return {
    userId,
    productId,
    quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
    coinsSpent: Number.isFinite(coinsSpent) ? Math.max(0, coinsSpent) : 0,
    cashSpent: Number.isFinite(cashSpent) ? Math.max(0, cashSpent) : 0,
    totalAmount: Number.isFinite(totalAmount) ? Math.max(0, totalAmount) : 0,
    status: 'pending',
    fulfillmentDetails: input.fulfillmentDetails ?? {},
  };
}

export function isProductOrderAllowed(product, quantity = 1) {
  const normalized = createProduct(product);
  const requestedQuantity = Number(quantity ?? 1);

  return normalized.status === 'active' && normalized.priceCoins > 0 && requestedQuantity > 0;
}
