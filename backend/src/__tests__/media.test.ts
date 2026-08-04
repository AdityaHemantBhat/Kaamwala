import { detectImageMime, MEDIA_LIMITS } from '../services/media.service';

describe('Media Security ', () => {
  // Construct valid magic-byte signatures
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), Buffer.alloc(20)]);
  const jpeg = Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]), Buffer.alloc(20)]);
  const gif = Buffer.concat([Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]), Buffer.alloc(20)]);
  const webp = Buffer.concat([Buffer.from('RIFF', 'ascii'), Buffer.alloc(4), Buffer.from('WEBP', 'ascii'), Buffer.alloc(8)]);

  test('detects PNG magic bytes', () => {
    expect(detectImageMime(png)).toBe('image/png');
  });

  test('detects JPEG magic bytes', () => {
    expect(detectImageMime(jpeg)).toBe('image/jpeg');
  });

  test('detects GIF magic bytes', () => {
    expect(detectImageMime(gif)).toBe('image/gif');
  });

  test('detects WebP magic bytes', () => {
    expect(detectImageMime(webp)).toBe('image/webp');
  });

  test('rejects non-image content (fake/renamed file)', () => {
    const fakePng = Buffer.concat([Buffer.from('This is definitely not an image, just text content padded out'), Buffer.alloc(50)]);
    expect(detectImageMime(fakePng)).toBeNull();
  });

  test('rejects empty/too-short buffers', () => {
    expect(detectImageMime(Buffer.alloc(0))).toBeNull();
    expect(detectImageMime(Buffer.alloc(5))).toBeNull();
  });

  test('rejects text/HTML content disguised as image', () => {
    const html = Buffer.from('<!DOCTYPE html><html><body>Not an image</body></html>');
    expect(detectImageMime(html)).toBeNull();
  });

  test('size limit is 5MB', () => {
    expect(MEDIA_LIMITS.maxSizeBytes).toBe(5 * 1024 * 1024);
  });

  test('max upload count is 6', () => {
    expect(MEDIA_LIMITS.maxCount).toBe(6);
  });
});
