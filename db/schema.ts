import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const items = sqliteTable("items", {
  id: text("id").primaryKey(), code: text("code").notNull(), name: text("name").notNull(),
  category: text("category").notNull().default(""), unit: text("unit").notNull().default("個"),
  orderQty: integer("order_qty").notNull().default(1), location: text("location").notNull().default(""), memo: text("memo").notNull().default(""),
});
export const orders = sqliteTable("orders", {
  id: text("id").primaryKey(), itemId: text("item_id").notNull(), status: text("status").notNull(),
  quantity: integer("quantity").notNull(), purchaser: text("purchaser").notNull().default(""),
  orderedAt: text("ordered_at").notNull(), updatedAt: text("updated_at").notNull(),
});
export const appSettings = sqliteTable("app_settings", { key: text("key").primaryKey(), value: text("value").notNull() });
