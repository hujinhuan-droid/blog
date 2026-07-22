-- Site-wide traffic statistics (homepage counter)
-- Two new tables: site_visits (raw visit log) and site_visit_stats (PV + HyperLogLog UV)

CREATE TABLE IF NOT EXISTS `site_visits` (
	`id` integer PRIMARY KEY NOT NULL,
	`ip` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
-->statement-breakpoint
CREATE TABLE IF NOT EXISTS `site_visit_stats` (
	`id` integer PRIMARY KEY NOT NULL,
	`pv` integer DEFAULT 0 NOT NULL,
	`hll_data` text DEFAULT '' NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
-->statement-breakpoint
UPDATE `info` SET `value` = '11' WHERE `key` = 'migration_version';
