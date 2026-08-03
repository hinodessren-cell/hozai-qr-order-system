-- Excel品番とアプリ品番を正規化して照合し、一致した品目だけを更新する。
-- 品番・備考・ID・QR情報は変更しない。Excelで同じ品番が複数ある場合は上側の記載を採用する。
UPDATE items SET name = 'キメイタ80', order_qty = 10, order_point = '最後１箱開封時に発注！' WHERE id = 'HZ-234322EB717DA2';
UPDATE items SET name = 'キメイタ85', order_qty = 10, order_point = '最後2箱開封時に発注！' WHERE id = 'HZ-4ECFC3B1D7C15D';
UPDATE items SET name = 'キメイタ95', order_qty = 10, order_point = '最後１箱開封時に発注！' WHERE id = 'HZ-C99F2CF845BBC7';
UPDATE items SET name = 'キメイタ100', order_qty = 10, order_point = '最後１箱開封時に発注！' WHERE id = 'HZ-6494BAF4A57534';
UPDATE items SET name = '自在ブッシュ144', order_qty = 100, order_point = '最後１箱開封時に発注！' WHERE id = 'HZ-56FFB275CE8869';
UPDATE items SET name = '自在ブッシュ99', order_qty = 100, order_point = '最後１箱開封時に発注！' WHERE id = 'HZ-6E2A15DE1D4353';
UPDATE items SET name = 'マウントベース', order_qty = 100, order_point = '最後１箱開封時に発注！' WHERE id = 'HZ-7E667097B9ED76';
UPDATE items SET name = 'ｽﾊﾟｲﾗﾙ-12', order_qty = 50, order_point = '最後１箱開封時に発注！' WHERE id = 'HZ-491F08C6273FB0';
UPDATE items SET name = 'ｽﾊﾟｲﾗﾙ-4', order_qty = 200, order_point = '最後１箱開封時に発注！' WHERE id = 'HZ-1382EA838A6180';
UPDATE items SET name = 'ｽﾊﾟｲﾗﾙ-6', order_qty = 200, order_point = '最後１箱開封時に発注！' WHERE id = 'HZ-652751C7D97E1B';
UPDATE items SET name = 'ｽﾊﾟｲﾗﾙ-8', order_qty = 100, order_point = '最後１箱開封時に発注！' WHERE id = 'HZ-AB60F518BD0728';
UPDATE items SET name = 'ﾎｯｸﾁｭｰﾌﾞ30Ｒ', order_qty = 50, order_point = '最後１箱開封時に発注！' WHERE id = 'HZ-6257DABA2162AE';
UPDATE items SET name = 'ﾎｯｸﾁｭｰﾌﾞ40Ｒ', order_qty = 50, order_point = '最後１箱開封時に発注！' WHERE id = 'HZ-819404583D9F33';
UPDATE items SET name = 'ﾎｯｸﾁｭｰﾌﾞ50Ｒ', order_qty = 50, order_point = '最後１箱開封時に発注！' WHERE id = 'HZ-A9656B8107946B';
UPDATE items SET order_point = '最後１箱開封時に発注！' WHERE id = 'HZ-1B4C603F8850BE';
