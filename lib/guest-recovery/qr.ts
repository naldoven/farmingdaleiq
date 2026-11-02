import QRCode from "qrcode";

/**
 * QR codes for the guest link. Server only. The PNG travels inside the email
 * as an inline attachment (mail apps block remote images and ignore data:
 * images); the SVG is drawn straight into the guest page.
 */

export function qrPng(text: string): Promise<Buffer> {
  return QRCode.toBuffer(text, { type: "png", width: 360, margin: 2, errorCorrectionLevel: "M" });
}

export function qrSvg(text: string): Promise<string> {
  return QRCode.toString(text, { type: "svg", margin: 2, errorCorrectionLevel: "M" });
}
