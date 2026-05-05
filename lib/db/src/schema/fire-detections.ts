import { pgTable, text, serial, timestamp, boolean, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const fireDetectionsTable = pgTable("fire_detections", {
  id: serial("id").primaryKey(),
  videoName: text("video_name").notNull(),
  detected: boolean("detected").notNull(),
  detectedAtSeconds: real("detected_at_seconds"),
  timestampFormatted: text("timestamp_formatted"),
  confidence: text("confidence"),
  thumbnailBase64: text("thumbnail_base64"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertFireDetectionSchema = createInsertSchema(fireDetectionsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertFireDetection = z.infer<typeof insertFireDetectionSchema>;
export type FireDetection = typeof fireDetectionsTable.$inferSelect;
