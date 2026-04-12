export interface Patient {
  id: number;
  patient_id: string;
  patient_type: string;
}

export interface ValidationResult {
  isValid: boolean;
  normalizedId: string;
  errorMessage: string;
}
