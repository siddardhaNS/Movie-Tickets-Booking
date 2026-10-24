import { NextResponse } from 'next/server';
import { endStaffSession } from '@/lib/auth';

export async function POST() {
  await endStaffSession();
  return NextResponse.json({ ok: true });
}
