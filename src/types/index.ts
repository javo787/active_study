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
  /** Ids of the groups this user belongs to (see Group). */
  groupIds?: string[];
  expiresAt?: Date | Timestamp;
}

/**
 * A class group owned by a teacher. Current groups have an automatic id and a separate join code
 * (joinCodes/{code} points back at the group). Legacy groups, created before that, use the 8-character
 * code as their id and have no joinCode field until their owner opens the groups page.
 */
export interface Group {
  id: string;
  name: string;
  ownerId: string;
  ownerName?: string;
  createdAt: Date | Timestamp;
  archived?: boolean;
  /** Present on current groups: the code students type (a joinCodes/{code} document points back here). */
  joinCode?: string;
  /** false = nobody can join, even with the code. Missing = open. */
  joinOpen?: boolean;
  description?: string;
  updatedAt?: Date | Timestamp;
}

/** groups/{groupId}/members/{uid} */
export interface GroupMember {
  uid: string;
  name: string;
  code?: string;
  joinedAt?: Date | Timestamp;
}

/** groups/{groupId}/removed/{uid}: blocks coming back until the owner deletes it. */
export interface RemovedMember {
  uid: string;
  name: string;
  at?: Date | Timestamp;
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
