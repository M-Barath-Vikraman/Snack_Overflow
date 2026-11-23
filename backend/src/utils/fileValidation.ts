/**
 * File signature (magic bytes) validation utility for uploaded snack images.
 * Enforces JPEG, PNG, and WebP only by inspecting the raw binary header.
 */

export interface FileValidationResult {
  isValid: boolean;
  extension?: 'jpg' | 'png' | 'webp';
  mimeType?: 'image/jpeg' | 'image/png' | 'image/webp';
  error?: string;
}

export function validateImageSignature(buffer: Buffer): FileValidationResult {
  if (!buffer || buffer.length < 12) {
    return {
      isValid: false,
      error: 'File is empty or too small to be a valid image.',
    };
  }

  // 1. Check JPEG magic bytes: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return {
      isValid: true,
      extension: 'jpg',
      mimeType: 'image/jpeg',
    };
  }

  // 2. Check PNG magic bytes: 89 50 4E 47 0D 0A 1A 0A
  const isPng =
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a;

  if (isPng) {
    return {
      isValid: true,
      extension: 'png',
      mimeType: 'image/png',
    };
  }

  // 3. Check WebP magic bytes: RIFF (bytes 0-3) and WEBP (bytes 8-11)
  const isWebP =
    buffer[0] === 0x52 && // R
    buffer[1] === 0x49 && // I
    buffer[2] === 0x46 && // F
    buffer[3] === 0x46 && // F
    buffer[8] === 0x57 && // W
    buffer[9] === 0x45 && // E
    buffer[10] === 0x42 && // B
    buffer[11] === 0x50; // P

  if (isWebP) {
    return {
      isValid: true,
      extension: 'webp',
      mimeType: 'image/webp',
    };
  }

  return {
    isValid: false,
    error: 'Invalid file signature. Only JPEG, PNG, and WebP images are allowed.',
  };
}
