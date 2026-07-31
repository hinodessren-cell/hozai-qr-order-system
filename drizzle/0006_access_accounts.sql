CREATE TABLE IF NOT EXISTS `access_accounts` (
  `email` text PRIMARY KEY NOT NULL,
  `name` text DEFAULT '' NOT NULL,
  `status` text DEFAULT 'pending' NOT NULL,
  `requested_at` text NOT NULL,
  `updated_at` text NOT NULL,
  `last_seen_at` text NOT NULL
);
