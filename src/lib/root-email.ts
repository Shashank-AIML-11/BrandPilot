/**
 * Owner (root) account email, read from the environment instead of being
 * hard-coded in the repository.
 *
 *   Server:  ROOT_EMAIL
 *   Browser: VITE_ROOT_EMAIL   (Vite inlines it at build time, so set both to the same value)
 *
 * If neither is set, NO account is treated as root by email. Root access can
 * still be granted through the `user_roles` table in the Admin Portal.
 *
 * Safe to import from client and server code (no server-only imports).
 */
const fromServer = typeof process !== "undefined" ? process.env?.["ROOT_EMAIL"] : undefined;
const fromClient = (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.[
  "VITE_ROOT_EMAIL"
];

export const ROOT_EMAIL: string = (fromServer || fromClient || "").trim().toLowerCase();

/** True only when a root email is configured AND this email matches it. */
export function isRootEmail(email: string | null | undefined): boolean {
  return ROOT_EMAIL !== "" && (email ?? "").trim().toLowerCase() === ROOT_EMAIL;
}
