import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("contains the material ordering workflow", async () => {
  const [page, route, layout] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/api/state/route.ts", root), "utf8"),
    readFile(new URL("app/layout.tsx", root), "utf8"),
  ]);

  assert.match(page, /補材 QR 発注管理/);
  assert.match(page, /function QrScanner/);
  assert.match(page, /action: "order"/);
  assert.match(page, /action: "status"/);
  assert.match(route, /payload\.action === "order"/);
  assert.match(route, /payload\.action === "status"/);
  assert.match(route, /payload\.action === "settings"/);
  assert.match(route, /qty: orderQty/);
  assert.match(route, /Number\.isSafeInteger\(quantity\)/);
  assert.match(route, /orderStatuses\.includes/);
  assert.match(layout, /title: "補材 QR 発注管理"/);
  assert.match(layout, /<html lang="ja">/);
});

test("ships the migrated database and QR assets", async () => {
  const [schema, initialMigration, legacyMigration, qrFiles] = await Promise.all([
    readFile(new URL("db/schema.ts", root), "utf8"),
    readFile(new URL("drizzle/0000_initial.sql", root), "utf8"),
    readFile(new URL("drizzle/0001_legacy_data.sql", root), "utf8"),
    readdir(new URL("public/qr/", root)),
  ]);

  assert.match(schema, /sqliteTable\("items"/);
  assert.match(schema, /sqliteTable\("orders"/);
  assert.match(schema, /sqliteTable\("app_settings"/);
  assert.match(initialMigration, /CREATE TABLE [`"]items[`"]/i);
  assert.match(legacyMigration, /INSERT OR REPLACE INTO items/i);
  assert.equal(qrFiles.filter((name) => name.endsWith(".svg")).length, 1512);
});
