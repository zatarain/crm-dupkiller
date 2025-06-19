import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, index } from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";

export const mergeOperations = sqliteTable("merge_operations", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  primaryUserId: text("primary_user_id").notNull(),
  mergedUserIds: text("merged_user_ids", { mode: "json" }).$type<string[]>().notNull(),
  mergeStrategy: text("merge_strategy").notNull(),
  createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
  status: text("status", { enum: ["completed", "failed", "reverted"] }).notNull().default("completed"),
}, (t) => [
  index("merge_operations_primary_user_idx").on(t.primaryUserId),
  index("merge_operations_status_idx").on(t.status),
  index("merge_operations_created_at_idx").on(t.createdAt),
]);

export const userDiffs = sqliteTable("user_diffs", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  mergeOperationId: integer("merge_operation_id").notNull().references(() => mergeOperations.id),
  userId: text("user_id").notNull(),
  channelName: text("channel_name").notNull(),
  originalData: text("original_data", { mode: "json" }).$type<Record<string, any>>().notNull(),
  mergedData: text("merged_data", { mode: "json" }).$type<Record<string, any>>().notNull(),
  diffData: text("diff_data", { mode: "json" }).$type<Record<string, any>>().notNull(),
  createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
}, (t) => [
  index("user_diffs_merge_operation_idx").on(t.mergeOperationId),
  index("user_diffs_user_id_idx").on(t.userId),
]);

export const deduplicationConfig = sqliteTable("deduplication_config", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  matchingFields: text("matching_fields", { mode: "json" }).$type<string[]>().notNull(),
  mergeStrategy: text("merge_strategy").notNull(),
  autoMergeEnabled: integer("auto_merge_enabled", { mode: "boolean" }).notNull().default(true),
  webhookUrl: text("webhook_url"),
  updatedAt: text("updated_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
});

export const mergeOperationsRelations = relations(mergeOperations, ({ many }) => ({
  userDiffs: many(userDiffs),
}));

export const userDiffsRelations = relations(userDiffs, ({ one }) => ({
  mergeOperation: one(mergeOperations, {
    fields: [userDiffs.mergeOperationId],
    references: [mergeOperations.id],
  }),
}));