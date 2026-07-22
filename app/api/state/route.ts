import { desc, eq } from "drizzle-orm";
import { getChatGPTUser } from "../../chatgpt-auth";
import { getDb } from "../../../db";
import { appSettings, items, orders } from "../../../db/schema";

const orderStatuses = ["発注待ち", "入荷待ち", "完了"] as const;

function serializeItem(item: typeof items.$inferSelect) {
  const { orderQty, ...rest } = item;
  return { ...rest, qty: orderQty };
}

function badRequest(message: string) {
  return Response.json({ ok: false, error: message }, { status: 400 });
}

async function requireAuthenticatedUser() {
  const user = await getChatGPTUser();
  return user ? null : Response.json({ ok: false, error: "この操作にはログインが必要です。" }, { status: 401 });
}

export async function GET() {
  try {
    const db = getDb();
    const [itemRows, orderRows, settingRows] = await Promise.all([
      db.select().from(items), db.select().from(orders).orderBy(desc(orders.updatedAt)).limit(500), db.select().from(appSettings),
    ]);
    const serializedItems = itemRows.map(serializeItem);
    const itemMap = new Map(serializedItems.map((item) => [item.id, item]));
    return Response.json({
      items: serializedItems,
      orders: orderRows.map((order) => ({ ...itemMap.get(order.itemId), orderId: order.id, status: order.status, qty: order.quantity, purchaser: order.purchaser, orderedAt: order.orderedAt })),
      settings: Object.fromEntries(settingRows.map((row) => [row.key, JSON.parse(row.value)])),
    });
  } catch {
    return Response.json({ error: "状態データを取得できませんでした。" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  let payload: { action?: string; itemId?: string; orderId?: string; status?: string; quantity?: number; purchaser?: string; settings?: Record<string, unknown> };
  try {
    payload = await request.json();
  } catch {
    return badRequest("JSON形式のリクエストが必要です。");
  }

  const db = getDb();
  if (payload.action === "order") {
    if (!payload.itemId || !payload.orderId) return badRequest("品目IDと発注IDが必要です。");
    const quantity = payload.quantity ?? 1;
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 10_000) return badRequest("発注数量は1～10000の整数で指定してください。");
    const [item] = await db.select({ id: items.id }).from(items).where(eq(items.id, payload.itemId)).limit(1);
    if (!item) return badRequest("指定された品目が見つかりません。");
    const now = new Date().toISOString();
    await db.insert(orders).values({
      id: payload.orderId,
      itemId: payload.itemId,
      status: "発注待ち",
      quantity,
      purchaser: payload.purchaser?.trim().slice(0, 100) || "担当者",
      orderedAt: now,
      updatedAt: now,
    });
    return Response.json({ ok: true });
  }

  if (payload.action === "status") {
    const unauthorized = await requireAuthenticatedUser();
    if (unauthorized) return unauthorized;
    if (!payload.orderId || !payload.status) return badRequest("発注IDと状態が必要です。");
    if (!orderStatuses.includes(payload.status as (typeof orderStatuses)[number])) return badRequest("指定された状態は使用できません。");
    await db.update(orders).set({ status: payload.status, updatedAt: new Date().toISOString() }).where(eq(orders.id, payload.orderId));
    return Response.json({ ok: true });
  }

  if (payload.action === "settings") {
    const unauthorized = await requireAuthenticatedUser();
    if (unauthorized) return unauthorized;
    if (!payload.settings || Array.isArray(payload.settings)) return badRequest("設定オブジェクトが必要です。");
    for (const [key, value] of Object.entries(payload.settings)) await db.insert(appSettings).values({ key, value: JSON.stringify(value) }).onConflictDoUpdate({ target: appSettings.key, set: { value: JSON.stringify(value) } });
    return Response.json({ ok: true });
  }

  return badRequest("未対応の操作です。");
}
