// src/lib/utils.ts
import { siteMeta } from "@lib/constants";

/**
 * ページタイトルを整形する (例: ページ名 | サイト名)
 */
export const getPageTitle = (pageTitle?: string) => {
  return pageTitle ? pageTitle : siteMeta.siteTitle;
};
