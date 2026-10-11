import QRCode from 'qrcode';
import crypto from 'crypto';

/**
 * QR Code Service for Attendance Verification
 */
export class QrService {
  static generateShiftQrPayload(shiftId, eventId) {
    const nonce = crypto.randomBytes(16).toString('hex');
    const timestamp = Date.now();
    return JSON.stringify({ shiftId, eventId, nonce, timestamp });
  }

  static async generateQrCodeDataUrl(payload) {
    return QRCode.toDataURL(payload, {
      errorCorrectionLevel: 'H',
      margin: 2,
      width: 300
    });
  }
}
