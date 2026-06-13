export interface Patient {
  id: number;
  patient_id: string;
  patient_type: string;
  last_name_kanji: string;
  first_name_kanji: string;
  last_name_kana: string;
  first_name_kana: string;
  birth_date: string;
  height: number | null;
  weight: number | null;
  gender: "男" | "女" | "";
  created_at: string;
  updated_at: string;
}

export interface ValidationResult {
  isValid: boolean;
  normalizedId: string;
  errorMessage: string;
}
