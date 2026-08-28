import Razorpay from "razorpay";
let client: Razorpay | null = null;

export function getRazorpayClient(): Razorpay {
  if (client) return client;

  const key_id = process.env.RAZORPAY_KEY_ID;
  const key_secret = process.env.RAZORPAY_KEY_SECRET;

  if (!key_id || !key_secret) {
    throw new Error(
      "RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET not set. Copy .env.example to .env and add your test-mode keys from the Razorpay Dashboard."
    );
  }
  if (!key_id.startsWith("rzp_test_")) {
    throw new Error(
      `Refusing to initialize: key_id "${key_id.slice(0, 12)}..." does not look like a test-mode key (expected rzp_test_...). This project must only run against test mode.`
    );
  }

  client = new Razorpay({ key_id, key_secret });
  return client;
}
