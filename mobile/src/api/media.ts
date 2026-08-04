import { apiClient } from './client';

/**
 * Best-effort delete of an image the current user uploaded but no longer wants
 * stored (removed before submitting, replaced avatar, etc.). Fire-and-forget:
 * the backend treats unknown/foreign/absent images as a silent success and only
 * refuses when the image is already part of a submitted record, so callers can
 * drop this without error handling. Local file URIs are never sent.
 */
export function deleteUploadedImage(url?: string | null): void {
  if (!url || typeof url !== 'string' || url.startsWith('file://')) return;
  apiClient.delete('/upload/self', { data: { url } }).catch(() => {});
}
