import { Timestamp } from 'firebase/firestore';

export type UserRole = 'admin' | 'teacher' | 'student';

/** Set by a user who asked to become a teacher; the admin approves (role -> teacher) or rejects. */
export type TeacherStatus = 'pending' | 'rejected';

export interface User {
  uid: string;
  role: UserRole;
  displayName: string;
  email: string;
  fullName?: string;
  group?: string;
  university?: string;
  /** Students: year of study (1-6). */
  course?: number;
  /** Teachers: department. */
  department?: string;
  teacherStatus?: TeacherStatus;
  /** Join codes of the groups this user belongs to (see Group). */
  groupIds?: string[];
  expiresAt?: Date | Timestamp;
}

/**
 * A class group owned by a teacher. The document id IS the join code
 * (8 chars, unambiguous alphabet), so knowing the code is what lets a student in.
 */
export interface Group {
  id: string;
  name: string;
  ownerId: string;
  ownerName?: string;
  createdAt: Date | Timestamp;
  archived?: boolean;
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
  /** Groups that can see/take this exam. Empty or missing = anyone with the link. */
  groupIds?: string[];
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
  groupIds?: string[];
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
