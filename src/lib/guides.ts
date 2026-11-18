// ビルド時（Astro 側）専用。astro:content を使うので React から import しないこと。
import { getCollection } from "astro:content";

import type { GuideLink } from "@/lib/sidebar-menu";

export function guideHref(id: string) {
  return `/guide/${id}/`;
}

export async function getSortedGuides() {
  const guides = await getCollection("guides");
  return guides.sort(
    (a, b) => a.data.order - b.data.order || a.data.title.localeCompare(b.data.title, "ja"),
  );
}

export async function getGuideLinks(): Promise<GuideLink[]> {
  return (await getSortedGuides()).map((guide) => ({
    title: guide.data.title,
    href: guideHref(guide.id),
    keywords: guide.data.keywords,
  }));
}
