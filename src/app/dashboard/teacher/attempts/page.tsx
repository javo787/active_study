'use client';

import { Suspense, useEffect, useState, useCallback, useMemo, Fragment } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Attempt, Exam } from '@/types';
import { toast } from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';
import { toMillis, formatDuration } from '@/lib/time';
import { EmptyState } from '@/components/EmptyState';
import { useSearchParams } from 'next/navigation';
import { RefreshCw, Search, AlertTriangle, ChevronDown, ChevronUp, Trash2, Download, BarChart2 } from 'lucide-react';
import { StatusBadge } from '@/components/StatusBadge';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { Question } from '@/types';
import { Timestamp } from 'firebase/firestore';


function formatDate(dateValue: Date | Timestamp | null | undefined) {
  const d = toMillis(dateValue);
  if (!d) return '—';
  const date = new Date(d);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${day}.${month} ${hours}:${minutes}`;
}

function AttemptsContent() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const examParam = searchParams.get('exam') || '';
  const statusParam = searchParams.get('status') || '';

  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  // Filters State
  const [filterExam, setFilterExam] = useState<string>(examParam);
  const [filterStatus, setFilterStatus] = useState<string>(statusParam);
  const [filterGroup, setFilterGroup] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortOrder, setSortOrder] = useState<'newest' | 'score' | 'fastest'>('newest');

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [questionDetails, setQuestionDetails] = useState<Record<string, Question[]>>({});
  const [loadingDetails, setLoadingDetails] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [detailsError, setDetailsError] = useState<Record<string, boolean>>({});


  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResults, setAnalysisResults] = useState<Array<{ text: string; correct: number; total: number; perc: number }> | null>(null);

  const handleExportCSV = () => {
    const BOM = '\uFEFF';
    const header = ['Student', 'Email', 'Group', 'Exam', 'Score', 'Total', 'Percent', 'Time', 'Status', 'Warnings', 'Started'].join(';');
    const rows = filteredAttempts.map(a => {
      const timeStr = a.finishedAt ? formatDuration(toMillis(a.startedAt) || 0, toMillis(a.finishedAt) || 0) : '';
      const perc = a.score !== undefined && a.totalQuestions !== undefined ? Math.round((a.score / a.totalQuestions) * 100) : '';
      const dateStr = formatDate(a.startedAt);

      return [
        `"${a.studentName || ''}"`,
        `"${a.studentEmail || ''}"`,
        `"${a.studentGroup || ''}"`,
        `"${a.examTitle || ''}"`,
        a.score ?? '',
        a.totalQuestions ?? '',
        perc,
        timeStr,
        a.status,
        a.violationCount || 0,
        `"${dateStr}"`
      ].join(';');
    });

    const csvContent = BOM + [header, ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    const dateStr = new Date().toISOString().split('T')[0];
    const examLabel = filterExam && filterExam !== 'all' ? filterExam : 'all';
    link.setAttribute('download', `results-${examLabel}-${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleAnalyzeQuestions = async () => {
    if (filterExam === 'all' || !filterExam) return;
    setAnalyzing(true);
    setAnalysisResults(null);
    try {
      const completed = filteredAttempts.filter(a => a.status === 'completed' && a.variantId);
      if (completed.length === 0) {
        toast.error('No completed attempts to analyze.');
        return;
      }

      const variantIds = Array.from(new Set(completed.map(a => a.variantId)));
      const questionsByVariant: Record<string, Question[]> = {};

      for (const vId of variantIds) {
         const qSnap = await getDocs(collection(db, `exams/${filterExam}/variants/${vId}/questions`));
         questionsByVariant[vId!] = qSnap.docs.map(d => ({ id: d.id, ...d.data() } as Question));
      }

      const qStats: Record<string, { text: string; correct: number; total: number }> = {};

      completed.forEach(a => {
        const variantQs = questionsByVariant[a.variantId!];
        if (!variantQs) return;

        variantQs.forEach(q => {
           if (!qStats[q.id]) {
             qStats[q.id] = { text: q.text, correct: 0, total: 0 };
           }
           qStats[q.id].total += 1;
           if (a.answers && a.answers[q.id] === q.correctOption) {
             qStats[q.id].correct += 1;
           }
        });
      });

      const resultsList = Object.values(qStats).map(s => ({
        ...s,
        perc: s.total > 0 ? (s.correct / s.total) * 100 : 0
      })).sort((a, b) => a.perc - b.perc); // hardest first

      setAnalysisResults(resultsList);
    } catch (error) {
      console.error('Error analyzing questions', error);
      toast.error('Failed to analyze questions.');
    } finally {
      setAnalyzing(false);
    }
  };

  const toggleExpanded = async (attemptId: string, examId: string, variantId?: string) => {
    if (expandedId === attemptId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(attemptId);
    if (!questionDetails[attemptId] && variantId) {
      setLoadingDetails(attemptId);
      try {
        const qSnap = await getDocs(collection(db, `exams/${examId}/variants/${variantId}/questions`));
        if (qSnap.empty) {
           setDetailsError(prev => ({ ...prev, [attemptId]: true }));
        } else {
           const qs = qSnap.docs.map(d => ({ id: d.id, ...d.data() } as Question));
           setQuestionDetails(prev => ({ ...prev, [attemptId]: qs }));
        }
      } catch (error) {
        console.error('Failed to fetch question details:', error);
        setDetailsError(prev => ({ ...prev, [attemptId]: true }));
      } finally {
        setLoadingDetails(null);
      }
    }
  };

  const confirmDelete = (attemptId: string) => {
    setDeleteId(attemptId);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteDoc(doc(db, 'attempts', deleteId));
      setAttempts(prev => prev.filter(a => a.id !== deleteId));
      toast.success('Attempt deleted. Student can retake the exam.');
    } catch (error) {
      console.error('Error deleting attempt', error);
      toast.error('Failed to delete attempt.');
    } finally {
      setDeleteId(null);
    }
  };

  const handleReset = async (attemptId: string) => {
    try {
      await updateDoc(doc(db, 'attempts', attemptId), { status: 'in_progress', violationReason: '', violationCount: 0 });
      setAttempts(prev => prev.map(a => a.id === attemptId ? { ...a, status: 'in_progress', violationReason: undefined, violationCount: 0 } : a));
      toast.success('Attempt unflagged and reset to in-progress.');
    } catch (error) {
      console.error('Error resetting attempt', error);
      toast.error('Failed to unflag attempt.');
    }
  };

  const AttemptDetails = ({ attempt }: { attempt: Attempt }) => {
    if (loadingDetails === attempt.id) {
      return <div className="text-sm text-slate-500 py-2">Loading questions...</div>;
    }
    if (detailsError[attempt.id] || (!questionDetails[attempt.id] && !attempt.variantId)) {
      return <div className="text-sm text-slate-500 py-2">Question details are no longer available.</div>;
    }
    const questions = questionDetails[attempt.id];
    if (!questions || questions.length === 0) return null;

    return (
      <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
        {questions.map((q, idx) => {
          const chosenIdx = attempt.answers?.[q.id];
          return (
            <div key={q.id} className="text-sm bg-white p-3 rounded border border-slate-200">
              <p className="font-medium text-slate-800 mb-2">{idx + 1}. {q.text}</p>
              <div className="space-y-1 ml-2">
                {q.options.map((opt, oIdx) => {
                  const isChosen = chosenIdx === oIdx;
                  const isRightOption = q.correctOption === oIdx;
                  let optClass = "text-slate-600";
                  let icon = "";
                  if (isChosen && isRightOption) { optClass = "text-green-700 font-medium"; icon = "✓ "; }
                  else if (isChosen && !isRightOption) { optClass = "text-red-700 line-through"; icon = "✗ "; }
                  else if (!isChosen && isRightOption) { optClass = "text-green-700 border-b border-green-200 border-dashed"; icon = "(correct) "; }

                  return (
                    <div key={oIdx} className={optClass}>
                      <span className="w-5 inline-block text-center font-bold">{isChosen ? '•' : ''}</span>
                      {icon}{opt}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  };


  const fetchAttempts = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      let examsQ = collection(db, 'exams');
      if (user.role === 'teacher') {
        examsQ = query(collection(db, 'exams'), where('createdBy', '==', user.uid)) as typeof examsQ;
      }
      const examsSnap = await getDocs(examsQ);
      const fetchedExams = examsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Exam));
      setExams(fetchedExams);

      const examIds = fetchedExams.map(e => e.id);

      let attemptsQ = collection(db, 'attempts');
      if (user.role === 'teacher') {
        attemptsQ = query(collection(db, 'attempts'), where('teacherId', '==', user.uid)) as typeof attemptsQ;
      }
      const attemptsSnap = await getDocs(attemptsQ);
      let fetchedAttempts = attemptsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Attempt));

      const now = Date.now();
      fetchedAttempts = fetchedAttempts.filter(a => {
        if (a.isPreview) return false;
        if (a.expiresAt) {
          const expMs = toMillis(a.expiresAt);
          if (expMs && expMs < now) return false;
        }
        if (user.role === 'teacher' && !examIds.includes(a.examId)) return false;
        return true;
      });

      setAttempts(fetchedAttempts);
      setLastUpdated(new Date());
    } catch (error) {
      console.error('Failed to fetch attempts:', error);
      toast.error('Failed to load attempts.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchAttempts();
  }, [fetchAttempts]);

  useEffect(() => {
    if (examParam) setFilterExam(examParam);
    if (statusParam) setFilterStatus(statusParam);
  }, [examParam, statusParam]);

  const uniqueGroups = useMemo(() => {
    const groups = new Set<string>();
    attempts.forEach(a => {
      if (a.studentGroup) groups.add(a.studentGroup);
    });
    return Array.from(groups).sort();
  }, [attempts]);

  const filteredAttempts = useMemo(() => {
    const result = attempts.filter(a => {
      if (filterExam && filterExam !== 'all' && a.examId !== filterExam) return false;
      if (filterStatus && filterStatus !== 'all' && a.status !== filterStatus) return false;
      if (filterGroup && filterGroup !== 'all' && a.studentGroup !== filterGroup) return false;
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesName = a.studentName?.toLowerCase().includes(query);
        const matchesEmail = a.studentEmail?.toLowerCase().includes(query);
        if (!matchesName && !matchesEmail) return false;
      }
      return true;
    });

    result.sort((a, b) => {
      if (sortOrder === 'score') {
        const scoreA = (a.score || 0) / (a.totalQuestions || 1);
        const scoreB = (b.score || 0) / (b.totalQuestions || 1);
        return scoreB - scoreA;
      } else if (sortOrder === 'fastest') {
        const timeA = (toMillis(a.finishedAt) || 0) - (toMillis(a.startedAt) || 0);
        const timeB = (toMillis(b.finishedAt) || 0) - (toMillis(b.startedAt) || 0);
        if (timeA === 0) return 1;
        if (timeB === 0) return -1;
        return timeA - timeB;
      }
      // default: newest
      return (toMillis(b.startedAt) || 0) - (toMillis(a.startedAt) || 0);
    });

    return result;
  }, [attempts, filterExam, filterStatus, filterGroup, searchQuery, sortOrder]);

  const stats = useMemo(() => {
    let completedCount = 0;
    let totalScore = 0;
    let maxScore = 0;
    let totalTimeMs = 0;
    let passedCount = 0;
    let gradableCount = 0;

    filteredAttempts.forEach(a => {
      if (a.status === 'completed') {
        completedCount++;
        if (a.score !== undefined && a.totalQuestions !== undefined) {
          totalScore += a.score;
          maxScore += a.totalQuestions;
        }
        const start = toMillis(a.startedAt);
        const end = toMillis(a.finishedAt);
        if (start && end) {
          totalTimeMs += (end - start);
        }
        if (a.passingPercent !== undefined && a.passingPercent !== null) {
          gradableCount++;
          const perc = (a.score || 0) / (a.totalQuestions || 1) * 100;
          if (perc >= a.passingPercent) passedCount++;
        }
      }
    });

    const avgScore = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : null;
    const avgTimeSec = completedCount > 0 ? Math.round((totalTimeMs / completedCount) / 1000) : null;
    const passRate = gradableCount > 0 ? Math.round((passedCount / gradableCount) * 100) : null;

    return { completedCount, avgScore, avgTimeSec, passRate };
  }, [filteredAttempts]);

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-slate-800">Attempts Overview</h2>

        <div className="flex items-center gap-2">
          <button onClick={fetchAttempts} className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 bg-white border border-slate-200 px-3 py-1.5 rounded-md shadow-sm">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-600' : ''}`} />
            <span className="hidden sm:inline">Updated {lastUpdated.getHours().toString().padStart(2, '0')}:{lastUpdated.getMinutes().toString().padStart(2, '0')}</span>
          </button>
          {filterExam && filterExam !== 'all' && (
            <button onClick={handleAnalyzeQuestions} disabled={analyzing} className="hidden sm:flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 bg-white border border-slate-200 px-3 py-1.5 rounded-md shadow-sm disabled:opacity-50">
              <BarChart2 className={`w-4 h-4 ${analyzing ? 'animate-pulse text-blue-600' : ''}`} />
              <span>{analyzing ? 'Analyzing...' : 'Analyze Questions'}</span>
            </button>
          )}
          <button onClick={handleExportCSV} className="hidden sm:flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 bg-white border border-slate-200 px-3 py-1.5 rounded-md shadow-sm">
            <Download className="w-4 h-4" />
            <span>Export CSV</span>
          </button>
          <button onClick={fetchAttempts} className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 bg-white border border-slate-200 px-3 py-1.5 rounded-md shadow-sm">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-600' : ''}`} />
            <span className="hidden sm:inline">Updated {lastUpdated.getHours().toString().padStart(2, '0')}:{lastUpdated.getMinutes().toString().padStart(2, '0')}</span>
          </button>
        </div>

      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm flex flex-col justify-center">
          <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-1">Attempts</p>
          <p className="text-2xl font-bold text-slate-800">{filteredAttempts.length}</p>
        </div>
        <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm flex flex-col justify-center">
          <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-1">Completed</p>
          <p className="text-2xl font-bold text-green-600">{stats.completedCount}</p>
        </div>
        <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm flex flex-col justify-center">
          <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-1">Avg Score</p>
          <p className="text-2xl font-bold text-slate-800">{stats.avgScore !== null ? `${stats.avgScore}%` : '—'}</p>
        </div>
        <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm flex flex-col justify-center">
          <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-1">Avg Time</p>
          <p className="text-2xl font-bold text-slate-800">{stats.avgTimeSec !== null ? formatDuration(0, stats.avgTimeSec * 1000) : '—'}</p>
        </div>
        <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm flex flex-col justify-center">
          <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-1">Pass Rate</p>
          <p className="text-2xl font-bold text-slate-800">{stats.passRate !== null ? `${stats.passRate}%` : '—'}</p>
        </div>
      </div>


      {/* Analysis Results */}
      {analysisResults && (
        <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm mb-6">
           <div className="flex justify-between items-center mb-4">
             <h3 className="text-lg font-semibold text-slate-800">Question Analysis</h3>
             <button onClick={() => setAnalysisResults(null)} className="text-sm text-slate-500 hover:text-slate-800">Close</button>
           </div>
           <div className="space-y-4 max-h-96 overflow-y-auto pr-2 custom-scrollbar">
             {analysisResults.map((r, i) => (
               <div key={i} className="flex flex-col gap-1">
                 <div className="flex justify-between text-sm">
                   <span className="font-medium text-slate-800 line-clamp-2" title={r.text}>{r.text}</span>
                   <span className="text-slate-500 whitespace-nowrap ml-4">{r.correct}/{r.total} ({Math.round(r.perc)}%)</span>
                 </div>
                 <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                   <div
                     className={`h-full ${r.perc < 50 ? 'bg-red-500' : r.perc < 80 ? 'bg-yellow-500' : 'bg-green-500'}`}
                     style={{ width: `${r.perc}%` }}
                   />
                 </div>
               </div>
             ))}
           </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm mb-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <select
            value={filterExam}
            onChange={(e) => setFilterExam(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Exams</option>
            {exams.map(e => (
              <option key={e.id} value={e.id}>{e.title}</option>
            ))}
          </select>
          <select
            value={filterGroup}
            onChange={(e) => setFilterGroup(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Groups</option>
            {uniqueGroups.map(g => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
          <select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as 'newest' | 'score' | 'fastest')}
            className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="newest">Newest First</option>
            <option value="score">Score (High to Low)</option>
            <option value="fastest">Fastest Time</option>
          </select>
        </div>
        <div className="flex flex-wrap gap-2">
          {['all', 'in_progress', 'completed', 'flagged'].map((status) => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              className={`px-3 py-1 text-sm rounded-full border ${
                filterStatus === status || (!filterStatus && status === 'all')
                  ? 'bg-blue-50 border-blue-200 text-blue-700 font-medium'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {status === 'all' ? 'All Statuses' : status.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>


      {/* List */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
        {loading && filteredAttempts.length === 0 ? (
           <div className="text-center py-8 text-slate-500">Loading attempts...</div>
        ) : filteredAttempts.length === 0 ? (
           <EmptyState title="No attempts found" description="Try adjusting your filters or search query." />
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Student</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Exam</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Score</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Time</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Started</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                    <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-200">
                  {filteredAttempts.map(a => (
                    <Fragment key={a.id}>
                      <tr className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex flex-col">
                            <span className="text-sm font-medium text-slate-900">{a.studentName || 'Unknown'}</span>
                            <span className="text-xs text-slate-500">{a.studentEmail || a.studentId}</span>
                            {a.studentGroup && <span className="text-xs text-slate-400 mt-0.5">Gr: {a.studentGroup}</span>}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-slate-900 truncate max-w-[200px]">{a.examTitle || 'Unknown Exam'}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {a.score !== undefined && a.totalQuestions !== undefined ? (
                            <div className="flex flex-col">
                              <span className="text-sm font-medium text-slate-900">{a.score} / {a.totalQuestions}</span>
                              <span className={`text-xs ${a.passingPercent && (a.score / a.totalQuestions * 100) >= a.passingPercent ? 'text-green-600' : 'text-red-600'}`}>
                                {Math.round((a.score / a.totalQuestions) * 100)}%
                              </span>
                            </div>
                          ) : (
                            <span className="text-sm text-slate-500">—</span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
                          {a.finishedAt ? formatDuration(toMillis(a.startedAt) || 0, toMillis(a.finishedAt) || 0) : '—'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                          {formatDate(a.startedAt)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex flex-col items-start gap-1">
                            <StatusBadge status={a.status} />
                            {a.violationCount !== undefined && a.violationCount > 0 && (
                              <div className="flex items-center text-xs text-red-600 mt-1" title={a.violationReason}>
                                <AlertTriangle className="w-3 h-3 mr-1" />
                                {a.violationCount} warning{a.violationCount !== 1 ? 's' : ''}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <div className="flex items-center justify-end gap-3">
                            {a.status === 'flagged' && (
                              <button
                                onClick={() => handleReset(a.id)}
                                className="text-blue-600 hover:text-blue-900 text-xs px-2 py-1 rounded hover:bg-blue-50 transition-colors"
                              >
                                Unflag
                              </button>
                            )}
                            <button
                              onClick={() => confirmDelete(a.id)}
                              className="text-red-600 hover:text-red-900 text-xs px-2 py-1 rounded hover:bg-red-50 transition-colors"
                              title="Delete and allow retake"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => toggleExpanded(a.id, a.examId, a.variantId)}
                              className="text-slate-600 hover:text-slate-900 text-xs flex items-center px-2 py-1 rounded hover:bg-slate-100 transition-colors"
                            >
                              {expandedId === a.id ? (
                                <>Hide <ChevronUp className="w-4 h-4 ml-1" /></>
                              ) : (
                                <>Details <ChevronDown className="w-4 h-4 ml-1" /></>
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                      {expandedId === a.id && (
                        <tr>
                          <td colSpan={7} className="px-6 py-4 bg-slate-50 border-t border-slate-100">
                            <AttemptDetails attempt={a} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden divide-y divide-slate-100">
              {filteredAttempts.map(a => (
                <div key={a.id} className="p-4 hover:bg-slate-50 transition-colors">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h4 className="text-sm font-medium text-slate-900">{a.studentName || 'Unknown'}</h4>
                      <p className="text-xs text-slate-500">{a.studentEmail || a.studentId}</p>
                      {a.studentGroup && <p className="text-xs text-slate-400">Group: {a.studentGroup}</p>}
                    </div>
                    <StatusBadge status={a.status} />
                  </div>
                  <div className="text-sm text-slate-800 font-medium mb-1 truncate">{a.examTitle || 'Unknown Exam'}</div>

                  <div className="grid grid-cols-2 gap-2 text-xs text-slate-500 mb-3">
                    <div>
                      <span className="block text-slate-400">Score</span>
                      {a.score !== undefined && a.totalQuestions !== undefined ? (
                        <span className="font-medium text-slate-900">
                          {a.score}/{a.totalQuestions} ({Math.round((a.score/a.totalQuestions)*100)}%)
                        </span>
                      ) : '—'}
                    </div>
                    <div>
                      <span className="block text-slate-400">Time / Started</span>
                      {a.finishedAt ? formatDuration(toMillis(a.startedAt) || 0, toMillis(a.finishedAt) || 0) : '—'}
                      <span className="text-slate-400 ml-1">({formatDate(a.startedAt)})</span>
                    </div>
                  </div>

                  {a.violationCount !== undefined && a.violationCount > 0 && (
                    <div className="flex items-center text-xs text-red-600 mb-3 bg-red-50 p-2 rounded border border-red-100">
                      <AlertTriangle className="w-4 h-4 mr-1.5 shrink-0" />
                      <span>{a.violationCount} warning(s): {a.violationReason}</span>
                    </div>
                  )}

                  <div className="flex justify-between items-center pt-2 border-t border-slate-100">
                    <div className="flex gap-2">
                      {a.status === 'flagged' && (
                        <button onClick={() => handleReset(a.id)} className="text-xs font-medium text-blue-600 px-3 py-1.5 border border-blue-200 rounded min-h-[44px]">Unflag</button>
                      )}
                      <button onClick={() => confirmDelete(a.id)} className="text-xs font-medium text-red-600 px-3 py-1.5 border border-red-200 rounded min-h-[44px]">Retake</button>
                    </div>
                    <button onClick={() => toggleExpanded(a.id, a.examId, a.variantId)} className="text-xs font-medium text-slate-700 px-3 py-1.5 border border-slate-200 rounded bg-white min-h-[44px]">
                      {expandedId === a.id ? 'Hide Details' : 'View Details'}
                    </button>
                  </div>

                  {expandedId === a.id && (
                    <div className="mt-4 p-3 bg-slate-100 rounded-md">
                      <AttemptDetails attempt={a} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <ConfirmDialog
        isOpen={deleteId !== null}
        title="Allow Retake"
        message="This will permanently delete this attempt and allow the student to start again. This action cannot be undone."
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
        confirmText="Delete & Allow Retake"
      />

    </div>
  );
}

export default function AttemptsDashboard() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-slate-50"><div className="text-slate-500 animate-pulse">Loading dashboard...</div></div>}>
      <AttemptsContent />
    </Suspense>
  );
}
