import QRCode from 'qrcode';

/** Server-rendered QR code holding the booking code that the gate scans. */
export async function QR({ code, label }: { code: string; label?: string }) {
  const svg = await QRCode.toString(code, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#111111', light: '#FFFFFF' } });
  return <div className="qrsvg" role="img" aria-label={label ?? `Entry code ${code}`} dangerouslySetInnerHTML={{ __html: svg }} />;
}
