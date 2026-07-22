UPDATE orders SET status = '入荷済み' WHERE status = '完了';

CREATE TRIGGER IF NOT EXISTS prevent_duplicate_active_order
BEFORE INSERT ON orders
WHEN NEW.status IN ('発注待ち', '入荷待ち')
  AND EXISTS (
    SELECT 1 FROM orders
    WHERE item_id = NEW.item_id
      AND status IN ('発注待ち', '入荷待ち')
  )
BEGIN
  SELECT RAISE(ABORT, 'duplicate_active_order');
END;

CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint text PRIMARY KEY NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  created_at text NOT NULL
);

INSERT OR REPLACE INTO app_settings (key, value) VALUES
  ('siteName', '"日の出製作所"'),
  ('accent', '"#d61f2c"'),
  ('doneLabel', '"入荷済み"');
