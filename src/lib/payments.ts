import type { DB } from '@/db';
import { BookingError, confirmBooking, prepareForPayment, recordOrphanPayment } from './booking';

/*
 * Payment gateway seam. The mock below approves every charge. To go live, implement this interface
 * with Razorpay / Cashfree / PayU: create an order, let the customer pay on the provider's page, and
 * call completeOnlinePayment from the provider's verified webhook instead of from the browser.
 */
export interface PaymentGateway {
  name: string;
  charge(input: { amountPaise: number; reference: string; method: string }): Promise<{ providerRef: string }>;
  refund(input: { providerRef: string; amountPaise: number }): Promise<void>;
}

const mockGateway: PaymentGateway = {
  name: 'mock',
  async charge({ reference }) {
    await new Promise(r => setTimeout(r, 700));
    return { providerRef: `mock_${reference}_${Date.now().toString(36)}` };
  },
  async refund() { /* nothing to do */ },
};

export const gateway: PaymentGateway = mockGateway;

export async function payOnline(db: DB, orgId: string, bookingId: string, buyer: { name: string; phone: string; method: string }) {
  // 1. Make sure the hold is still alive and stretch it so a slow payment doesn't lose the seats.
  const b = await prepareForPayment(db, orgId, bookingId, buyer);
  if (b.status === 'confirmed') return b;
  const amountPaise = b.ticketsPaise + b.feesPaise;

  // 2. Take the money.
  const { providerRef } = await gateway.charge({ amountPaise, reference: b.code, method: buyer.method });

  // 3. Turn the hold into tickets. If the hold is somehow gone, park the payment for a refund.
  try {
    return await confirmBooking(db, {
      orgId, bookingId, payMethod: buyer.method, payRef: providerRef, name: buyer.name, phone: buyer.phone,
      payment: { provider: gateway.name, providerRef, amountPaise },
    });
  } catch (e) {
    if (e instanceof BookingError && e.code === 'HOLD_EXPIRED') {
      await recordOrphanPayment(db, orgId, bookingId, { provider: gateway.name, providerRef, amountPaise, method: buyer.method });
      throw new BookingError('PAID_AFTER_EXPIRY', 'Your payment came through after the seats were released, so the booking was not made. The full amount will be refunded.');
    }
    throw e;
  }
}
