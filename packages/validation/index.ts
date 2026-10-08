import { z } from 'zod';

const nonNegativeInteger = z.number().int().safe().nonnegative();
const positiveInteger = z.number().int().safe().positive();

export const walletTransactionInputSchema = z.object({
  type: z.string().trim().min(1).default('adjustment'),
  direction: z.enum(['credit', 'debit']),
  amount: positiveInteger,
  reason: z.string().trim().min(1).default('manual_adjustment'),
  sourceType: z.string().trim().min(1).default('system'),
  sourceId: z.string().trim().min(1).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
}).strict();

export const offerCreateSchema = z.object({
  provider: z.string().trim().min(1).default('generic'),
  title: z.string().trim().min(1).max(255),
  description: z.string().trim().max(5000).default(''),
  kind: z.string().trim().min(1).default('offer'),
  payoutCoins: nonNegativeInteger.default(0),
  countryCode: z.string().trim().length(2).default('IN'),
  status: z.enum(['draft', 'active', 'paused', 'inactive']).default('draft'),
  landingUrl: z.string().url().nullable().optional(),
  verificationMode: z.string().trim().min(1).default('server'),
}).strict();

export const rewardEventInputSchema = z.object({
  offerId: z.string().trim().min(1),
  rewardCoins: nonNegativeInteger,
  status: z.enum(['pending', 'approved', 'reversed']).default('pending'),
}).strict();

export const payoutRequestInputSchema = z.object({
  amount: positiveInteger,
  provider: z.string().trim().min(1).default('razorpayx'),
  payoutType: z.enum(['upi', 'bank']),
}).strict();

export const productCreateSchema = z.object({
  sku: z.string().trim().min(1).max(128),
  title: z.string().trim().min(1).max(255),
  description: z.string().trim().max(5000).default(''),
  priceCoins: nonNegativeInteger.default(0),
  cashAddon: nonNegativeInteger.default(0),
  status: z.enum(['draft', 'active']).default('draft'),
}).strict();

export const productOrderRequestSchema = z.object({
  productSku: z.string().trim().min(1).max(128),
  quantity: z.number().int().positive().max(99).default(1),
}).strict();

export type WalletTransactionInput = z.infer<typeof walletTransactionInputSchema>;
export type OfferCreateInput = z.infer<typeof offerCreateSchema>;
export type RewardEventInput = z.infer<typeof rewardEventInputSchema>;
export type PayoutRequestInput = z.infer<typeof payoutRequestInputSchema>;
export type ProductCreateInput = z.infer<typeof productCreateSchema>;
export type ProductOrderRequest = z.infer<typeof productOrderRequestSchema>;