/**
 * Magic-byte check that an uploaded file really is the image type it claims.
 * Shared by the public maintenance photo intake and the cleaning walkthrough
 * route, so a renamed HTML or script file never lands in a photo bucket.
 */

function startsWith(bytes: Uint8Array, signature: number[]) {
  return signature.every((value, index) => bytes[index] === value);
}

function hasIsoBaseMediaBrand(bytes: Uint8Array) {
  if (bytes.length < 12 || !startsWith(bytes.slice(4), [0x66, 0x74, 0x79, 0x70])) return false;
  const brand = new TextDecoder().decode(bytes.slice(8, 12)).toLowerCase();
  return ["heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs", "mif1", "msf1"].includes(brand);
}

export function hasMatchingImageSignature(mimeType: string, bytes: Uint8Array) {
  switch (mimeType) {
    case "image/jpeg":
      return startsWith(bytes, [0xff, 0xd8, 0xff]);
    case "image/png":
      return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "image/gif":
      return startsWith(bytes, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) || startsWith(bytes, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
    case "image/webp":
      return startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes.slice(8), [0x57, 0x45, 0x42, 0x50]);
    case "image/heic":
    case "image/heif":
      return hasIsoBaseMediaBrand(bytes);
    default:
      return false;
  }
}
