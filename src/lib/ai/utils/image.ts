/**
 * Image utilities for AI chat - compression and base64 conversion.
 */

const MAX_DIMENSION = 1024; // Max width/height for AI vision
const JPEG_QUALITY = 0.85;
const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4MB max for base64

export const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

/**
 * Check if file is a valid image type.
 */
export function isValidImageType(file: File): boolean {
  return ALLOWED_IMAGE_TYPES.has(file.type);
}

/**
 * Compress image to reduce size for AI API.
 * Uses canvas to resize and convert to JPEG.
 */
export async function compressImageForAI(file: File): Promise<Blob> {
  // Skip compression for small images
  if (file.size < 500 * 1024) {
    return file;
  }

  const bitmap = await createImageBitmap(file);

  // Calculate new dimensions (max 1024px on longest side)
  let width = bitmap.width;
  let height = bitmap.height;

  if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
    if (width > height) {
      height = Math.round((height / width) * MAX_DIMENSION);
      width = MAX_DIMENSION;
    } else {
      width = Math.round((width / height) * MAX_DIMENSION);
      height = MAX_DIMENSION;
    }
  }

  // Draw to canvas
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");

  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  // Convert to JPEG blob
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Failed to compress image"));
      },
      "image/jpeg",
      JPEG_QUALITY
    );
  });
}

/**
 * Convert file to base64 data URL.
 */
export function fileToBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

/**
 * Process image file for AI: validate, compress, convert to base64.
 * Returns base64 data URL or throws error.
 */
export async function processImageForAI(file: File): Promise<string> {
  if (!isValidImageType(file)) {
    throw new Error("Format gambar tidak didukung. Gunakan JPEG, PNG, atau WebP.");
  }

  if (file.size > MAX_FILE_SIZE) {
    throw new Error("Ukuran gambar terlalu besar (max 4MB).");
  }

  // Compress image
  const compressed = await compressImageForAI(file);

  // Convert to base64
  const base64 = await fileToBase64(compressed);

  return base64;
}

/**
 * Format file size for display.
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
