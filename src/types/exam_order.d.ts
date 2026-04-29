export interface ExamOrder {
  id: number;
  patient_db_id: number;
  exam_date: string;
  exam_time: string;
  requesting_department: string;
  created_at: string;
}
