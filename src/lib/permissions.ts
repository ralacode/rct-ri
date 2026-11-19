// 担当モダリティで使えるページ・メニューを決める。
// サーバー側（src-tauri/src/http.rs の page_allowed）と同じ判定にする。
import type { AuthUser } from "@/lib/auth";

export const RI_CODE = "ri";
export const RADIATION_THERAPY_CODE = "radiation_therapy";

/** ページ・メニューを使える人の条件 */
export type Access = "ri" | "radiotherapy" | "patients";

type Member = Pick<AuthUser, "modalities"> | null | undefined;

function hasModality(user: Member, code: string) {
  return !!user?.modalities?.some((modality) => modality.code === code);
}

export function isRiMember(user: Member) {
  return hasModality(user, RI_CODE);
}

export function isRadiotherapyMember(user: Member) {
  return hasModality(user, RADIATION_THERAPY_CODE);
}

/** 患者のページ（登録・一覧・検索・詳細）は RI か放射線治療の人が使える */
export function canUsePatients(user: Member) {
  return isRiMember(user) || isRadiotherapyMember(user);
}

export function hasAccess(user: Member, access: Access | undefined) {
  switch (access) {
    case undefined:
      return true;
    case "ri":
      return isRiMember(user);
    case "radiotherapy":
      return isRadiotherapyMember(user);
    case "patients":
      return canUsePatients(user);
  }
}

const PAGE_ACCESS: readonly { prefix: string; access: Access }[] = [
  { prefix: "/exam_order/", access: "ri" },
  { prefix: "/mo99-decay/", access: "ri" },
  { prefix: "/generator-elution/", access: "ri" },
  { prefix: "/treatment/", access: "radiotherapy" },
  { prefix: "/patient/", access: "patients" },
];

export function pageAllowed(pathname: string, user: Member) {
  const rule = PAGE_ACCESS.find(
    ({ prefix }) =>
      pathname === prefix.replace(/\/$/, "") || pathname.startsWith(prefix),
  );
  return hasAccess(user, rule?.access);
}
