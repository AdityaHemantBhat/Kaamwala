/**
 * Single source of truth for cross-origin access. Applied to BOTH the HTTP
 * server (CORS headers) and the Socket.IO server (handshake origin check) so
 * the two transports enforce identical policy.
 *
 * `kaamwala://` is the app's custom deep-link scheme (native mobile); native
 * clients typically send no Origin header, which socket.io allows. The
 * localhost:8081 entry covers the Expo web dev client.
 */
export const ALLOWED_ORIGINS = ['http://localhost:8081', 'kaamwala://'];
