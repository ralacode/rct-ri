import type { Patient } from "@/types/patient";

export interface ExamOrder {
  id: number;
  patient_db_id: number;
  exam_date: string;
  exam_time: string;
  exam_item: string;
  requesting_department: string;
  requesting_physician: string;
  dosage_mbq: number | null;
  dosage_ml: number | null;
  remain_mbq: number | null;
  remain_ml: number | null;
  created_at: string;
}

interface ExamOrderWithPatient {
  id: number;
  patient_id: Patient["patient_id"];
  last_name_kanji: Patient["last_name_kanji"];
  first_name_kanji: Patient["first_name_kanji"];
  last_name_kana: Patient["last_name_kana"];
  first_name_kana: Patient["first_name_kana"];
  height: Patient["height"];
  weight: Patient["weight"];
  exam_date: ExamOrder["exam_date"];
  exam_time: ExamOrder["exam_time"];
  exam_item: ExamOrder["exam_item"];
  birth_date: Patient["birth_date"];
  gender: Patient["gender"];
  requesting_department: ExamOrder["requesting_department"];
  requesting_physician: ExamOrder["requesting_physician"];
  dosage_mbq: ExamOrder["dosage_mbq"];
  dosage_ml: ExamOrder["dosage_ml"];
  remain_mbq: ExamOrder["remain_mbq"];
  remain_ml: ExamOrder["remain_ml"];
}
