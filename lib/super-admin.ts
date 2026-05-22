export function isSuperAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  const allowed = (process.env.SUPER_ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase());
  return allowed.includes(email.toLowerCase());
}
