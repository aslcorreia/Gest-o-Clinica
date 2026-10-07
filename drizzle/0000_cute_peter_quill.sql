CREATE TABLE `audit` (
	`id` text PRIMARY KEY NOT NULL,
	`clinic` text NOT NULL,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`record_id` text NOT NULL,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_clinic` ON `audit` (`clinic`);--> statement-breakpoint
CREATE TABLE `clinics` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`name` text NOT NULL,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `memberships` (
	`id` text PRIMARY KEY NOT NULL,
	`clinic` text NOT NULL,
	`email` text NOT NULL,
	`therapist` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `membership_email` ON `memberships` (`email`);--> statement-breakpoint
CREATE TABLE `records` (
	`id` text PRIMARY KEY NOT NULL,
	`clinic` text NOT NULL,
	`kind` text NOT NULL,
	`data` text NOT NULL,
	`author` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`updated` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `records_clinic_kind` ON `records` (`clinic`,`kind`);