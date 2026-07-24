ALTER TABLE `items` ADD `board_number` integer DEFAULT 0 NOT NULL;
UPDATE `items` SET `board_number` = `rowid` WHERE `board_number` = 0;
