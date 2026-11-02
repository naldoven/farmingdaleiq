/**
 * Reads a guest's recovery code out of whatever a scan or a paste produced: the
 * link from their email or text (a QR holds exactly that), or the bare 64
 * character code. Returns the lower-case token, or null when the text is not a
 * recovery code. The scanner only ever navigates to /recover/<token> built from
 * this return value, never to the scanned text itself, so a QR holding some
 * other address cannot send a leader anywhere else.
 */
export function extractRecoveryToken(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  if (/^[0-9a-f]{64}$/i.test(text)) return text.toLowerCase();
  const match = /\/recover\/([0-9a-f]{64})(?![0-9a-f])/i.exec(text);
  return match ? match[1].toLowerCase() : null;
}
