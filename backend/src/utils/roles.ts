/** SUPER_ADMIN is a superset of ADMIN — it can do anything an ADMIN can. */
export const isAdminRole = (role?: string | null): boolean =>
  role === 'ADMIN' || role === 'SUPER_ADMIN';
