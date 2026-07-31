import { asc, eq } from "drizzle-orm";
import { accessAccounts } from "../../../db/schema";
import { getDb } from "../../../db";
import { getCurrentAccess, OWNER_EMAIL } from "../../access-control";

export async function GET() {
  const access = await getCurrentAccess();
  if (!access.user) return Response.json({ status: "signed_out" }, { status: 401 });
  const accounts = access.isOwner ? await getDb().select().from(accessAccounts).orderBy(asc(accessAccounts.requestedAt)) : [];
  return Response.json({ ...access, accounts });
}

export async function POST(request: Request) {
  const access = await getCurrentAccess();
  if (!access.user) return Response.json({ error: "ログインが必要です。" }, { status: 401 });
  let payload: { action?: string; email?: string };
  try { payload = await request.json(); } catch { return Response.json({ error: "操作内容が正しくありません。" }, { status: 400 }); }

  const db = getDb();
  if (payload.action === "request") {
    if (access.status === "approved") return Response.json({ ok: true });
    const now = new Date().toISOString();
    await db.update(accessAccounts).set({ status: "pending", updatedAt: now, requestedAt: now }).where(eq(accessAccounts.email, access.user.email));
    return Response.json({ ok: true });
  }

  if (!access.isOwner) return Response.json({ error: "アクセス管理者のみ操作できます。" }, { status: 403 });
  const email = payload.email?.trim().toLowerCase() ?? "";
  if (!email || email === OWNER_EMAIL) return Response.json({ error: "このアカウントは変更できません。" }, { status: 400 });
  const status = payload.action === "approve" ? "approved" : payload.action === "reject" ? "rejected" : payload.action === "revoke" ? "rejected" : null;
  if (!status) return Response.json({ error: "未対応の操作です。" }, { status: 400 });
  await db.update(accessAccounts).set({ status, updatedAt: new Date().toISOString() }).where(eq(accessAccounts.email, email));
  return Response.json({ ok: true });
}
