'use client';

import QRCode from 'qrcode';
import { useEffect, useState } from 'react';

export function ClientQR({ code }: { code: string }) {
  const [svg, setSvg] = useState('');
  useEffect(() => {
    QRCode.toString(code, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#111111', light: '#FFFFFF' } }).then(setSvg).catch(() => setSvg(''));
  }, [code]);
  return <div className="qrsvg" role="img" aria-label={`Entry code ${code}`} dangerouslySetInnerHTML={{ __html: svg }} />;
}
