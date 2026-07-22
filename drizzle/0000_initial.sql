CREATE TABLE `items` (
  `id` text PRIMARY KEY NOT NULL,
  `code` text NOT NULL,
  `name` text NOT NULL,
  `category` text DEFAULT '' NOT NULL,
  `unit` text DEFAULT '個' NOT NULL,
  `order_qty` integer DEFAULT 1 NOT NULL,
  `location` text DEFAULT '' NOT NULL,
  `memo` text DEFAULT '' NOT NULL
);
CREATE TABLE `orders` (
  `id` text PRIMARY KEY NOT NULL,
  `item_id` text NOT NULL,
  `status` text NOT NULL,
  `quantity` integer NOT NULL,
  `purchaser` text DEFAULT '' NOT NULL,
  `ordered_at` text NOT NULL,
  `updated_at` text NOT NULL
);
CREATE INDEX `orders_status_idx` ON `orders` (`status`);
CREATE TABLE `app_settings` (`key` text PRIMARY KEY NOT NULL, `value` text NOT NULL);
