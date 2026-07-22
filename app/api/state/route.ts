import { desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { appSettings, items, orders } from "../../../db/schema";

export async function GET() {
  try {
    const db = getDb();
    const [itemRows, orderRows, settingRows] = await Promise.all([
      db.select().from(items), db.select().from(orders).orderBy(desc(orders.updatedAt)).limit(500), db.select().from(appSettings),
    ]);
    const itemMap = new Map(itemRows.map((item) => [item.id, item]));
    return Response.json({
      items: itemRows,
      orders: orderRows.map((order) => ({ ...itemMap.get(order.itemId), orderId: order.id, status: order.status, qty: order.quantity, purchaser: order.purchaser, orderedAt: order.orderedAt })),
      settings: Object.fromEntries(settingRows.map((row) => [row.key, JSON.parse(row.value)])),
    });
  } catch { return Response.json({ items: [], orders: [], settings: {} }); }
}

export async function POST(request: Request) {
  const payload = await request.json() as { action?: string; itemId?: string; orderId?: string; status?: string; quantity?: number; purchaser?: string; settings?: Record<string, unknown> };
  const db = getDb();
  if (payload.action === "order" && payload.itemId && payload.orderId) {
    const now = new Date().toISOString();
    await db.insert(orders).values({
      id: payload.orderId,
      itemId: payload.itemId,
      status: "発注待ち",
      quantity: Math.max(1, payload.quantity ?? 1),
      purchaser: payload.purchaser ?? "担当者",
      orderedAt: now,
      updatedAt: now,
    });
  }
  if (payload.action === "status" && payload.orderId && payload.status) {
    await db.update(orders).set({ status: payload.status, updatedAt: new Date().toISOString() }).where(eq(orders.id, payload.orderId));
  }
  if (payload.action === "settings" && payload.settings) {
    for (const [key, value] of Object.entries(payload.settings)) await db.insert(appSettings).values({ key, value: JSON.stringify(value) }).onConflictDoUpdate({ target: appSettings.key, set: { value: JSON.stringify(value) } });
  }
  return Response.json({ ok: true });
}
