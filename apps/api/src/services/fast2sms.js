import { OtpDeliveryError } from '../domain/otp.js';

const endpoint = 'https://www.fast2sms.com/dev/bulkV2';

export function createFast2SmsSender({ apiKey, fetchImpl = fetch }) {
  return async (phone, code) => {
    if (!apiKey) {
      throw new OtpDeliveryError('Fast2SMS is not configured');
    }

    if (!/^\+91[6-9]\d{9}$/.test(phone)) {
      throw new OtpDeliveryError('OTP destination is invalid');
    }

    let response;
    try {
      response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          authorization: apiKey,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          route: 'otp',
          variables_values: code,
          numbers: phone.slice(3),
        }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new OtpDeliveryError('Fast2SMS could not be reached');
    }

    let result;
    try {
      result = await response.json();
    } catch {
      result = null;
    }

    if (!response.ok || result?.return !== true) {
      throw new OtpDeliveryError('Fast2SMS rejected the OTP request');
    }
  };
}