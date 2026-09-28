'use client';

import React, { useEffect, useState, useMemo, Fragment } from 'react';
import { useSearchParams } from 'next/navigation';
import { collection, query, where, getDocs, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Attempt, Exam, Question, AttemptStatus } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'react-hot-toast';
import { toDate, toMillis } from '@/lib/time';
import { StatusBadge } from '@/components/StatusBadge';
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

export function AttemptsContent() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const initialExamId = searchParams.get('exam') || '';
  const initialStatus = (searchParams.get('status') as AttemptStatus | '') || '';

  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
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
      // Fetch exams for filter options
      const examsQ = user.role === 'admin'
        ? query(collection(db, 'exams'))
        : query(collection(db, 'exams'), where('createdBy', '==', user.uid));
      const examsSnap = await getDocs(examsQ);
      const examsData = examsSnap.docs.map(d => ({ ...d.data(), id: d.id } as Exam));
      setExams(examsData);

      // Fetch attempts
      const attemptsRef = collection(db, 'attempts');
      let attemptsQ = query(attemptsRef);

      if (user.role !== 'admin') {
         attemptsQ = query(attemptsRef, where('teacherId', '==', user.uid));
      }

      const attemptsSnap = await getDocs(attemptsQ);
      const now = Date.now();

      const allAttempts = attemptsSnap.docs
        .map(d => ({ ...d.data(), id: d.id } as Attempt))
        .filter(a => !a.isPreview)
        .filter(a => {
           const expMs = toMillis(a.expiresAt);
           return !expMs || expMs > now;
        });

      setAttempts(allAttempts);
    } catch (error) {
      console.error('Failed to fetch data:', error);
      toast.error('Failed to load attempts data.');
    } finally {
      setLoading(false);
    }
  };

  const groups = useMemo(() => {
    const groupSet = new Set<string>();
    attempts.forEach(a => {
      if (a.studentGroup) groupSet.add(a.studentGroup);
    });
    return Array.from(groupSet).sort();
  }, [attempts]);

  const filteredAttempts = useMemo(() => {
    return attempts.filter(a => {
      if (selectedExam && a.examId !== selectedExam) return false;
      if (selectedGroup && a.studentGroup !== selectedGroup) return false;
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
        violationCount: 0
      });
      setAttempts(attempts.map(a => a.id === attemptId ? { ...a, status: 'in_progress', violationReason: '', violationCount: 0 } : a));
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

    const rows = filteredAttempts.map(a => {
      const started = toDate(a.startedAt);
      const score = a.score !== undefined ? a.score : '';
      const total = a.totalQuestions !== undefined ? a.totalQuestions : '';
      const percent = score !== '' && total !== '' ? Math.round((Number(score) / Number(total)) * 100) + '%' : '';
      const time = formatDuration(a.startedAt, a.finishedAt);

      return [
        `"${(a.studentName || '').replace(/"/g, '""')}"`,
        `"${(a.studentEmail || '').replace(/"/g, '""')}"`,
        `"${(a.studentGroup || '').replace(/"/g, '""')}"`,
        `"${(a.examTitle || a.examId).replace(/"/g, '""')}"`,
        score,
        total,
        `"${percent}"`,
        `"${time}"`,
        a.status,
        a.violationCount || 0,
        `"${started ? format(started, 'dd.MM.yyyy HH:mm') : ''}"`
      ].join(';');
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
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h2 className="text-2xl font-bold text-slate-800">Attempts Overview</h2>
        <div className="flex gap-2 w-full sm:w-auto">
          <button onClick={exportCSV} className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 text-sm text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 min-h-[44px]">
             <Download className="w-4 h-4" /> Export CSV
          </button>
          <button onClick={fetchData} className="flex-1 sm:flex-none px-4 py-2 text-sm text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 min-h-[44px]">
            Refresh
          </button>
        </div>
      </div>

      <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Exam</label>
            <select value={selectedExam} onChange={e => setSelectedExam(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm min-h-[44px] bg-white">
              <option value="">All Exams</option>
              {exams.map(e => <option key={e.id} value={e.id}>{e.title}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Group</label>
            <select value={selectedGroup} onChange={e => setSelectedGroup(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm min-h-[44px] bg-white">
              <option value="">All Groups</option>
              {groups.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Status</label>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setSelectedStatus('')} className={`px-3 py-1.5 rounded-full text-xs font-medium border ${selectedStatus === '' ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'} min-h-[44px]`}>All</button>
              <button onClick={() => setSelectedStatus('in_progress')} className={`px-3 py-1.5 rounded-full text-xs font-medium border ${selectedStatus === 'in_progress' ? 'bg-amber-100 text-amber-800 border-amber-200' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'} min-h-[44px]`}>In Progress</button>
              <button onClick={() => setSelectedStatus('completed')} className={`px-3 py-1.5 rounded-full text-xs font-medium border ${selectedStatus === 'completed' ? 'bg-green-100 text-green-800 border-green-200' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'} min-h-[44px]`}>Completed</button>
              <button onClick={() => setSelectedStatus('flagged')} className={`px-3 py-1.5 rounded-full text-xs font-medium border ${selectedStatus === 'flagged' ? 'bg-red-100 text-red-800 border-red-200' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'} min-h-[44px]`}>Flagged</button>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Search</label>
            <input type="text" placeholder="Name or email..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm min-h-[44px]" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Sort By</label>
            <select value={sortBy} onChange={e => setSortBy(e.target.value as "newest" | "score" | "fastest")} className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm min-h-[44px] bg-white">
              <option value="newest">Newest First</option>
              <option value="score">Score (High to Low)</option>
              <option value="fastest">Fastest Time</option>
            </select>
          </div>
        </div>

        {selectedExam && (
          <div className="pt-4 border-t border-slate-100">
             <button
                onClick={runQuestionAnalysis}
                disabled={analyzing}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 min-h-[44px] disabled:opacity-50"
             >
                <BarChart2 className="w-4 h-4" />
                {analyzing ? 'Analyzing...' : 'Analyze Questions (Hardest First)'}
             </button>
          </div>
        )}
      </div>

      {analysisResult && (
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4">
          <div className="flex justify-between items-center mb-4">
             <h3 className="text-lg font-bold text-slate-800">Question Analysis</h3>
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

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
          <p className="text-xs text-slate-500 uppercase tracking-wide">Total Attempts</p>
          <p className="text-2xl font-bold text-slate-800">{summaries.total}</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
          <p className="text-xs text-slate-500 uppercase tracking-wide">Completed</p>
          <p className="text-2xl font-bold text-slate-800">{summaries.completed}</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
          <p className="text-xs text-slate-500 uppercase tracking-wide">Avg Score</p>
          <p className="text-2xl font-bold text-slate-800">{summaries.avgScore}%</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
          <p className="text-xs text-slate-500 uppercase tracking-wide">Avg Time</p>
          <p className="text-2xl font-bold text-slate-800">{Math.floor(summaries.avgTime / 60)}m {summaries.avgTime % 60}s</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
          <p className="text-xs text-slate-500 uppercase tracking-wide">Pass Rate</p>
          <p className="text-2xl font-bold text-slate-800">{summaries.passRate !== null ? `${summaries.passRate}%` : '—'}</p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
        {filteredAttempts.length === 0 ? (
          <EmptyState
            icon={Database}
            title="No attempts found"
            description="Adjust your filters or wait for students to take exams."
          />
        ) : (
          <div className="overflow-x-auto">
            {/* Desktop Table */}
            <table className="min-w-full divide-y divide-slate-200 hidden md:table">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Student</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Exam</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Score</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Time Taken</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-200">
                {filteredAttempts.map(a => {
                  const startedDate = toDate(a.startedAt);
                  const isPassed = a.passingPercent !== undefined && a.passingPercent !== null && a.score !== undefined && a.totalQuestions
                                  ? (a.score / a.totalQuestions) * 100 >= a.passingPercent
                                  : null;

                  return (
                  <Fragment key={a.id}>
                    <tr>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-slate-900">{a.studentName || 'Unknown'}</div>
                        <div className="text-sm text-slate-500">{a.studentEmail}</div>
                        {a.studentGroup && <div className="text-xs text-slate-400 mt-1">Group: {a.studentGroup}</div>}
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-slate-900 line-clamp-2 max-w-xs">{a.examTitle || a.examId}</div>
                        <div className="text-xs text-slate-500 mt-1">{startedDate ? format(startedDate, 'dd.MM HH:mm') : ''}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {a.score !== undefined && a.totalQuestions ? (
                          <div className={`text-sm font-medium ${isPassed === true ? 'text-green-600' : isPassed === false ? 'text-red-600' : 'text-slate-900'}`}>
                            {a.score}/{a.totalQuestions} <span className="text-slate-400 font-normal">({Math.round((a.score / a.totalQuestions) * 100)}%)</span>
                          </div>
                        ) : (
                          <span className="text-sm text-slate-500">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                        {formatDuration(a.startedAt, a.finishedAt)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <StatusBadge status={a.status} />
                        {(a.violationCount || 0) > 0 && (
                          <div className="mt-1 flex items-center text-xs text-red-500" title={a.violationReason}>
                            <AlertCircle className="w-3 h-3 mr-1" />
                            {a.violationCount} warnings
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-3">
                        <button onClick={() => toggleDetails(a)} className="text-slate-600 hover:text-slate-900">
                          {expandedId === a.id ? 'Hide' : 'View'} Details
                        </button>
                        {a.status === 'flagged' && (
                          <button onClick={() => handleResetAttempt(a.id)} className="text-blue-600 hover:text-blue-900">Reset</button>
                        )}
                        <button onClick={() => setDeleteDialog({isOpen: true, attemptId: a.id})} className="text-red-600 hover:text-red-900">
                           Allow Retake
                        </button>
                      </td>
                    </tr>
                    {expandedId === a.id && (
                      <tr>
                        <td colSpan={6} className="px-6 py-4 bg-slate-50 border-b border-slate-200 shadow-inner">
                          {loadingDetails === a.id && <div className="text-sm text-slate-500">Loading questions...</div>}
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
                            <div className="font-medium text-slate-900">{a.studentName || 'Unknown'}</div>
                            <div className="text-xs text-slate-500">{a.studentEmail}</div>
                          </div>
                          <StatusBadge status={a.status} />
                       </div>

                       <div>
                         <div className="text-sm text-slate-800 line-clamp-1">{a.examTitle || a.examId}</div>
                         <div className="text-xs text-slate-500 mt-0.5">{startedDate ? format(startedDate, 'dd.MM HH:mm') : ''}</div>
                       </div>

                       <div className="flex justify-between items-center text-sm border-t border-slate-50 pt-2">
                         <div>
                            {a.score !== undefined && a.totalQuestions ? (
                              <span className={`font-medium ${isPassed === true ? 'text-green-600' : isPassed === false ? 'text-red-600' : 'text-slate-900'}`}>
                                Score: {a.score}/{a.totalQuestions} <span className="text-slate-400 font-normal">({Math.round((a.score / a.totalQuestions) * 100)}%)</span>
                              </span>
                            ) : (
                              <span className="text-slate-500">Score: —</span>
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
                         <button onClick={() => setDeleteDialog({isOpen: true, attemptId: a.id})} className="flex-1 min-h-[44px] bg-red-100 hover:bg-red-200 text-red-700 rounded-md text-sm font-medium">
                            Retake
                         </button>
                       </div>

                       {expandedId === a.id && (
                        <div className="mt-3 p-3 bg-slate-50 rounded-md border border-slate-100">
                          {loadingDetails === a.id && <div className="text-sm text-slate-500">Loading questions...</div>}
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
