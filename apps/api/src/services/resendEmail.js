export class EmailDeliveryError extends Error {}

const endpoint = 'https://api.resend.com/emails';

export function createResendEmailSender({ apiKey, from, fetchImpl = fetch }) {
  return async ({ to, subject, text }) => {
    if (!apiKey || !from) {
      throw new EmailDeliveryError('Transactional email is not configured');
    }

    let response;
    try {
      response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ from, to: [to], subject, text }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new EmailDeliveryError('Transactional email provider is unavailable');
    }

    if (!response.ok) {
      throw new EmailDeliveryError('Transactional email was rejected');
    }
  };
}

export function createVerificationEmailSenders({
  primaryApiKey,
  fallbackApiKey,
  from,
  fetchImpl = fetch,
}) {
  const primarySend = createResendEmailSender({ apiKey: primaryApiKey, from, fetchImpl });
  const fallbackSend = createResendEmailSender({ apiKey: fallbackApiKey, from, fetchImpl });

  return {
    async sendCode({ email, fullName, code, verificationUrl }) {
      await primarySend({
        to: email,
        subject: 'Verify your Zivora account',
        text: `Hello ${fullName},\n\nYour email verification code is ${code}. It expires in 10 minutes.\n\nIf you cannot use the code, verify using this one-time link (also expires in 10 minutes):\n${verificationUrl}\n\nIf you did not request this, ignore this email.`,
      });
    },
    async sendFallbackLink({ email, fullName, verificationUrl }) {
      await fallbackSend({
        to: email,
        subject: 'Verify your Zivora account',
        text: `Hello ${fullName},\n\nWe could not deliver a verification code. Use this one-time link to verify your email (expires in 10 minutes):\n${verificationUrl}\n\nIf you did not request this, ignore this email.`,
      });
    },
  };
}
