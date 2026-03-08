import sharp from 'sharp';

interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Crop a person from an image based on bounding box
 */
export async function cropPerson(
  imageBuffer: Buffer,
  boundingBox: BoundingBox,
  options: { size?: number; padding?: number } = {}
): Promise<Buffer> {
  const { size = 150, padding = 20 } = options;

  // Get image metadata
  const metadata = await sharp(imageBuffer).metadata();
  const imgWidth = metadata.width || 0;
  const imgHeight = metadata.height || 0;

  // Add padding to bounding box
  const x = Math.max(0, Math.round(boundingBox.x - padding));
  const y = Math.max(0, Math.round(boundingBox.y - padding));
  const width = Math.min(imgWidth - x, Math.round(boundingBox.width + padding * 2));
  const height = Math.min(imgHeight - y, Math.round(boundingBox.height + padding * 2));

  // Crop and resize
  const cropped = await sharp(imageBuffer)
    .extract({ left: x, top: y, width, height })
    .resize(size, size, { fit: 'cover', position: 'top' })
    .jpeg({ quality: 85 })
    .toBuffer();

  return cropped;
}

/**
 * Create a circular avatar thumbnail
 */
export async function createCircularThumbnail(
  imageBuffer: Buffer,
  size: number = 100
): Promise<Buffer> {
  // Create circular mask
  const circleMask = Buffer.from(
    `<svg width="${size}" height="${size}">
      <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="white"/>
    </svg>`
  );

  const thumbnail = await sharp(imageBuffer)
    .resize(size, size, { fit: 'cover', position: 'top' })
    .composite([
      {
        input: circleMask,
        blend: 'dest-in',
      },
    ])
    .png()
    .toBuffer();

  return thumbnail;
}

/**
 * Resize an image maintaining aspect ratio
 */
export async function resizeImage(
  imageBuffer: Buffer,
  maxWidth: number = 800,
  maxHeight: number = 800
): Promise<Buffer> {
  const resized = await sharp(imageBuffer)
    .resize(maxWidth, maxHeight, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();

  return resized;
}
