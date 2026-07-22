import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const legacy = path.join(root, "work", "legacy-source");
const items = JSON.parse(fs.readFileSync(path.join(legacy, "items.json"), "utf8"));
const orders = JSON.parse(fs.readFileSync(path.join(legacy, "orders.json"), "utf8"));
const q = (value) => `'${String(value ?? "").replaceAll("'", "''")}'`;
const n = (value, fallback = 1) => Number.parseInt(String(value ?? ""), 10) || fallback;
const sql = [
  "-- Imported from hozai_qr_order_system_v22_name_memo_numbering",
  ...items.map((item) => `INSERT OR REPLACE INTO items (id,code,name,category,unit,order_qty,location,memo) VALUES (${q(item.qr_key || item.id)},${q(item.code)},${q(item.name)},${q(item.category)},${q(item.unit || "個")},${n(item.order_qty || item.min_stock)},${q(item.location)},${q(item.memo)});`),
  ...orders.map((order) => `INSERT OR REPLACE INTO orders (id,item_id,status,quantity,purchaser,ordered_at,updated_at) VALUES (${q(order.id)},${q(order.item_key)},${q(order.status)},${n(order.qty)},${q(order.purchaser)},${q(order.time)},${q(order.updated || order.time)});`),
  "",
].join("\n");
fs.writeFileSync(path.join(root, "drizzle", "0001_legacy_data.sql"), sql, "utf8");
console.log(`Imported ${items.length} items and ${orders.length} orders.`);
