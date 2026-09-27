import { Timestamp } from 'firebase/firestore';

export type UserRole = 'admin' | 'teacher' | 'student';

export interface User {
  uid: string;
  role: UserRole;
  displayName: string;
  email: string;
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
  examId: string;
  examTitle?: string;
  variantId?: string; // which sequence the student solved
  answers: Record<string, number>; // questionId -> optionIndex
  status: AttemptStatus;
  score?: number;
  totalQuestions?: number;
  startedAt: Date | Timestamp;
  finishedAt?: Date | Timestamp;
  violationReason?: string;
  isPreview?: boolean;
  expiresAt?: Date | Timestamp;
}
