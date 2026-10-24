'use client';

import { useEffect } from 'react';
import { rememberTicket } from '../../tickets/store';

export function Remember({ slug, bookingId }: { slug: string; bookingId: string }) {
  useEffect(() => { rememberTicket(slug, bookingId); }, [slug, bookingId]);
  return null;
}
