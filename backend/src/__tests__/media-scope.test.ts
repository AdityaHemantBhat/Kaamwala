import { linkMediaToScope } from '../services/media.service';

// Mock Prisma so we can assert exactly what linkMediaToScope queries/writes.
jest.mock('../config/prisma', () => ({
  prisma: {
    mediaAsset: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
  },
}));

const { prisma } = require('../config/prisma');
const updateMany = prisma.mediaAsset.updateMany as jest.Mock;

/** Prisma.updateMany takes a single { where, data } args object. */
function lastArgs() {
  return updateMany.mock.calls[updateMany.mock.calls.length - 1][0];
}

describe('linkMediaToScope — MediaAsset bookingId/requestId back-fill', () => {
  beforeEach(() => jest.clearAllMocks());

  test('back-fills bookingId even when requestId is already set (request→booking conversion)', async () => {
    await linkMediaToScope(['https://cdn/img1.jpg'], { requestId: 'req_1', bookingId: 'bk_1' });

    const { where, data } = lastArgs();
    // Must match assets already linked to this request (requestId = req_1), not
    // only untagged ones — otherwise bookingId is never written (the bug).
    expect(where).toMatchObject({ url: 'https://cdn/img1.jpg', bookingId: null });
    expect(where.OR).toEqual([{ requestId: null }, { requestId: 'req_1' }]);
    expect(data).toEqual({ requestId: 'req_1', bookingId: 'bk_1' });
  });

  test('never clobbers an asset that already has a bookingId', async () => {
    await linkMediaToScope(['https://cdn/img1.jpg'], { bookingId: 'bk_9' });

    const { where } = lastArgs();
    expect(where.bookingId).toBe(null);
    // No requestId in scope → only fully untagged assets are candidates.
    expect(where).toMatchObject({ url: 'https://cdn/img1.jpg', requestId: null });
  });

  test('request-only back-fill targets untagged assets (or the same request)', async () => {
    await linkMediaToScope(['https://cdn/img1.jpg'], { requestId: 'req_1' });

    const { where, data } = lastArgs();
    expect(where).toMatchObject({ url: 'https://cdn/img1.jpg', bookingId: null });
    expect(where.OR).toEqual([{ requestId: null }, { requestId: 'req_1' }]);
    expect(data).toEqual({ requestId: 'req_1' });
  });

  test('ignores invalid/empty urls', async () => {
    await linkMediaToScope(['', null as any, undefined as any], { requestId: 'req_1' });
    expect(updateMany).not.toHaveBeenCalled();
  });
});
