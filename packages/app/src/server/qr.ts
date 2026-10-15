import QRCode from 'qrcode';
import { env } from './env';

/** The address a guest opens: PUBLIC_BASE_URL + /r/{slug} (validated in @wine-match/core, see env.ts). */
export const guestUrl = (slug: string) => `${env().publicBaseUrl}/r/${slug}`;

export const QR_SIZES = { min: 128, max: 4096, default: 1024 } as const;

export function clampSize(raw: string | null): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.max(QR_SIZES.min, Math.min(QR_SIZES.max, Math.round(n))) : QR_SIZES.default;
}

// error correction M (15%): a printed code survives a coffee ring, and stays easy to scan
const OPTIONS = { errorCorrectionLevel: 'M' as const, margin: 2 };

export const qrSvg = (url: string, size: number) => QRCode.toString(url, { ...OPTIONS, type: 'svg', width: size });
export const qrPng = (url: string, size: number) => QRCode.toBuffer(url, { ...OPTIONS, type: 'png', width: size });
