import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

/** 解説記事（主に RIS の使い方）。src/content/guides/*.mdx に置く。 */
const guides = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/guides" }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    /** サイドバーと一覧の並び順（小さいほど上） */
    order: z.number().default(100),
    updatedAt: z.coerce.date().optional(),
    /** サイドバー検索用の読み・別名 */
    keywords: z.array(z.string()).default([]),
  }),
});

export const collections = { guides };
