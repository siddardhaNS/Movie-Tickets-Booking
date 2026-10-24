'use client';

import { useEffect } from 'react';

/** Applies a theatre's chosen look (marquee / poster / calm) to the page. */
export function StyleSetter({ style }: { style?: string }) {
  useEffect(() => {
    const el = document.documentElement;
    if (!style || style === 'marquee') el.removeAttribute('data-style'); else el.setAttribute('data-style', style);
    return () => el.removeAttribute('data-style');
  }, [style]);
  return null;
}
