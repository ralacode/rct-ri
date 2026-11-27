import {
  CalendarDays,
  ClipboardList,
  Contact,
  ContactRound,
  FileText,
  Film,
  Home,
  KeyRound,
  MessageCircleQuestion,
  Printer,
  Search,
  Settings,
  Stethoscope,
  TrendingDown,
  Users,
  type LucideIcon,
} from "lucide-react";

import type { Access } from "@/lib/permissions";

export type MenuGroupId = "ri" | "radiotherapy" | "common";

export type MenuItem = {
  name: string;
  href: string;
  icon: LucideIcon;
  group: MenuGroupId;
  /** 検索用の読み・別名 */
  keywords?: readonly string[];
  /** 担当者管理権限を持つユーザーにだけ表示する */
  adminOnly?: boolean;
  /** 担当モダリティで表示を絞る（省略時は全員に表示） */
  access?: Access;
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
    access: "ri",
    keywords: ["けんさいちらん", "検査", "オーダー", "order"],
  },
  {
    name: "減衰計算",
    href: "/mo99-decay/",
    icon: TrendingDown,
    group: "ri",
    access: "ri",
    keywords: ["げんすいけいさん", "減衰", "mo99", "mo-99", "tc99m", "99mtc"],
  },
  {
    name: "溶出記録",
    href: "/generator-elution/",
    icon: Printer,
    group: "ri",
    access: "ri",
    keywords: ["ようしゅつきろく", "溶出", "ジェネレータ", "generator", "mo99", "tc99m", "99mtc"],
  },
  {
    name: "作業内容記録",
    href: "/ri-room-record/",
    icon: Printer,
    group: "ri",
    access: "ri",
    keywords: ["さぎょうないようきろく", "作業内容", "使用室", "入室", "退室", "汚染", "放射性同位元素", "ri"],
  },
  {
    name: "治療依頼表",
    href: "/treatment/",
    icon: CalendarDays,
    group: "radiotherapy",
    access: "radiotherapy",
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
    access: "patients",
  },
  {
    name: "患者一覧",
    href: "/patient/list/",
    icon: Contact,
    group: "common",
    keywords: ["かんじゃいちらん", "患者", "patient"],
    access: "patients",
  },
  {
    name: "患者検索",
    href: "/patient/search/",
    icon: Search,
    group: "common",
    keywords: ["かんじゃけんさく", "患者", "検索", "patient"],
    access: "patients",
  },
  {
    name: "作業報告書",
    href: "/work-report/",
    icon: FileText,
    group: "common",
    keywords: ["さぎょうほうこくしょ", "作業報告書", "報告書", "保守", "修理", "点検", "メーカー", "varian", "siemens"],
  },
  {
    name: "動画",
    href: "/videos/",
    icon: Film,
    group: "common",
    keywords: ["どうが", "ビデオ", "video", "movie"],
  },
  // 解説記事（/guide/）は記事がそろうまでメニューに出さない。
  {
    name: "質問・要望",
    href: "/feedback/",
    icon: MessageCircleQuestion,
    group: "common",
    keywords: ["しつもん", "ようぼう", "質問", "要望", "ris", "feedback", "回答"],
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
    name: "依頼科・依頼医",
    href: "/requesters/",
    icon: Stethoscope,
    group: "common",
    keywords: ["いらいか", "いらいい", "依頼科", "依頼医", "診療科", "医師", "先生", "doctor"],
    adminOnly: true,
  },
  {
    name: "設定",
    href: "/settings/",
    icon: Settings,
    group: "common",
    keywords: ["せってい", "設定", "施設名", "しせつめい", "病院名", "settings"],
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
