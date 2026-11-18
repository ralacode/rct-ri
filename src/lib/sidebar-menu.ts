import {
  BookOpen,
  CalendarDays,
  ClipboardList,
  Contact,
  ContactRound,
  Film,
  Home,
  KeyRound,
  LibraryBig,
  Printer,
  Search,
  TrendingDown,
  Users,
  type LucideIcon,
} from "lucide-react";

export type MenuGroupId = "ri" | "radiotherapy" | "common" | "guide";

export type MenuItem = {
  name: string;
  href: string;
  icon: LucideIcon;
  group: MenuGroupId;
  /** 検索用の読み・別名 */
  keywords?: readonly string[];
  /** 担当者管理権限を持つユーザーにだけ表示する */
  adminOnly?: boolean;
  /** href と完全に一致するときだけ現在のページとして扱う */
  exact?: boolean;
};

/** サイドバーに渡す解説記事へのリンク（ビルド時に content collection から作る） */
export type GuideLink = {
  title: string;
  href: string;
  keywords: string[];
};

export const menuGroups: readonly { id: MenuGroupId; label: string }[] = [
  { id: "ri", label: "RI" },
  { id: "radiotherapy", label: "放射線治療" },
  { id: "common", label: "共通" },
];

export const menuItems: readonly MenuItem[] = [
  {
    name: "検査一覧",
    href: "/exam_order/daily-list/",
    icon: ClipboardList,
    group: "ri",
    keywords: ["けんさいちらん", "検査", "オーダー", "order"],
  },
  {
    name: "減衰計算",
    href: "/mo99-decay/",
    icon: TrendingDown,
    group: "ri",
    keywords: ["げんすいけいさん", "減衰", "mo99", "mo-99", "tc99m", "99mtc"],
  },
  {
    name: "溶出記録",
    href: "/generator-elution/",
    icon: Printer,
    group: "ri",
    keywords: ["ようしゅつきろく", "溶出", "ジェネレータ", "generator", "mo99", "tc99m", "99mtc"],
  },
  {
    name: "治療依頼表",
    href: "/treatment/",
    icon: CalendarDays,
    group: "radiotherapy",
    keywords: ["ちりょういらいひょう", "治療", "依頼", "放射線治療", "照射"],
  },
  {
    name: "ホーム",
    href: "/",
    icon: Home,
    group: "common",
    keywords: ["ほーむ", "home", "トップ"],
  },
  {
    name: "患者登録",
    href: "/patient/register/",
    icon: ContactRound,
    group: "common",
    keywords: ["かんじゃとうろく", "患者", "登録", "patient"],
  },
  {
    name: "患者一覧",
    href: "/patient/list/",
    icon: Contact,
    group: "common",
    keywords: ["かんじゃいちらん", "患者", "patient"],
  },
  {
    name: "患者検索",
    href: "/patient/search/",
    icon: Search,
    group: "common",
    keywords: ["かんじゃけんさく", "患者", "検索", "patient"],
  },
  {
    name: "動画",
    href: "/videos/",
    icon: Film,
    group: "common",
    keywords: ["どうが", "ビデオ", "video", "movie"],
  },
  {
    name: "解説記事",
    href: "/guide/",
    icon: LibraryBig,
    group: "common",
    keywords: ["かいせつきじ", "解説", "記事", "ガイド", "guide", "ris", "使い方", "マニュアル"],
  },
  {
    name: "担当者管理",
    href: "/users/",
    icon: Users,
    group: "common",
    keywords: ["たんとうしゃかんり", "ユーザー", "user", "アカウント"],
    adminOnly: true,
  },
  {
    name: "パスワード変更",
    href: "/account/",
    icon: KeyRound,
    group: "common",
    keywords: ["ぱすわーどへんこう", "パスワード", "password", "アカウント"],
  },
];

export const nurseMenuGroups: readonly { id: MenuGroupId; label: string }[] = [
  { id: "guide", label: "解説記事" },
];

/** 看護師モードのサイドバー：記事一覧と各記事だけを並べる */
export function nurseMenuItems(guides: readonly GuideLink[]): MenuItem[] {
  return [
    {
      name: "記事一覧",
      href: "/guide/",
      icon: LibraryBig,
      group: "guide",
      keywords: ["きじいちらん", "一覧", "解説", "記事"],
      exact: true,
    },
    ...guides.map((guide) => ({
      name: guide.title,
      href: guide.href,
      icon: BookOpen,
      group: "guide" as const,
      keywords: guide.keywords,
    })),
  ];
}

/** 全角/半角・大文字/小文字・カタカナ/ひらがなの違いを吸収して比較用文字列にする */
export function normalizeForSearch(value: string) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (ch) =>
      String.fromCharCode(ch.charCodeAt(0) - 0x60),
    )
    .replace(/\s+/g, "");
}

export function matchesMenuQuery(item: MenuItem, query: string) {
  const q = normalizeForSearch(query);
  if (!q) return true;
  return [item.name, ...(item.keywords ?? [])].some((text) =>
    normalizeForSearch(text).includes(q),
  );
}

export function isCurrentPath(
  path: string | undefined,
  href: string,
  exact = false,
) {
  if (!path) return false;
  if (exact) return path === href;
  return path === href || (href !== "/" && path.startsWith(href));
}
