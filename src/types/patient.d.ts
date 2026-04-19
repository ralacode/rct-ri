export interface Patient {
  id: number;
  patient_id: string;
  patient_type: string;
  last_name_kanji: string;
  first_name_kanji: string;
  last_name_kana: string;
  first_name_kana: string;
  birth_date: string;
  height: string;
  weight: string;
}

export interface ValidationResult {
  isValid: boolean;
  normalizedId: string;
  errorMessage: string;
}
