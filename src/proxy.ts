import { NextResponse, type NextRequest } from 'next/server';

/*
 * Optional subdomain routing. With ROOT_DOMAIN=tickets.example.com, a request to
 * harishankar.tickets.example.com/show/123 is served by /harishankar/show/123.
 * Without ROOT_DOMAIN every theatre lives at /<slug>.
 */
export function proxy(req: NextRequest) {
  const root = process.env.ROOT_DOMAIN;
  if (!root) return NextResponse.next();
  const host = (req.headers.get('host') ?? '').split(':')[0].toLowerCase();
  if (host === root || host === `www.${root}` || !host.endsWith(`.${root}`)) return NextResponse.next();
  const slug = host.slice(0, -(root.length + 1));
  const url = req.nextUrl.clone();
  if (url.pathname.startsWith('/api/')) return NextResponse.next();
  if (url.pathname === `/${slug}` || url.pathname.startsWith(`/${slug}/`)) return NextResponse.next();
  url.pathname = `/${slug}${url.pathname === '/' ? '' : url.pathname}`;
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
