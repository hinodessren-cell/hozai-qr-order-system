import { eq } from "drizzle-orm";
import { getChatGPTUser } from "./chatgpt-auth";
import { getDb } from "../db";
import { accessAccounts } from "../db/schema";

export const OWNER_EMAIL = "renbou12040@gmail.com";

export async function getCurrentAccess(createPending = true) {
  const user = await getChatGPTUser();
  if (!user) return { user: null, status: "signed_out" as const, isOwner: false };

  const email = user.email.trim().toLowerCase();
  const name = user.displayName || email;
  const isOwner = email === OWNER_EMAIL;
  const now = new Date().toISOString();
  const db = getDb();

  if (isOwner) {
    await db.insert(accessAccounts).values({ email, name, status: "approved", requestedAt: now, updatedAt: now, lastSeenAt: now })
      .onConflictDoUpdate({ target: accessAccounts.email, set: { name, status: "approved", updatedAt: now, lastSeenAt: now } });
    return { user: { email, name }, status: "approved" as const, isOwner: true };
  }

  const [account] = await db.select().from(accessAccounts).where(eq(accessAccounts.email, email)).limit(1);
  if (!account && createPending) {
    await db.insert(accessAccounts).values({ email, name, status: "pending", requestedAt: now, updatedAt: now, lastSeenAt: now });
    return { user: { email, name }, status: "pending" as const, isOwner: false };
  }
  if (!account) return { user: { email, name }, status: "pending" as const, isOwner: false };
  await db.update(accessAccounts).set({ name, lastSeenAt: now }).where(eq(accessAccounts.email, email));
  return { user: { email, name }, status: account.status as "pending" | "approved" | "rejected", isOwner: false };
}

export async function requireApprovedAccess() {
  const access = await getCurrentAccess();
  if (!access.user) return Response.json({ ok: false, error: "ログインが必要です。" }, { status: 401 });
  if (access.status !== "approved") return Response.json({ ok: false, error: "アクセスの承認待ちです。" }, { status: 403 });
  return null;
}
