import Stripe from 'stripe';
import { getDb } from './supabase';

/**
 * Reports meeting minutes to Stripe metering. Called by Track B when a bot
 * session ends. Must never throw — billing failure is non-fatal for the demo.
 *
 * Contract frozen in HANDOFF.md §3 — Agent B is blocked on this signature.
 */
export async function reportMeetingUsage(
  stripeCustomerId: string,
  minutes: number
): Promise<void> {
  // ──────────────── 1. Meter event ────────────────
  try {
    // Do NOT construct Stripe at module scope — breaks pnpm build when
    // STRIPE_SECRET_KEY is missing during metadata collection.
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

    const customerId =
      stripeCustomerId ||
      process.env.STRIPE_DEMO_CUSTOMER_ID ||
      'demo-customer';

    await stripe.billing.meterEvents.create({
      event_name: 'pinico_meeting_minutes',
      payload: {
        value: String(minutes),
        stripe_customer_id: customerId,
      },
    });

    console.log(`[stripe] meter event: ${minutes}min for ${customerId}`);
  } catch (err) {
    // ponytail: log + continue. Billing is non-fatal; a silent no-op at demo
    // time is worse than claiming the feature doesn't work at all. The console
    // log at least surfaces the failure.
    console.error('[stripe] meter event failed:', err);
  }

  // ──────────────── 2. Update meeting row ────────────────
  try {
    const customerId =
      stripeCustomerId ||
      process.env.STRIPE_DEMO_CUSTOMER_ID ||
      'demo-customer';

    await getDb()
      .from('meetings')
      .update({ duration_minutes: minutes })
      .eq('stripe_customer_id', customerId)
      .eq('status', 'completed');
  } catch (err) {
    // ponytail: log + continue. The meter event is the prize; the meetings
    // row update is best-effort record-keeping.
    console.error('[stripe] meetings update failed:', err);
  }
}
