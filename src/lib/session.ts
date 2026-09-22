import { cookies } from "next/headers";

export const UID_COOKIE = "sd_uid";

export async function getCurrentUserId(): Promise<string | null> {
  const store = await cookies();
  return store.get(UID_COOKIE)?.value ?? null;
}
