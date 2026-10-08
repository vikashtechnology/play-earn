import { createOrder, createProduct, isProductOrderAllowed } from '../domain/products.js';
import { parseProductCreateInput, parseProductOrderRequest } from '@rewards-platform/validation';

const productStore = new Map();
const orderStore = new Map();

const seededProducts = [
  {
    sku: 'sku-1',
    title: 'Bluetooth Speaker',
    description: 'Portable speaker',
    priceCoins: 1500,
    cashAddon: 200,
    status: 'active',
  },
  {
    sku: 'sku-2',
    title: 'Travel Adapter',
    description: 'India plug adapter',
    priceCoins: 900,
    cashAddon: 120,
    status: 'active',
  },
];

for (const product of seededProducts) {
  productStore.set(product.sku, createProduct(product));
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

export function listProducts() {
  return [...productStore.values()];
}

export async function handleProductsRoute(req, res, pathname) {
  if (req.method === 'GET' && pathname === '/api/v1/products') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ products: listProducts() }));
    return;
  }

  if (req.method === 'POST' && pathname === '/api/v1/products') {
    try {
      const payload = parseProductCreateInput(await readBody(req));
      const product = createProduct(payload);
      productStore.set(product.sku, product);

      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ product }));
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown product error';
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: message }));
      return;
    }
  }

  if (req.method === 'POST' && pathname === '/api/v1/orders') {
    try {
      const payload = parseProductOrderRequest(await readBody(req));
      const product = productStore.get(payload.productSku);

      if (!product || !isProductOrderAllowed(product, payload.quantity)) {
        throw new Error('product order is not allowed');
      }

      const order = createOrder({
        userId: 'unknown-user',
        productId: product.sku,
        quantity: payload.quantity,
        coinsSpent: product.priceCoins * payload.quantity,
        cashSpent: product.cashAddon * payload.quantity,
      });

      const orderId = `order-${Date.now()}`;
      orderStore.set(orderId, order);

      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ order: { ...order, id: orderId } }));
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown order error';
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: message }));
      return;
    }
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: false, error: 'product route not found' }));
}
