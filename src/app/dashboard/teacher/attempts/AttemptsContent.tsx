'use client';

import React, { useEffect, useState, useMemo, Fragment } from 'react';
import { useSearchParams } from 'next/navigation';
import { collection, query, where, getDocs, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Attempt, Exam, Group, Question, AttemptStatus } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'react-hot-toast';
import { toDate, toMillis } from '@/lib/time';
import { StatusBadge } from '@/components/StatusBadge';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatStrip } from '@/components/ui/StatStrip';
import { Segmented } from '@/components/ui/Segmented';
import { ResultBar } from '@/components/ui/ResultBar';
import { btnQuiet, field, fieldLabel, surface } from '@/components/ui/styles';
import { fetchAllGroups, fetchOwnedGroups } from '@/lib/groups';
import { attemptGroupLabels, groupFilterOptions, matchesGroupFilter } from '@/lib/attemptGroups';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { EmptyState } from '@/components/EmptyState';
import { Database, AlertCircle, Clock, Download, BarChart2 } from 'lucide-react';
import { format } from 'date-fns';

import { Timestamp } from 'firebase/firestore';

function formatDuration(start: Date | Timestamp | undefined | null, end: Date | Timestamp | undefined | null): string {
  const s = toDate(start);
  const e = toDate(end);
  if (!s || !e) return '—';
  const seconds = Math.max(0, Math.round((e.getTime() - s.getTime()) / 1000));
  const m = Math.floor(seconds / 60);
  const sec = seconds % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

// Attempts whose time limit has passed but that were never submitted (student closed the
// tab and never came back) stay "in_progress" forever. Close them here, scoring the answers
// that were auto-saved, so the teacher sees real results instead of a stale status.
const EXPIRY_GRACE_MS = 60 * 1000;

async function closeExpiredAttempts(allAttempts: Attempt[], exams: Exam[], now: number): Promise<Attempt[]> {
  const examMap = new Map(exams.map(e => [e.id, e]));

  const expired = allAttempts.filter(a => {
    if (a.status !== 'in_progress' || !a.variantId) return false;
    const exam = examMap.get(a.examId);
    const start = toMillis(a.startedAt);
    if (!exam?.timeLimit || !start) return false;
    return start + exam.timeLimit * 60000 + EXPIRY_GRACE_MS < now;
  });
  if (expired.length === 0) return allAttempts;

  // Load each distinct variant's questions once.
  const variantKeys = Array.from(new Set(expired.map(a => `${a.examId}/${a.variantId}`)));
  const questionsByVariant = new Map<string, Question[]>();
  await Promise.all(variantKeys.map(async key => {
    try {
      const snap = await getDocs(collection(db, `exams/${key}/questions`));
      questionsByVariant.set(key, snap.docs.map(d => ({ id: d.id, ...d.data() } as Question)));
    } catch (error) {
      console.error('Failed to load questions for', key, error);
    }
  }));

  const closed = new Map<string, Attempt>();
  await Promise.all(expired.map(async a => {
    const questions = questionsByVariant.get(`${a.examId}/${a.variantId}`);
    if (!questions) return;
    const exam = examMap.get(a.examId)!;
    const finishedMs = toMillis(a.startedAt)! + exam.timeLimit * 60000;
    const score = questions.filter(q => (a.answers || {})[q.id] === q.correctOption).length;
    try {
      await updateDoc(doc(db, 'attempts', a.id), {
        status: 'completed',
        finishedAt: Timestamp.fromMillis(finishedMs),
        score,
        totalQuestions: questions.length,
      });
      closed.set(a.id, { ...a, status: 'completed', finishedAt: Timestamp.fromMillis(finishedMs), score, totalQuestions: questions.length });
    } catch (error) {
      console.error('Failed to close expired attempt', a.id, error);
    }
  }));

  return allAttempts.map(a => closed.get(a.id) ?? a);
}

export function AttemptsContent() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const initialExamId = searchParams.get('exam') || '';
  const initialStatus = (searchParams.get('status') as AttemptStatus | '') || '';

  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [groupList, setGroupList] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [selectedExam, setSelectedExam] = useState<string>(initialExamId);
  const [selectedGroup, setSelectedGroup] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<AttemptStatus | ''>(initialStatus);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'score' | 'fastest'>('newest');

  // Question Details
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [questionDetails, setQuestionDetails] = useState<Record<string, Question[]>>({});
  const [loadingDetails, setLoadingDetails] = useState<string | null>(null);

  // Dialogs
  const [deleteDialog, setDeleteDialog] = useState<{isOpen: boolean, attemptId: string}>({isOpen: false, attemptId: ''});

  // Question Analysis
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<{questionId: string, text: string, correctRate: number, totalAnswers: number, correctAnswers: number}[] | null>(null);

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      // Build Queries
      const examsQ = user.role === 'admin'
        ? query(collection(db, 'exams'))
        : query(collection(db, 'exams'), where('createdBy', '==', user.uid));

      const attemptsRef = collection(db, 'attempts');
      let attemptsQ = query(attemptsRef);
      if (user.role !== 'admin') {
         attemptsQ = query(attemptsRef, where('teacherId', '==', user.uid));
      }

      // Fetch Data
      // Group names are a nicety: if they cannot be loaded the page still shows every attempt.
      const groupsPromise = (user.role === 'admin' ? fetchAllGroups() : fetchOwnedGroups(user.uid)).catch(() => [] as Group[]);
      const [examsSnap, attemptsSnap, groupsData] = await Promise.all([
        getDocs(examsQ),
        getDocs(attemptsQ),
        groupsPromise,
      ]);
      setGroupList(groupsData);

      const examsData = examsSnap.docs.map(d => ({ ...d.data(), id: d.id } as Exam));
      setExams(examsData);
      const now = Date.now();

      const allAttempts = attemptsSnap.docs
        .map(d => ({ ...d.data(), id: d.id } as Attempt))
        .filter(a => !a.isPreview)
        .filter(a => {
           const expMs = toMillis(a.expiresAt);
           return !expMs || expMs > now;
        });

      setAttempts(allAttempts);
      // Close timed-out attempts in the background and refresh the list when done.
      closeExpiredAttempts(allAttempts, examsData, now)
        .then(updated => { if (updated !== allAttempts) setAttempts(updated); })
        .catch(error => console.error('Failed to close expired attempts:', error));
    } catch (error) {
      console.error('Failed to fetch data:', error);
      toast.error('Failed to load attempts data.');
    } finally {
      setLoading(false);
    }
  };

  const nameById = useMemo(() => new Map(groupList.map(g => [g.id, g.name])), [groupList]);
  const groupOptions = useMemo(() => groupFilterOptions(attempts, groupList), [attempts, groupList]);

  // How many attempts each status would show with the other filters applied: "Flagged 2" tells the teacher where to look.
  const statusCounts = useMemo(() => {
    const q = searchQuery.toLowerCase();
    const base = attempts.filter(a =>
      (!selectedExam || a.examId === selectedExam) &&
      matchesGroupFilter(a, selectedGroup) &&
      (!q || (a.studentName || '').toLowerCase().includes(q) || (a.studentEmail || '').toLowerCase().includes(q)));
    return {
      all: base.length,
      in_progress: base.filter(a => a.status === 'in_progress').length,
      completed: base.filter(a => a.status === 'completed').length,
      flagged: base.filter(a => a.status === 'flagged').length,
    };
  }, [attempts, selectedExam, selectedGroup, searchQuery]);

  const filteredAttempts = useMemo(() => {
    return attempts.filter(a => {
      if (selectedExam && a.examId !== selectedExam) return false;
      if (!matchesGroupFilter(a, selectedGroup)) return false;
      if (selectedStatus && a.status !== selectedStatus) return false;
      if (searchQuery) {
         const q = searchQuery.toLowerCase();
         const matchName = (a.studentName || '').toLowerCase().includes(q);
         const matchEmail = (a.studentEmail || '').toLowerCase().includes(q);
         if (!matchName && !matchEmail) return false;
      }
      return true;
    }).sort((a, b) => {
      if (sortBy === 'newest') {
        return (toMillis(b.startedAt) || 0) - (toMillis(a.startedAt) || 0);
      } else if (sortBy === 'score') {
        const scoreA = a.score !== undefined ? (a.score / (a.totalQuestions || 1)) : -1;
        const scoreB = b.score !== undefined ? (b.score / (b.totalQuestions || 1)) : -1;
        return scoreB - scoreA;
      } else if (sortBy === 'fastest') {
        const durationA = toMillis(a.finishedAt) && toMillis(a.startedAt) ? toMillis(a.finishedAt)! - toMillis(a.startedAt)! : Infinity;
        const durationB = toMillis(b.finishedAt) && toMillis(b.startedAt) ? toMillis(b.finishedAt)! - toMillis(b.startedAt)! : Infinity;
        return durationA - durationB;
      }
      return 0;
    });
  }, [attempts, selectedExam, selectedGroup, selectedStatus, searchQuery, sortBy]);

  // Summaries
  const summaries = useMemo(() => {
    const completed = filteredAttempts.filter(a => a.status === 'completed');

    let totalScorePercent = 0;
    let passingCount = 0;
    let attemptsWithPassCriteria = 0;
    let totalDurationSeconds = 0;
    let completedWithDuration = 0;

    completed.forEach(a => {
      if (a.score !== undefined && a.totalQuestions) {
         totalScorePercent += (a.score / a.totalQuestions) * 100;
      }
      if (a.passingPercent !== undefined && a.passingPercent !== null) {
         attemptsWithPassCriteria++;
         if (a.score !== undefined && a.totalQuestions && ((a.score / a.totalQuestions) * 100) >= a.passingPercent) {
             passingCount++;
         }
      }

      const start = toMillis(a.startedAt);
      const end = toMillis(a.finishedAt);
      if (start && end) {
         totalDurationSeconds += (end - start) / 1000;
         completedWithDuration++;
      }
    });

    const avgScore = completed.length > 0 ? Math.round(totalScorePercent / completed.length) : 0;
    const avgTime = completedWithDuration > 0 ? Math.round(totalDurationSeconds / completedWithDuration) : 0;
    const passRate = attemptsWithPassCriteria > 0 ? Math.round((passingCount / attemptsWithPassCriteria) * 100) : null;

    return {
      total: filteredAttempts.length,
      completed: completed.length,
      avgScore,
      avgTime,
      passRate
    };
  }, [filteredAttempts]);

  const handleResetAttempt = async (attemptId: string) => {
    try {
      await updateDoc(doc(db, 'attempts', attemptId), {
        status: 'in_progress',
        violationReason: '',
        violationCount: 0,
        resumeGraceOnce: true
      });
      setAttempts(attempts.map(a => a.id === attemptId ? { ...a, status: 'in_progress', violationReason: '', violationCount: 0, resumeGraceOnce: true } : a));
      toast.success('Attempt reset successfully.');
    } catch (error) {
      console.error('Error resetting attempt:', error);
      toast.error('Failed to reset attempt.');
    }
  };

  const handleDeleteAttempt = async () => {
    const attemptId = deleteDialog.attemptId;
    setDeleteDialog({isOpen: false, attemptId: ''});
    if (!attemptId) return;

    try {
      await deleteDoc(doc(db, 'attempts', attemptId));
      setAttempts(attempts.filter(a => a.id !== attemptId));
      toast.success('Attempt deleted to allow retake.');
    } catch (error) {
      console.error('Error deleting attempt:', error);
      toast.error('Failed to allow retake.');
    }
  };

  const handleAllowRetake = async (attemptId: string) => {
    if (!confirm('Delete this attempt so the student can take the exam again? This cannot be undone.')) return;
    try {
      await deleteDoc(doc(db, 'attempts', attemptId));
      setAttempts(attempts.filter(a => a.id !== attemptId));
      toast.success('Attempt cleared — the student can start again.');
    } catch (error) {
      console.error(error);
      toast.error('Failed to clear attempt.');
    }
  };

  const toggleDetails = async (a: Attempt) => {
    if (expandedId === a.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(a.id);
    if (!questionDetails[a.id] && a.variantId) {
      setLoadingDetails(a.id);
      try {
        const qSnap = await getDocs(collection(db, `exams/${a.examId}/variants/${a.variantId}/questions`));
        const qs = qSnap.docs.map(d => ({ id: d.id, ...d.data() } as Question));
        setQuestionDetails(prev => ({ ...prev, [a.id]: qs }));
      } catch (error) {
        console.error('Failed to fetch question details:', error);
        toast.error('Failed to load question details.');
      } finally {
        setLoadingDetails(null);
      }
    }
  };

  const exportCSV = () => {
    const BOM = '\uFEFF';
    const header = ['Student', 'Email', 'Group', 'Exam', 'Score', 'Total', 'Percent', 'Time', 'Status', 'Warnings', 'Started'].join(';');

    const escapeCell = (value: string | number) => {
      let strValue = String(value);
      if (/^[=+\-@\t\r]/.test(strValue)) {
        strValue = "'" + strValue;
      }
      return `"${strValue.replace(/"/g, '""')}"`;
    };

    const rows = filteredAttempts.map(a => {
      const started = toDate(a.startedAt);
      const score = a.score !== undefined ? a.score : '';
      const total = a.totalQuestions !== undefined ? a.totalQuestions : '';
      const percent = score !== '' && total !== '' ? Math.round((Number(score) / Number(total)) * 100) + '%' : '';
      const time = formatDuration(a.startedAt, a.finishedAt);

      return [
        a.studentName || 'Unknown',
        a.studentEmail || '',
        attemptGroupLabels(a, nameById).join(', '),
        a.examTitle || a.examId,
        score,
        total,
        percent,
        time,
        a.status,
        a.violationCount || 0,
        started ? format(started, 'dd.MM.yyyy HH:mm') : ''
      ].map(escapeCell).join(';');
    });

    const csvContent = BOM + [header, ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const examName = selectedExam ? exams.find(e => e.id === selectedExam)?.title?.replace(/[^a-z0-9]/gi, '_').toLowerCase() : 'all';
    const dateStr = format(new Date(), 'yyyy-MM-dd');
    const filename = `results-${examName || 'export'}-${dateStr}.csv`;

    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const runQuestionAnalysis = async () => {
    if (!selectedExam) {
      toast.error('Please select an exam first to run analysis.');
      return;
    }

    const completedForExam = filteredAttempts.filter(a => a.examId === selectedExam && a.status === 'completed' && a.variantId);
    if (completedForExam.length === 0) {
      toast.error('No completed attempts found for this exam in the current filter.');
      return;
    }

    setAnalyzing(true);
    setAnalysisResult(null);
    try {
      // 1. Gather all variant IDs
      const variantIds = Array.from(new Set(completedForExam.map(a => a.variantId!)));

      // 2. Fetch all questions for all used variants
      const questionsMap = new Map<string, Question>(); // questionId -> Question
      for (const vid of variantIds) {
        const qSnap = await getDocs(collection(db, `exams/${selectedExam}/variants/${vid}/questions`));
        qSnap.docs.forEach(d => {
          if (!questionsMap.has(d.id)) {
            questionsMap.set(d.id, { id: d.id, ...d.data() } as Question);
          }
        });
      }

      // 3. Compute stats per question
      const stats = new Map<string, { total: number, correct: number }>();

      completedForExam.forEach(attempt => {
         if (!attempt.answers) return;
         for (const [qId, chosenIdx] of Object.entries(attempt.answers)) {
            const q = questionsMap.get(qId);
            if (!q) continue; // Question might have been deleted

            if (!stats.has(qId)) {
               stats.set(qId, { total: 0, correct: 0 });
            }

            const s = stats.get(qId)!;
            s.total += 1;
            if (chosenIdx === q.correctOption) {
               s.correct += 1;
            }
         }
      });

      // 4. Format and sort results (hardest first, i.e., lowest correct rate)
      const results = Array.from(stats.entries()).map(([qId, s]) => {
         const q = questionsMap.get(qId)!;
         const rate = s.total > 0 ? (s.correct / s.total) * 100 : 0;
         return {
           questionId: qId,
           text: q.text,
           totalAnswers: s.total,
           correctAnswers: s.correct,
           correctRate: Math.round(rate)
         };
      }).sort((a, b) => a.correctRate - b.correctRate);

      setAnalysisResult(results);
    } catch (error) {
      console.error('Failed to analyze questions:', error);
      toast.error('Failed to run question analysis.');
    } finally {
      setAnalyzing(false);
    }
  };

  if (loading) {
    return <div className="animate-pulse space-y-4">
      <div className="h-8 bg-slate-200 rounded w-1/4"></div>
      <div className="h-32 bg-slate-200 rounded"></div>
    </div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Attempts"
        description="Every attempt at your exams. The filters apply to the list, the numbers and the CSV export alike."
        actions={
          <>
            <button onClick={exportCSV} className={`${btnQuiet} flex-1 sm:flex-none`}>
              <Download className="w-4 h-4" /> Export CSV
            </button>
            <button onClick={fetchData} className={`${btnQuiet} flex-1 sm:flex-none`}>Refresh</button>
          </>
        }
      />

      <StatStrip
        stats={[
          { label: 'Attempts', value: summaries.total },
          { label: 'Completed', value: summaries.completed },
          { label: 'Average score', value: `${summaries.avgScore}%` },
          { label: 'Average time', value: `${Math.floor(summaries.avgTime / 60)}m ${summaries.avgTime % 60}s` },
          { label: 'Pass rate', value: summaries.passRate !== null ? `${summaries.passRate}%` : '—', note: summaries.passRate === null ? 'No pass line set' : undefined },
        ]}
      />

      <section aria-label="Filters" className={`${surface} p-4 space-y-4`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Segmented<AttemptStatus | ''>
            label="Status"
            value={selectedStatus}
            onChange={setSelectedStatus}
            options={[
              { value: '', label: 'All', count: statusCounts.all },
              { value: 'in_progress', label: 'In progress', count: statusCounts.in_progress },
              { value: 'completed', label: 'Completed', count: statusCounts.completed },
              { value: 'flagged', label: 'Flagged', count: statusCounts.flagged },
            ]}
          />
          {selectedExam && (
            <button
              onClick={runQuestionAnalysis}
              disabled={analyzing}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 min-h-[44px] disabled:opacity-50"
            >
              <BarChart2 className="w-4 h-4" />
              {analyzing ? 'Analyzing...' : 'Find the hardest questions'}
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label htmlFor="filter-exam" className={fieldLabel}>Exam</label>
            <select id="filter-exam" value={selectedExam} onChange={e => setSelectedExam(e.target.value)} className={field}>
              <option value="">All exams</option>
              {exams.map(e => <option key={e.id} value={e.id}>{e.title}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="filter-group" className={fieldLabel}>Group</label>
            <select id="filter-group" value={selectedGroup} onChange={e => setSelectedGroup(e.target.value)} className={field}>
              <option value="">All groups</option>
              {groupOptions.groups.length > 0 && (
                <optgroup label="Groups">
                  {groupOptions.groups.map(g => <option key={g.value} value={g.value}>{g.label} ({g.count})</option>)}
                </optgroup>
              )}
              {groupOptions.legacy.length > 0 && (
                <optgroup label="Typed in the profile (older attempts)">
                  {groupOptions.legacy.map(g => <option key={g.value} value={g.value}>{g.label} ({g.count})</option>)}
                </optgroup>
              )}
            </select>
          </div>
          <div>
            <label htmlFor="filter-search" className={fieldLabel}>Student</label>
            <input id="filter-search" type="search" placeholder="Name or email" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className={field} />
          </div>
          <div>
            <label htmlFor="filter-sort" className={fieldLabel}>Order</label>
            <select id="filter-sort" value={sortBy} onChange={e => setSortBy(e.target.value as "newest" | "score" | "fastest")} className={field}>
              <option value="newest">Newest first</option>
              <option value="score">Highest score first</option>
              <option value="fastest">Fastest first</option>
            </select>
          </div>
        </div>
      </section>

      {analysisResult && (
        <div className={`${surface} p-4`}>
          <div className="flex justify-between items-center mb-4">
             <h3 className="text-lg font-semibold text-ink">Hardest questions first</h3>
             <button onClick={() => setAnalysisResult(null)} className="text-sm text-slate-500 hover:text-slate-700">Close</button>
          </div>

          {analysisResult.length === 0 ? (
            <p className="text-sm text-slate-500">No question data could be analyzed.</p>
          ) : (
            <div className="space-y-4 max-h-96 overflow-y-auto pr-2">
               {analysisResult.map((res, idx) => (
                  <div key={res.questionId} className="text-sm">
                    <p className="font-medium text-slate-800 mb-1">{idx + 1}. {res.text}</p>
                    <div className="flex items-center gap-3">
                       <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${res.correctRate < 40 ? 'bg-red-500' : res.correctRate < 70 ? 'bg-amber-500' : 'bg-green-500'}`}
                            style={{ width: `${res.correctRate}%` }}
                          />
                       </div>
                       <span className="text-xs font-medium w-32 text-right">
                         {res.correctRate}% ({res.correctAnswers}/{res.totalAnswers})
                       </span>
                    </div>
                  </div>
               ))}
            </div>
          )}
        </div>
      )}

      <div className={`${surface} overflow-hidden`}>
        {filteredAttempts.length === 0 ? (
          <EmptyState
            icon={Database}
            title="No attempts found"
            description="Adjust your filters or wait for students to take exams."
          />
        ) : (
          <div className="overflow-x-auto">
            {/* Desktop Table */}
            <table className="min-w-full divide-y divide-slate-100 hidden md:table">
              <thead className="bg-slate-50/70">
                <tr>
                  <th className="px-3 py-3 text-left text-xs font-medium text-slate-500">Student</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-slate-500">Exam</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-slate-500">Result</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-slate-500">Time</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-slate-500">Status</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-slate-500"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-100">
                {filteredAttempts.map(a => {
                  const startedDate = toDate(a.startedAt);
                  const isPassed = a.passingPercent !== undefined && a.passingPercent !== null && a.score !== undefined && a.totalQuestions
                                  ? (a.score / a.totalQuestions) * 100 >= a.passingPercent
                                  : null;

                  return (
                  <Fragment key={a.id}>
                    <tr>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <div className="text-sm font-medium text-ink">{a.studentName || 'Unknown'}</div>
                        <div className="text-sm text-slate-500">{a.studentEmail}</div>
                        {attemptGroupLabels(a, nameById).length > 0 && (
                          <div className="text-xs text-slate-500 mt-0.5">{attemptGroupLabels(a, nameById).join(', ')}</div>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <div className="text-sm text-slate-900 line-clamp-2 max-w-xs">{a.examTitle || a.examId}</div>
                        <div className="text-xs text-slate-500 mt-1">{startedDate ? format(startedDate, 'dd.MM HH:mm') : ''}</div>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        {a.score !== undefined && a.totalQuestions ? (
                          <div className="w-32 tnum">
                            <div className="flex items-baseline justify-between gap-2">
                              <span className={`text-sm font-semibold ${isPassed === true ? 'text-pass' : isPassed === false ? 'text-short' : 'text-ink'}`}>
                                {Math.round((a.score / a.totalQuestions) * 100)}%
                              </span>
                              <span className="text-xs text-slate-500">{a.score}/{a.totalQuestions}</span>
                            </div>
                            <div className="mt-1.5">
                              <ResultBar percent={Math.round((a.score / a.totalQuestions) * 100)} passingPercent={a.passingPercent} />
                            </div>
                          </div>
                        ) : (
                          <span className="text-sm text-slate-500">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-sm text-slate-500 tnum">
                        {formatDuration(a.startedAt, a.finishedAt)}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <StatusBadge status={a.status} />
                        {(a.violationCount || 0) > 0 && (
                          <div className="mt-1 flex items-center text-xs text-flag" title={a.violationReason}>
                            <AlertCircle className="w-3 h-3 mr-1" />
                            {a.violationCount} warnings
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3 text-sm font-medium"><div className="flex flex-col items-start gap-1 whitespace-nowrap">
                        <button onClick={() => toggleDetails(a)} className="text-slate-600 hover:text-slate-900 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 rounded">
                          {expandedId === a.id ? 'Hide details' : 'Details'}
                        </button>
                        {a.status === 'flagged' && (
                          <button onClick={() => handleResetAttempt(a.id)} className="text-blue-600 hover:text-blue-900 hover:underline">Reset</button>
                        )}
                        <button onClick={() => handleAllowRetake(a.id)} className="text-slate-600 hover:text-slate-900 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 rounded">
                           Allow retake
                        </button>
                        </div>
                      </td>
                    </tr>
                    {expandedId === a.id && (
                      <tr>
                        <td colSpan={6} className="px-6 py-4 bg-slate-50 border-b border-slate-200 shadow-inner">
                          {loadingDetails === a.id && <div className="text-sm text-slate-500">Loading questions...</div>}

                          {a.violations && a.violations.length > 0 && (
                            <div className="mb-4 bg-red-50 border border-red-200 rounded-md p-3 max-w-4xl">
                              <h4 className="font-medium text-red-800 mb-2 text-sm flex items-center gap-1"><AlertCircle className="w-4 h-4"/> Violation log</h4>
                              <ul className="text-xs text-red-700 space-y-1 pl-5 list-disc">
                                {a.violations.map((v, i) => {
                                  const vDate = toDate(v.at);
                                  return (
                                    <li key={i}>
                                      {vDate ? format(vDate, 'HH:mm') : ''} — {v.reason}
                                    </li>
                                  );
                                })}
                              </ul>
                            </div>
                          )}

                          {questionDetails[a.id] && questionDetails[a.id].length > 0 && (
                            <div className="space-y-4 max-w-4xl">
                              {questionDetails[a.id].map((q, idx) => {
                                const chosen = a.answers?.[q.id];
                                const isCorrect = chosen === q.correctOption;
                                return (
                                  <div key={q.id} className="text-sm bg-white p-3 rounded border border-slate-200">
                                    <p className="font-medium text-slate-800 mb-2">{idx + 1}. {q.text}</p>
                                    <p className={`font-medium ${isCorrect ? 'text-green-700' : 'text-red-700'}`}>
                                      Answered: {chosen !== undefined ? q.options[chosen] : '(no answer)'}
                                      {isCorrect ? ' ✓' : ` ✗ (Correct: ${q.options[q.correctOption]})`}
                                    </p>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                          {!loadingDetails && (!questionDetails[a.id] || questionDetails[a.id].length === 0) && (
                            <div className="text-sm text-slate-500">Question details are no longer available.</div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                  );
                })}
              </tbody>
            </table>

            {/* Mobile Cards */}
            <div className="md:hidden divide-y divide-slate-100">
               {filteredAttempts.map(a => {
                  const startedDate = toDate(a.startedAt);
                  const isPassed = a.passingPercent !== undefined && a.passingPercent !== null && a.score !== undefined && a.totalQuestions
                                  ? (a.score / a.totalQuestions) * 100 >= a.passingPercent
                                  : null;

                  return (
                    <div key={a.id} className="p-4 bg-white space-y-3">
                       <div className="flex justify-between items-start">
                          <div>
                            <div className="font-medium text-ink">{a.studentName || 'Unknown'}</div>
                            <div className="text-xs text-slate-500">{a.studentEmail}</div>
                            {attemptGroupLabels(a, nameById).length > 0 && (
                              <div className="text-xs text-slate-500 mt-0.5">{attemptGroupLabels(a, nameById).join(', ')}</div>
                            )}
                          </div>
                          <StatusBadge status={a.status} />
                       </div>

                       <div>
                         <div className="text-sm text-slate-800 line-clamp-1">{a.examTitle || a.examId}</div>
                         <div className="text-xs text-slate-500 mt-0.5">{startedDate ? format(startedDate, 'dd.MM HH:mm') : ''}</div>
                       </div>

                       <div className="flex justify-between items-center gap-4 text-sm border-t border-slate-100 pt-2">
                         <div className="flex-1 tnum">
                            {a.score !== undefined && a.totalQuestions ? (
                              <>
                                <div className="flex items-baseline justify-between gap-2">
                                  <span className={`font-semibold ${isPassed === true ? 'text-pass' : isPassed === false ? 'text-short' : 'text-ink'}`}>
                                    {Math.round((a.score / a.totalQuestions) * 100)}%
                                  </span>
                                  <span className="text-xs text-slate-500">{a.score}/{a.totalQuestions}</span>
                                </div>
                                <div className="mt-1.5 max-w-[200px]">
                                  <ResultBar percent={Math.round((a.score / a.totalQuestions) * 100)} passingPercent={a.passingPercent} />
                                </div>
                              </>
                            ) : (
                              <span className="text-slate-500">No result yet</span>
                            )}
                         </div>
                         <div className="flex items-center text-slate-500">
                           <Clock className="w-4 h-4 mr-1" />
                           {formatDuration(a.startedAt, a.finishedAt)}
                         </div>
                       </div>

                       {(a.violationCount || 0) > 0 && (
                          <div className="flex items-center text-xs text-red-500" title={a.violationReason}>
                            <AlertCircle className="w-3 h-3 mr-1" />
                            {a.violationCount} warnings: {a.violationReason}
                          </div>
                        )}

                       <div className="flex flex-wrap gap-2 pt-2">
                         <button onClick={() => toggleDetails(a)} className="flex-1 min-h-[44px] bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md text-sm font-medium">
                           {expandedId === a.id ? 'Hide Details' : 'Details'}
                         </button>
                         {a.status === 'flagged' && (
                           <button onClick={() => handleResetAttempt(a.id)} className="flex-1 min-h-[44px] bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-md text-sm font-medium">
                             Reset
                           </button>
                         )}
                         <button onClick={() => handleAllowRetake(a.id)} className="flex-1 min-h-[44px] bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md text-sm font-medium">
                            Allow retake
                         </button>
                       </div>

                       {expandedId === a.id && (
                        <div className="mt-3 p-3 bg-slate-50 rounded-md border border-slate-100">
                          {loadingDetails === a.id && <div className="text-sm text-slate-500">Loading questions...</div>}

                          {a.violations && a.violations.length > 0 && (
                            <div className="mb-4 bg-red-50 border border-red-200 rounded-md p-3">
                              <h4 className="font-medium text-red-800 mb-2 text-sm flex items-center gap-1"><AlertCircle className="w-4 h-4"/> Violation log</h4>
                              <ul className="text-xs text-red-700 space-y-1 pl-5 list-disc">
                                {a.violations.map((v, i) => {
                                  const vDate = toDate(v.at);
                                  return (
                                    <li key={i}>
                                      {vDate ? format(vDate, 'HH:mm') : ''} — {v.reason}
                                    </li>
                                  );
                                })}
                              </ul>
                            </div>
                          )}

                          {questionDetails[a.id] && questionDetails[a.id].length > 0 && (
                            <div className="space-y-3">
                              {questionDetails[a.id].map((q, idx) => {
                                const chosen = a.answers?.[q.id];
                                const isCorrect = chosen === q.correctOption;
                                return (
                                  <div key={q.id} className="text-sm">
                                    <p className="font-medium text-slate-800 mb-1">{idx + 1}. {q.text}</p>
                                    <p className={`font-medium text-xs ${isCorrect ? 'text-green-700' : 'text-red-700'}`}>
                                      Answered: {chosen !== undefined ? q.options[chosen] : '(no answer)'}
                                      {isCorrect ? ' ✓' : ` ✗ (Correct: ${q.options[q.correctOption]})`}
                                    </p>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                          {!loadingDetails && (!questionDetails[a.id] || questionDetails[a.id].length === 0) && (
                            <div className="text-sm text-slate-500">Question details are no longer available.</div>
                          )}
                        </div>
                      )}
                    </div>
                  );
               })}
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        isOpen={deleteDialog.isOpen}
        title="Allow Retake"
        message="This will delete the student's current attempt, allowing them to start over. This action cannot be undone."
        confirmText="Allow Retake"
        isDestructive={true}
        onConfirm={handleDeleteAttempt}
        onCancel={() => setDeleteDialog({isOpen: false, attemptId: ''})}
      />
    </div>
  );
}
