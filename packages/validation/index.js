function requireObject(input, allowedFields) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('request body must be an object');
  }

  for (const field of Object.keys(input)) {
    if (!allowedFields.includes(field)) {
      throw new TypeError(`unknown field: ${field}`);
    }
  }

  return input;
}

function readString(input, field, fallback, { required = false, maxLength = Infinity } = {}) {
  const value = input[field] ?? fallback;

  if (typeof value !== 'string') {
    throw new TypeError(`${field} must be a string`);
  }

  const normalized = value.trim();

  if ((required && normalized.length === 0) || normalized.length > maxLength) {
    throw new RangeError(`${field} is missing or too long`);
  }

  return normalized;
}

function readInteger(input, field, fallback, { positive = false, maximum = Number.MAX_SAFE_INTEGER } = {}) {
  const value = input[field] ?? fallback;

  if (!Number.isSafeInteger(value) || value < (positive ? 1 : 0) || value > maximum) {
    throw new RangeError(`${field} must be a ${positive ? 'positive' : 'non-negative'} safe integer`);
  }

  return value;
}

function readEnum(input, field, fallback, values) {
  const value = input[field] ?? fallback;

  if (!values.includes(value)) {
    throw new RangeError(`${field} must be one of: ${values.join(', ')}`);
  }

  return value;
}

export function parseWalletTransactionInput(value) {
  const input = requireObject(value, ['type', 'direction', 'amount', 'reason', 'sourceType', 'sourceId', 'metadata']);
  const sourceId = input.sourceId ?? null;

  if (sourceId !== null && (typeof sourceId !== 'string' || sourceId.trim().length === 0)) {
    throw new TypeError('sourceId must be a non-empty string or null');
  }

  const metadata = input.metadata ?? {};

  if (metadata === null || typeof metadata !== 'object' || Array.isArray(metadata)) {
    throw new TypeError('metadata must be an object');
  }

  return {
    type: readString(input, 'type', 'adjustment', { required: true }),
    direction: readEnum(input, 'direction', undefined, ['credit', 'debit']),
    amount: readInteger(input, 'amount', undefined, { positive: true }),
    reason: readString(input, 'reason', 'manual_adjustment', { required: true }),
    sourceType: readString(input, 'sourceType', 'system', { required: true }),
    sourceId: sourceId?.trim() ?? null,
    metadata,
  };
}

export function parseOfferCreateInput(value) {
  const input = requireObject(value, [
    'provider', 'title', 'description', 'kind', 'payoutCoins', 'countryCode', 'status', 'landingUrl', 'verificationMode',
  ]);
  const landingUrl = input.landingUrl ?? null;

  if (landingUrl !== null) {
    if (typeof landingUrl !== 'string') {
      throw new TypeError('landingUrl must be a URL string or null');
    }

    try {
      new URL(landingUrl);
    } catch {
      throw new TypeError('landingUrl must be a valid absolute URL');
    }
  }

  const countryCode = readString(input, 'countryCode', 'IN', { required: true }).toUpperCase();

  if (!/^[A-Z]{2}$/.test(countryCode)) {
    throw new RangeError('countryCode must be a two-letter country code');
  }

  const kind = readString(input, 'kind', 'offer', { required: true }).toLowerCase();

  if (kind === 'install' && !isPlayStoreInstallUrl(landingUrl)) {
    throw new RangeError('install offers must use a Google Play Store URL');
  }

  return {
    provider: readString(input, 'provider', 'generic', { required: true }),
    title: readString(input, 'title', undefined, { required: true, maxLength: 255 }),
    description: readString(input, 'description', '', { maxLength: 5000 }),
    kind,
    payoutCoins: readInteger(input, 'payoutCoins', 0),
    countryCode,
    status: readEnum(input, 'status', 'draft', ['draft', 'active', 'paused', 'inactive']),
    landingUrl,
    verificationMode: readString(input, 'verificationMode', 'server', { required: true }),
  };
}

function isPlayStoreInstallUrl(value) {
  if (typeof value !== 'string') {
    return false;
  }

  const url = new URL(value);

  return (url.protocol === 'https:'
      && url.hostname === 'play.google.com'
      && url.pathname.startsWith('/store/apps/'))
    || (url.protocol === 'market:'
      && url.hostname === 'details'
      && Boolean(url.searchParams.get('id')));
}

export function parseRewardEventInput(value) {
  const input = requireObject(value, ['offerId', 'rewardCoins']);

  return {
    offerId: readString(input, 'offerId', undefined, { required: true }),
    rewardCoins: readInteger(input, 'rewardCoins', undefined),
  };
}

export function parsePayoutRequestInput(value) {
  const input = requireObject(value, ['amount', 'provider', 'payoutType']);

  return {
    amount: readInteger(input, 'amount', undefined, { positive: true }),
    provider: readString(input, 'provider', 'razorpayx', { required: true }),
    payoutType: readEnum(input, 'payoutType', undefined, ['upi', 'bank']),
  };
}

