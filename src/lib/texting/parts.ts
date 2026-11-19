// Text parts for one message, shared by the browser (cost preview) and the server (sender). No "use client" here:
// the server can't call functions from a "use client" file (Nov 19: /api/sms/test failed with exactly that).
/** Plain letters (A–Z, 0–9, normal symbols) = 160 (153 each when split); anything else (Vietnamese accents, emoji)
 *  = 70 (67 each). Same rule as `_text_parts` in the database. */
const PLAIN = /^[\x20-\x7E\n\r]*$/;
export function textParts(msg: string): { parts: number; plain: boolean; letters: number } {
  const plain = PLAIN.test(msg);
  const letters = [...msg].length;
  if (!letters) return { parts: 0, plain, letters };
  const [one, many] = plain ? [160, 153] : [70, 67];
  return { parts: letters <= one ? 1 : Math.ceil(letters / many), plain, letters };
}
