import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("contains the material ordering workflow", async () => {
  const [page, route, layout, styles] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/api/state/route.ts", root), "utf8"),
    readFile(new URL("app/layout.tsx", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
  ]);

  assert.match(page, /日の出製作所/);
  assert.match(page, /function QrScanner/);
  assert.match(page, /history\.replaceState/);
  assert.match(page, /search\.delete\("item"\)/);
  assert.match(page, /action: "order"/);
  assert.match(page, /action: "status"/);
  assert.match(page, /function OrderBoard/);
  assert.match(page, /function QrBoards/);
  assert.match(page, /QrScannerEngine/);
  assert.match(page, /カメラで撮影して読み取る/);
  assert.match(page, /ライブカメラを再試行/);
  assert.match(page, /iphoneScanner/);
  assert.match(page, /管理番号を手入力する/);
  assert.match(page, /push-subscribe/);
  assert.match(page, /発注者名（必須）/);
  assert.match(page, /前回までの発注履歴/);
  assert.match(page, /formatOrderDate/);
  assert.match(page, /function ItemEditor/);
  assert.match(page, /function InlineBoard/);
  assert.match(page, /padStart\(3, "0"\)/);
  assert.match(page, />品番<input/);
  assert.match(page, /function OptionsMenu/);
  assert.match(page, /発注点/);
  assert.match(page, /setInterval/);
  assert.match(page, /new Notification/);
  assert.match(page, /acknowledged-orders/);
  assert.match(page, /setUnreadOrders\(0\)/);
  assert.match(page, /acknowledged-status-events/);
  assert.match(page, /progressLamp/);
  assert.match(styles, /\.progressLamp/);
  assert.match(styles, /@media print[\s\S]*\.inlineBoardFields/);
  assert.match(styles, /min-width:701px[\s\S]*max-width:1100px/);
  assert.match(styles, /max-width:700px[\s\S]*scroll-snap-type/);
  assert.match(styles, /\.iphoneScanner/);
  assert.match(styles, /height:100dvh/);
  assert.match(page, /発注取消/);
  assert.match(page, /入荷待ちへ戻す/);
  assert.match(styles, /@media print[\s\S]*border:0!important/);
  assert.match(styles, /\.orderPointField/);
  assert.match(route, /payload\.action === "order"/);
  assert.match(route, /payload\.action === "status"/);
  assert.match(route, /payload\.action === "settings"/);
  assert.match(route, /payload\.action === "item"/);
  assert.match(route, /payload\.action === "item-create"/);
  assert.match(route, /"取消"/);
  assert.match(route, /payload\.action === "push-subscribe"/);
  assert.doesNotMatch(route.match(/if \(payload\.action === "push-subscribe"\)[\s\S]*?return Response\.json\(\{ ok: true \}\);/)?.[0] ?? "", /requireAuthenticatedUser/);
  assert.match(route, /duplicate_active_order/);
  assert.match(route, /qty: orderQty/);
  assert.match(route, /orderPoint/);
  assert.match(route, /Number\.isSafeInteger\(quantity\)/);
  assert.match(route, /orderStatuses\.includes/);
  assert.match(route, /getChatGPTUser/);
  assert.match(route, /status: 401/);
  assert.match(page, /signin-with-chatgpt/);
  assert.match(layout, /title: "日の出製作所 補材発注管理"/);
  assert.match(layout, /<html lang="ja">/);
});

test("ships the migrated database and QR assets", async () => {
  const [schema, initialMigration, legacyMigration, workflowMigration, orderPointMigration, qrGenerator, serviceWorker, pwaRegister, qrFiles] = await Promise.all([
    readFile(new URL("db/schema.ts", root), "utf8"),
    readFile(new URL("drizzle/0000_initial.sql", root), "utf8"),
    readFile(new URL("drizzle/0001_legacy_data.sql", root), "utf8"),
    readFile(new URL("drizzle/0002_order_workflow.sql", root), "utf8"),
    readFile(new URL("drizzle/0003_item_order_point.sql", root), "utf8"),
    readFile(new URL("scripts/generate_qr_assets.py", root), "utf8"),
    readFile(new URL("public/sw.js", root), "utf8"),
    readFile(new URL("app/pwa-register.tsx", root), "utf8"),
    readdir(new URL("public/qr/", root)),
  ]);

  assert.match(schema, /sqliteTable\("items"/);
  assert.match(schema, /orderPoint/);
  assert.match(orderPointMigration, /ADD `order_point`/);
  assert.match(schema, /sqliteTable\("orders"/);
  assert.match(schema, /sqliteTable\("app_settings"/);
  assert.match(initialMigration, /CREATE TABLE [`"]items[`"]/i);
  assert.match(legacyMigration, /INSERT OR REPLACE INTO items/i);
  assert.match(workflowMigration, /prevent_duplicate_active_order/);
  assert.match(workflowMigration, /push_subscriptions/);
  assert.match(serviceWorker, /addEventListener\("push"/);
  assert.match(serviceWorker, /request\.destination === "script"/);
  assert.match(pwaRegister, /updateViaCache: "none"/);
  assert.match(pwaRegister, /controllerchange/);
  assert.match(qrGenerator, /QR_BASE_URL/);
  assert.match(qrGenerator, /\?item=/);
  assert.equal(qrFiles.filter((name) => name.endsWith(".svg")).length, 1512);
});
