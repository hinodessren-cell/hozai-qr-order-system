import { and, desc, eq, inArray } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { buildPushPayload, type PushSubscription } from "@block65/webcrypto-web-push";
import { getChatGPTUser } from "../../chatgpt-auth";
import { getDb } from "../../../db";
import { appSettings, items, orders, pushSubscriptions } from "../../../db/schema";

const orderStatuses = ["発注待ち", "入荷待ち", "入荷済み", "取消"] as const;
const activeOrderStatuses = ["発注待ち", "入荷待ち"] as const;
const runtimeEnv = env as unknown as {
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
};

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

async function sendOrderNotifications(item: { id: string; code: string; name: string; unit: string }, quantity: number) {
  if (!runtimeEnv.VAPID_PUBLIC_KEY || !runtimeEnv.VAPID_PRIVATE_KEY || !runtimeEnv.VAPID_SUBJECT) return;
  const db = getDb();
  const subscriptions = await db.select().from(pushSubscriptions);
  const data = JSON.stringify({
    title: "新しい補材発注",
    body: `${item.code} ${item.name}：${quantity}${item.unit}`,
    url: "/?tab=orders",
    itemId: item.id,
  });
  await Promise.allSettled(subscriptions.map(async (subscription) => {
    const pushSubscription: PushSubscription = {
      endpoint: subscription.endpoint,
      expirationTime: null,
      keys: { p256dh: subscription.p256dh, auth: subscription.auth },
    };
    const payload = await buildPushPayload(
      { data, options: { ttl: 300 } },
      pushSubscription,
      { subject: runtimeEnv.VAPID_SUBJECT!, publicKey: runtimeEnv.VAPID_PUBLIC_KEY!, privateKey: runtimeEnv.VAPID_PRIVATE_KEY! },
    );
    const response = await fetch(subscription.endpoint, payload);
    if (response.status === 404 || response.status === 410) {
      await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, subscription.endpoint));
    }
  }));
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
      orders: orderRows.map((order) => ({ ...itemMap.get(order.itemId), orderId: order.id, status: order.status === "完了" ? "入荷済み" : order.status, qty: order.quantity, purchaser: order.purchaser, orderedAt: order.orderedAt })),
      settings: Object.fromEntries(settingRows.map((row) => [row.key, JSON.parse(row.value)])),
      pushPublicKey: runtimeEnv.VAPID_PUBLIC_KEY ?? null,
    });
  } catch {
    return Response.json({ error: "状態データを取得できませんでした。" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  let payload: { action?: string; itemId?: string; orderId?: string; status?: string; quantity?: number; purchaser?: string; settings?: Record<string, unknown>; subscription?: { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } };
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
    const [item] = await db.select({ id: items.id, code: items.code, name: items.name, unit: items.unit }).from(items).where(eq(items.id, payload.itemId)).limit(1);
    if (!item) return badRequest("指定された品目が見つかりません。");
    const [activeOrder] = await db.select({ id: orders.id, status: orders.status }).from(orders)
      .where(and(eq(orders.itemId, payload.itemId), inArray(orders.status, [...activeOrderStatuses]))).limit(1);
    if (activeOrder) {
      return Response.json(
        { ok: false, error: `この品目はすでに${activeOrder.status}です。二重発注を防止しました。`, orderId: activeOrder.id },
        { status: 409 },
      );
    }
    const now = new Date().toISOString();
    try {
      await db.insert(orders).values({
        id: payload.orderId,
        itemId: payload.itemId,
        status: "発注待ち",
        quantity,
        purchaser: payload.purchaser?.trim().slice(0, 100) || "担当者",
        orderedAt: now,
        updatedAt: now,
      });
    } catch (error) {
      if (String(error).includes("duplicate_active_order")) {
        return Response.json({ ok: false, error: "この品目はすでに発注処理中です。二重発注を防止しました。" }, { status: 409 });
      }
      throw error;
    }
    await sendOrderNotifications(item, quantity).catch(() => undefined);
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

  if (payload.action === "push-subscribe") {
    const endpoint = typeof payload.subscription?.endpoint === "string" ? payload.subscription.endpoint : "";
    const p256dh = typeof payload.subscription?.keys?.p256dh === "string" ? payload.subscription.keys.p256dh : "";
    const auth = typeof payload.subscription?.keys?.auth === "string" ? payload.subscription.keys.auth : "";
    if (!endpoint.startsWith("https://") || !p256dh || !auth) return badRequest("通知端末の登録情報が正しくありません。");
    const createdAt = new Date().toISOString();
    await db.insert(pushSubscriptions).values({ endpoint, p256dh, auth, createdAt }).onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { p256dh, auth, createdAt },
    });
    return Response.json({ ok: true });
  }

  if (payload.action === "item" || payload.action === "item-create") {
    const unauthorized = await requireAuthenticatedUser();
    if (unauthorized) return unauthorized;
    if (payload.action === "item" && !payload.itemId) return badRequest("品目IDが必要です。");
    const fields = payload.settings;
    if (!fields || Array.isArray(fields)) return badRequest("品目の編集内容が必要です。");
    const textValue = (key: string, max: number) => typeof fields[key] === "string" ? fields[key].trim().slice(0, max) : "";
    const code = textValue("code", 100);
    const name = textValue("name", 200);
    if (!code || !name) return badRequest("品番と品名は必須です。");
    const orderQty = Number(fields.qty);
    if (!Number.isSafeInteger(orderQty) || orderQty < 1 || orderQty > 10_000) return badRequest("発注数量は1～10000の整数で指定してください。");
    const values = {
      code, name, category: textValue("category", 100), unit: textValue("unit", 30) || "個",
      orderQty, location: textValue("location", 200), memo: textValue("memo", 500),
    };
    if (payload.action === "item-create") {
      const id = `HZ-${crypto.randomUUID().replaceAll("-", "").slice(0, 14).toUpperCase()}`;
      await db.insert(items).values({ id, ...values });
      return Response.json({ ok: true, item: serializeItem({ id, ...values }) });
    }
    await db.update(items).set(values).where(eq(items.id, payload.itemId!));
    return Response.json({ ok: true, item: serializeItem({ id: payload.itemId!, ...values }) });
  }

  return badRequest("未対応の操作です。");
}
