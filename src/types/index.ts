import { Timestamp } from 'firebase/firestore';

export type UserRole = 'admin' | 'teacher' | 'student';

export interface User {
  uid: string;
  role: UserRole;
  displayName: string;
  email: string;
  fullName?: string;
  group?: string;
  expiresAt?: Date | Timestamp;
}

export interface Question {
  id: string;
  text: string;
  options: string[];
  correctOption: number;
  type: 'radio';
  expiresAt: Date | Timestamp;
}

export interface Exam {
  id: string;
  title: string;
  description?: string;
  timeLimit: number; // in minutes
  isPublished: boolean;
  totalVariants?: number;
  createdBy?: string;
  createdByName?: string;
  visibility?: 'listed' | 'link';
  shuffleQuestions?: boolean;
  shuffleOptions?: boolean;
  showAnswers?: boolean;
  passingPercent?: number | null;
  maxViolations?: number;
  proctoringEnabled?: boolean;
  createdAt: Date | Timestamp; // allow Firestore Timestamp
  expiresAt: Date | Timestamp;
}

export interface Variant {
  id: string;
  examId: string;
  expiresAt: Date | Timestamp;
}

export type AttemptStatus = 'in_progress' | 'completed' | 'flagged';

export interface Attempt {
  id: string;
  studentId: string;
  studentName?: string;
  studentEmail?: string;
  studentGroup?: string;
  examId: string;
  examTitle?: string;
  teacherId?: string | null;
  passingPercent?: number | null;
  seed?: number;
  variantId?: string; // which sequence the student solved
  answers: Record<string, number>; // questionId -> optionIndex
  status: AttemptStatus;
  score?: number;
  totalQuestions?: number;
  startedAt: Date | Timestamp;
  finishedAt?: Date | Timestamp;
  violationCount?: number;
  lastViolationAt?: Date | Timestamp;
  violationReason?: string;
  violations?: { reason: string; at: Date | Timestamp }[];
  resumeGraceOnce?: boolean; // set by teacher on reset: the next re-entry is not counted as a violation
  isPreview?: boolean;
  expiresAt?: Date | Timestamp;
}
