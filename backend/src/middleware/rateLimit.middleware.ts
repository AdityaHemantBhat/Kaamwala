import rateLimit from 'express-rate-limit';

export const authLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // 5 requests per windowMs
  message: { success: false, message: 'Too many requests from this IP, please try again after a minute' },
  standardHeaders: true,
  legacyHeaders: false,
});

export const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  // 100 was far too tight for this app: every screen fires several read GETs on
  // mount + focus, the broadcast popup polls on every foreground, and in dev a
  // single IP (emulator + phone + reloads) easily exceeds 100/min. Once the
  // bucket emptied, EVERY request 429'd for the rest of the window (the client
  // kept firing) — a self-sustaining lockout. 600/min (~10/sec) is a generous
  // ceiling for legit traffic while still a meaningful single-IP DoS backstop.
  // Sensitive endpoints (auth, payments) have their own stricter limiters.
  max: 600, // 600 requests per windowMs
  message: { success: false, message: 'Too many API requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});