export function parseProductCreateInput(value) {
  const input = requireObject(value, ['sku', 'title', 'description', 'priceCoins', 'cashAddon', 'status']);

  return {
    sku: readString(input, 'sku', undefined, { required: true, maxLength: 128 }),
    title: readString(input, 'title', undefined, { required: true, maxLength: 255 }),
    description: readString(input, 'description', '', { maxLength: 5000 }),
    priceCoins: readInteger(input, 'priceCoins', 0),
    cashAddon: readInteger(input, 'cashAddon', 0),
    status: readEnum(input, 'status', 'draft', ['draft', 'active']),
  };
}

export function parseProductOrderRequest(value) {
  const input = requireObject(value, ['productSku', 'quantity']);

  return {
    productSku: readString(input, 'productSku', undefined, { required: true, maxLength: 128 }),
    quantity: readInteger(input, 'quantity', 1, { positive: true, maximum: 99 }),
  };
}

export function parseOtpRequest(value) {
  const input = requireObject(value, ['phone']);
  const phone = readString(input, 'phone', undefined, { required: true });
  const digits = phone.replace(/[\s()-]/g, '');
  const nationalNumber = digits.startsWith('+91') ? digits.slice(3) : digits;

  if (!/^[6-9]\d{9}$/.test(nationalNumber)) {
    throw new RangeError('phone must be a valid Indian mobile number');
  }

  return { phone: `+91${nationalNumber}` };
}

export function parseOtpVerificationRequest(value) {
  const input = requireObject(value, ['phone', 'code']);
  const { phone } = parseOtpRequest({ phone: input.phone });
  const code = readString(input, 'code', undefined, { required: true });

  if (!/^\d{6}$/.test(code)) {
    throw new RangeError('code must be a six-digit OTP');
  }

  return { phone, code };
}

// Firebase Auth is the only identity provider. Clients never send credentials,
// provider tokens, or consent text to this API other than a Firebase ID token
// plus the policy versions they actually displayed.
export function parseConsentInput(value, { required = true } = {}) {
  if (value === undefined || value === null) {
    if (required) {
      throw new TypeError('consent is required to create an account');
    }
    return null;
  }

  const input = requireObject(value, [
    'adultConfirmed', 'termsAccepted', 'privacyAccepted', 'termsVersion', 'privacyVersion',
    'analyticsOptIn', 'personalizedOffersOptIn', 'fullName',
  ]);

  if (input.adultConfirmed !== true || input.termsAccepted !== true || input.privacyAccepted !== true) {
    throw new RangeError('adult confirmation, Terms, and Privacy Notice acceptance are required');
  }

  const termsVersion = readString(input, 'termsVersion', undefined, { required: true, maxLength: 64 });
  const privacyVersion = readString(input, 'privacyVersion', undefined, { required: true, maxLength: 64 });

  for (const field of ['analyticsOptIn', 'personalizedOffersOptIn']) {
    if (input[field] !== undefined && typeof input[field] !== 'boolean') {
      throw new TypeError(`${field} must be a boolean`);
    }
  }

  return {
    adultConfirmed: true,
    termsAccepted: true,
    privacyAccepted: true,
    termsVersion,
    privacyVersion,
    analyticsOptIn: input.analyticsOptIn === true,
    personalizedOffersOptIn: input.personalizedOffersOptIn === true,
    fullName: input.fullName === undefined
      ? undefined
      : readString(input, 'fullName', undefined, { required: true, maxLength: 255 }),
  };
}

function readFirebaseIdToken(input) {
  const idToken = readString(input, 'idToken', undefined, { required: true, maxLength: 8192 });

  if (idToken.split('.').length !== 3) {
    throw new RangeError('idToken must be a Firebase ID token');
  }

  return idToken;
}

export function parseFirebaseSessionRequest(value) {
  const input = requireObject(value, ['idToken', 'consent']);

  return {
    idToken: readFirebaseIdToken(input),
    consent: parseConsentInput(input.consent, { required: false }),
  };
}

export function parseFirebasePhoneVerificationRequest(value) {
  const input = requireObject(value, ['idToken', 'phone']);
  const phone = input.phone === undefined || input.phone === null
    ? null
    : parseOtpRequest({ phone: input.phone }).phone;

  return { idToken: readFirebaseIdToken(input), phone };
}

export function parseCashWithdrawalRequest(value) {
  const input = requireObject(value, ['amount', 'payoutType', 'idempotencyKey']);
  const idempotencyKey = readString(input, 'idempotencyKey', undefined, { required: true, maxLength: 128 });

  if (!/^[A-Za-z0-9_-]{16,128}$/.test(idempotencyKey)) {
    throw new RangeError('idempotencyKey must contain 16 to 128 safe characters');
  }

  return {
    amount: readInteger(input, 'amount', undefined, { positive: true }),
    payoutType: readEnum(input, 'payoutType', undefined, ['upi', 'bank']),
    idempotencyKey,
  };
}