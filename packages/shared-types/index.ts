export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = Record<string, JsonValue>;

export type WalletDirection = 'credit' | 'debit';
export type WalletTransactionStatus = 'pending' | 'approved' | 'rejected' | 'reversed';
export type OfferStatus = 'draft' | 'active' | 'paused' | 'inactive';
export type RewardStatus = 'pending' | 'approved' | 'reversed';
export type PayoutStatus = 'pending' | 'approved' | 'reversed';
export type PayoutType = 'upi' | 'bank';
export type ProductStatus = 'draft' | 'active';
export type OrderStatus = 'pending' | 'paid' | 'fulfillment_pending' | 'fulfilled' | 'cancelled' | 'reversed';

export interface WalletTransaction {
  id: string;
  type: string;
  direction: WalletDirection;
  amount: number;
  reason: string;
  sourceType: string;
  sourceId: string | null;
  status: WalletTransactionStatus;
  metadata: JsonObject;
  createdAt: string;
}

export interface WalletSnapshot {
  userId: string;
  balance: number;
  currencyCode: string;
  transactions: WalletTransaction[];
}

export interface Offer {
  id: string;
  provider: string;
  title: string;
  description: string;
  kind: string;
  payoutCoins: number;
  rewardCoins: number;
  countryCode: string;
  status: OfferStatus;
  landingUrl: string | null;
  verificationMode: string;
}

export interface RewardEvent {
  id: string;
  userId: string;
  offerId: string;
  rewardCoins: number;
  status: RewardStatus;
  direction: WalletDirection;
  balanceDelta: number;
  createdAt: string;
}

export interface PayoutRequest {
  id: string;
  userId: string;
  amount: number;
  provider: string;
  payoutType: PayoutType;
  status: PayoutStatus;
  createdAt: string;
}

export interface Product {
  sku: string;
  title: string;
  description: string;
  priceCoins: number;
  cashAddon: number;
  status: ProductStatus;
}

export interface ProductOrderRequest {
  productSku: string;
  quantity: number;
}

export interface Order {
  id: string;
  userId: string;
  productId: string;
  quantity: number;
  coinsSpent: number;
  cashSpent: number;
  totalAmount: number;
  status: OrderStatus;
  fulfillmentDetails: JsonObject;
}

export interface ApiError {
  error: string;
}