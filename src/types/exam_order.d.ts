export interface ExamOrder {
  id: number;
  patient_db_id: number;
  exam_date: string;
  exam_time: string;
  exam_item: string;
  requesting_department: string;
  requesting_physician: string;
  created_at: string;
}

interface ExamOrderWithPatient {
  id: number;
  patient_id: string;
  last_name_kanji: string;
  first_name_kanji: string;
  last_name_kana: string;
  first_name_kana: string;
  height: number | null;
  weight: number | null;
  exam_date: string;
  exam_time: string;
  exam_item: string;
  birth_date: string;
  gender: "男" | "女";
  requesting_department: string;
  requesting_physician: string;
}
