'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { collection, doc, getDoc, getDocs, updateDoc, writeBatch, deleteDoc, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Exam, Question } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'react-hot-toast';
import { deleteExamCascade, duplicateExam } from '@/lib/examOps';
import Link from 'next/link';
import { Copy, Save, Share2, Plus, Trash2, Play, AlertCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

function ExamManager() {
  const searchParams = useSearchParams();
  const id = searchParams.get('id');
  const router = useRouter();
  const { user } = useAuth();

  const [exam, setExam] = useState<Exam | null>(null);
  const [variants, setVariants] = useState<string[]>([]);
  const [activeVariant, setActiveVariant] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Settings Form State
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [timeLimit, setTimeLimit] = useState(60);
  const [passingPercent, setPassingPercent] = useState('');
  const [shuffleQuestions, setShuffleQuestions] = useState(false);
  const [shuffleOptions, setShuffleOptions] = useState(false);
  const [showAnswers, setShowAnswers] = useState(false);
  const [visibility, setVisibility] = useState<'listed' | 'link'>('listed');

  const [isDirty, setIsDirty] = useState(false);

  // Stats
  const [stats, setStats] = useState({ attempts: 0, completed: 0, inProgress: 0, flagged: 0, avgScore: 0 });

  useEffect(() => {
    if (!id || !user) return;

    const fetchExamData = async () => {
      try {
        const examRef = doc(db, 'exams', id);
        const examSnap = await getDoc(examRef);

        if (!examSnap.exists()) {
          toast.error('Exam not found');
          router.push('/dashboard/teacher/exams');
          return;
        }

        const data = examSnap.data() as Exam;

        if (data.createdBy !== user.uid && user.role !== 'admin') {
          toast.error('Access denied');
          router.push('/dashboard/teacher/exams');
          return;
        }

        setExam({ ...data, id: examSnap.id });
        setTitle(data.title);
        setDescription(data.description || '');
        setTimeLimit(data.timeLimit);
        setPassingPercent(data.passingPercent ? String(data.passingPercent) : '');
        setShuffleQuestions(!!data.shuffleQuestions);
        setShuffleOptions(!!data.shuffleOptions);
        setShowAnswers(!!data.showAnswers);
        setVisibility(data.visibility || 'listed');

        // Fetch variants
        const variantsSnap = await getDocs(collection(db, `exams/${id}/variants`));
        const vIds = variantsSnap.docs.map(d => d.id);
        setVariants(vIds);

        if (vIds.length > 0) {
          setActiveVariant(vIds[0]);
        }

        // Fetch stats
        let attemptsQuery = query(
           collection(db, 'attempts'),
           where('examId', '==', id)
        );
        if (user.role !== 'admin') {
           attemptsQuery = query(
              collection(db, 'attempts'),
              where('teacherId', '==', user.uid),
              where('examId', '==', id)
           );
        }

        const attemptsSnap = await getDocs(attemptsQuery);
        const relevantAttempts = attemptsSnap.docs
          .map(d => d.data())
          .filter(a => !a.isPreview && (!a.expiresAt || ('toDate' in a.expiresAt ? a.expiresAt.toDate() : a.expiresAt) > new Date()));

        let completed = 0, inProgress = 0, flagged = 0, totalScore = 0;
        relevantAttempts.forEach(a => {
          if (a.status === 'completed') completed++;
          if (a.status === 'in_progress') inProgress++;
          if (a.status === 'flagged') flagged++;
          if (a.score) totalScore += a.score;
        });

        setStats({
          attempts: relevantAttempts.length,
          completed,
          inProgress,
          flagged,
          avgScore: completed > 0 ? Math.round(totalScore / completed) : 0
        });

      } catch (err: unknown) {
        console.error(err);
        toast.error('Error loading exam');
      } finally {
        setLoading(false);
      }
    };

    fetchExamData();
  }, [id, user, router]);

  useEffect(() => {
    if (!id || !activeVariant) return;

    const fetchQuestions = async () => {
      try {
        const qSnap = await getDocs(collection(db, `exams/${id}/variants/${activeVariant}/questions`));
        setQuestions(qSnap.docs.map(d => ({ ...d.data(), id: d.id } as Question)));
      } catch (err: unknown) {
        console.error(err);
      }
    };

    fetchQuestions();
  }, [id, activeVariant]);

  const handleSaveSettings = async () => {
    if (!id || !exam) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'exams', id), {
        title,
        description,
        timeLimit: Number(timeLimit),
        passingPercent: passingPercent ? Number(passingPercent) : null,
        shuffleQuestions,
        shuffleOptions,
        showAnswers,
        visibility,
        totalVariants: variants.length,
      });
      setExam(prev => prev ? { ...prev, title, description, timeLimit, passingPercent: passingPercent ? Number(passingPercent) : null, shuffleQuestions, shuffleOptions, showAnswers, visibility, totalVariants: variants.length } : null);
      setIsDirty(false);
      toast.success('Settings saved');
    } catch (err: unknown) {
      console.error(err);
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleTogglePublish = async () => {
    if (!exam || !id) return;

    const newStatus = !exam.isPublished;

    if (newStatus) {
      if (variants.length < 1) {
        toast.error('Cannot publish: Exam needs at least 1 variant.');
        return;
      }
      if (questions.length < 1) { // Basic check for active variant
        toast.error('Cannot publish: Variants must have questions.');
        return;
      }
    }

    try {
      await updateDoc(doc(db, 'exams', id), { isPublished: newStatus });
      setExam({ ...exam, isPublished: newStatus });
      toast.success(newStatus ? 'Exam published' : 'Exam unpublished');
    } catch (err: unknown) {
      console.error(err);
      toast.error('Failed to update status');
    }
  };

  const handleDelete = async () => {
    if (!id || !confirm('Are you sure you want to permanently delete this exam?')) return;
    const t = toast.loading('Deleting exam...');
    try {
      await deleteExamCascade(id);
      toast.success('Exam deleted', { id: t });
      router.push('/dashboard/teacher/exams');
    } catch (err: unknown) {
      console.error(err);
      toast.error('Failed to delete exam', { id: t });
    }
  };

  const handleDuplicate = async () => {
    if (!id || !user) return;
    const t = toast.loading('Duplicating exam...');
    try {
      const newId = await duplicateExam(id, user);
      toast.success('Exam duplicated', { id: t });
      router.push(`/dashboard/teacher/exam?id=${newId}`);
    } catch (err: unknown) {
      console.error(err);
      toast.error('Failed to duplicate exam', { id: t });
    }
  };


  // Add Variant
  const handleAddVariant = async () => {
    if (!id || !exam) return;
    try {
      const vRef = doc(collection(db, `exams/${id}/variants`));
      await writeBatch(db).set(vRef, { examId: id, expiresAt: exam.expiresAt }).commit();

      const newVariants = [...variants, vRef.id];
      setVariants(newVariants);
      setActiveVariant(vRef.id);

      // Update exam totalVariants count
      await updateDoc(doc(db, 'exams', id), { totalVariants: newVariants.length });

      toast.success('Variant added');
    } catch (err: unknown) {
      console.error(err);
      toast.error('Failed to add variant');
    }
  };

  // Delete Variant
  const handleDeleteVariant = async () => {
    if (!id || !activeVariant || !exam) return;
    if (variants.length <= 1) {
      toast.error('Cannot delete the last variant');
      return;
    }
    if (!confirm('Are you sure you want to delete this variant and all its questions?')) return;

    try {
      const batch = writeBatch(db);
      questions.forEach(q => {
        batch.delete(doc(db, `exams/${id}/variants/${activeVariant}/questions`, q.id));
      });
      batch.delete(doc(db, `exams/${id}/variants`, activeVariant));
      await batch.commit();

      const newVariants = variants.filter(v => v !== activeVariant);
      setVariants(newVariants);
      setActiveVariant(newVariants[0]);

      await updateDoc(doc(db, 'exams', id), { totalVariants: newVariants.length });

      toast.success('Variant deleted');
    } catch (err: unknown) {
      console.error(err);
      toast.error('Failed to delete variant');
    }
  };

  // New Question State
  const [newQText, setNewQText] = useState('');
  const [newQOptions, setNewQOptions] = useState(['', '']);
  const [newQCorrect, setNewQCorrect] = useState(0);
  const [isAddingQ, setIsAddingQ] = useState(false);

  const handleAddQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !activeVariant || !exam) return;

    if (!newQText.trim()) return toast.error('Question text is required');
    const validOptions = newQOptions.filter(o => o.trim() !== '');
    if (validOptions.length < 2) return toast.error('At least 2 options are required');
    if (newQOptions[newQCorrect].trim() === '') return toast.error('Correct option cannot be empty');

    try {
      const qRef = doc(collection(db, `exams/${id}/variants/${activeVariant}/questions`));
      const newQ = {
        text: newQText,
        options: newQOptions.map(o => o.trim()),
        correctOption: newQCorrect,
        type: 'radio',
        expiresAt: exam.expiresAt
      };

      await writeBatch(db).set(qRef, newQ).commit();
      setQuestions([...questions, { ...newQ, id: qRef.id } as Question]);

      // Reset form
      setNewQText('');
      setNewQOptions(['', '']);
      setNewQCorrect(0);
      setIsAddingQ(false);
      toast.success('Question added');
    } catch (err: unknown) {
      console.error(err);
      toast.error('Failed to add question');
    }
  };

  const handleDeleteQuestion = async (qId: string) => {
    if (!id || !activeVariant) return;
    if (!confirm('Delete this question?')) return;
    try {
      await deleteDoc(doc(db, `exams/${id}/variants/${activeVariant}/questions`, qId));
      setQuestions(questions.filter(q => q.id !== qId));
    } catch (err: unknown) {
      console.error(err);
      toast.error('Failed to delete question');
    }
  };

  if (loading) return <div className="p-8 text-center text-slate-500">Loading exam manager...</div>;
  if (!exam) return <div className="p-8 text-center text-red-500">Exam not found</div>;

  return (
    <div className="max-w-5xl mx-auto pb-24 md:pb-8">
      {/* Header Actions */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 bg-white p-4 rounded-lg shadow-sm border border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{exam.title}</h1>
          <div className="flex items-center gap-3 mt-1 text-sm text-slate-500">
            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${exam.isPublished ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-800'}`}>
              {exam.isPublished ? 'Published' : 'Draft'}
            </span>
            <span>Expires in {formatDistanceToNow(exam.expiresAt && 'toDate' in exam.expiresAt ? exam.expiresAt.toDate() : (exam.expiresAt as Date))}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 w-full md:w-auto">
          <button onClick={handleTogglePublish} className="flex-1 md:flex-none px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-md font-medium hover:bg-slate-50 min-h-[44px]">
            {exam.isPublished ? 'Unpublish' : 'Publish'}
          </button>
          <Link href={`/exam?id=${id}`} target="_blank" className="flex-1 md:flex-none px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-md font-medium hover:bg-slate-50 flex items-center justify-center gap-2 min-h-[44px]">
            <Play className="w-4 h-4" /> Preview
          </Link>
          <button onClick={handleDuplicate} className="flex-1 md:flex-none px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-md font-medium hover:bg-slate-50 min-h-[44px]">
            Duplicate
          </button>
          <button onClick={handleDelete} className="flex-1 md:flex-none px-4 py-2 bg-red-50 text-red-600 rounded-md font-medium hover:bg-red-100 min-h-[44px]">
            Delete
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Left Column - Settings & Share */}
        <div className="space-y-6">

          {/* Share Card */}
          <div className="bg-white p-5 rounded-lg shadow-sm border border-slate-200">
            <h3 className="font-semibold text-slate-800 mb-3 flex items-center gap-2"><Share2 className="w-4 h-4"/> Share Link</h3>
            <div className="flex items-center gap-2 mb-3">
              <input readOnly value={`${typeof window !== 'undefined' ? window.location.origin : ''}/exam?id=${id}`} className="flex-1 bg-slate-50 border border-slate-200 rounded p-2 text-sm text-slate-600" />
              <button onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/exam?id=${id}`); toast.success('Copied'); }} className="p-2 border border-slate-200 rounded bg-white hover:bg-slate-50 min-h-[44px] min-w-[44px] flex items-center justify-center">
                <Copy className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-500">Students must sign in with Google to attempt.</p>
          </div>

          {/* Results Summary */}
          <div className="bg-white p-5 rounded-lg shadow-sm border border-slate-200">
            <h3 className="font-semibold text-slate-800 mb-4">Results Summary</h3>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="bg-slate-50 p-3 rounded text-center">
                <div className="text-2xl font-bold text-blue-600">{stats.attempts}</div>
                <div className="text-xs text-slate-500 uppercase">Total Attempts</div>
              </div>
              <div className="bg-slate-50 p-3 rounded text-center">
                <div className="text-2xl font-bold text-green-600">{stats.avgScore}%</div>
                <div className="text-xs text-slate-500 uppercase">Avg Score</div>
              </div>
            </div>
            <div className="text-sm text-slate-600 space-y-1 mb-4">
              <div className="flex justify-between"><span>Completed</span><span className="font-medium">{stats.completed}</span></div>
              <div className="flex justify-between"><span>In Progress</span><span className="font-medium">{stats.inProgress}</span></div>
              <div className="flex justify-between"><span>Flagged (Violations)</span><span className="font-medium text-orange-600">{stats.flagged}</span></div>
            </div>
            <Link href={`/dashboard/teacher/attempts?exam=${id}`} className="block w-full text-center py-2 text-sm text-blue-600 bg-blue-50 hover:bg-blue-100 rounded font-medium min-h-[44px] flex items-center justify-center">
              View all attempts &rarr;
            </Link>
          </div>

          {/* Settings Form */}
          <div className="bg-white p-5 rounded-lg shadow-sm border border-slate-200">
            <h3 className="font-semibold text-slate-800 mb-4">Settings</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">Title</label>
                <input type="text" value={title} onChange={e => {setTitle(e.target.value); setIsDirty(true);}} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm border p-2" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Description</label>
                <textarea value={description} onChange={e => {setDescription(e.target.value); setIsDirty(true);}} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm border p-2" rows={3} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700">Time (min)</label>
                  <input type="number" value={timeLimit} onChange={e => {setTimeLimit(Number(e.target.value)); setIsDirty(true);}} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm border p-2" min="1" max="600" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Passing %</label>
                  <input type="number" value={passingPercent} onChange={e => {setPassingPercent(e.target.value); setIsDirty(true);}} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm border p-2" min="0" max="100" placeholder="Optional" />
                </div>
              </div>
              <div className="space-y-2 pt-2">
                <label className="flex items-center space-x-2 min-h-[44px] cursor-pointer">
                  <input type="checkbox" checked={shuffleQuestions} onChange={e => {setShuffleQuestions(e.target.checked); setIsDirty(true);}} className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-5 h-5" />
                  <span className="text-sm text-slate-700">Shuffle questions</span>
                </label>
                <label className="flex items-center space-x-2 min-h-[44px] cursor-pointer">
                  <input type="checkbox" checked={shuffleOptions} onChange={e => {setShuffleOptions(e.target.checked); setIsDirty(true);}} className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-5 h-5" />
                  <span className="text-sm text-slate-700">Shuffle options</span>
                </label>
                <label className="flex items-center space-x-2 min-h-[44px] cursor-pointer">
                  <input type="checkbox" checked={showAnswers} onChange={e => {setShowAnswers(e.target.checked); setIsDirty(true);}} className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-5 h-5" />
                  <span className="text-sm text-slate-700">Show answers after submit</span>
                </label>
                <label className="flex items-center space-x-2 min-h-[44px] cursor-pointer">
                  <input type="checkbox" checked={visibility === 'listed'} onChange={e => {setVisibility(e.target.checked ? 'listed' : 'link'); setIsDirty(true);}} className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-5 h-5" />
                  <span className="text-sm text-slate-700">List on student dashboard</span>
                </label>
              </div>
            </div>

            {/* Desktop Save Button */}
            <div className="hidden md:block mt-6">
              <button
                onClick={handleSaveSettings}
                disabled={!isDirty || saving}
                className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 min-h-[44px] disabled:opacity-50"
              >
                <Save className="w-4 h-4" /> Save Settings
              </button>
            </div>
          </div>
        </div>

        {/* Right Column - Editor */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white p-5 rounded-lg shadow-sm border border-slate-200">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold text-slate-800">Content Editor</h3>
            </div>

            {/* Variants Tabs */}
            <div className="flex flex-wrap gap-2 mb-6 border-b border-slate-100 pb-4">
              {variants.map((vId, idx) => (
                <button
                  key={vId}
                  onClick={() => setActiveVariant(vId)}
                  className={`px-4 py-2 rounded-full text-sm font-medium min-h-[44px] ${activeVariant === vId ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                >
                  Variant {idx + 1}
                </button>
              ))}
              <button onClick={handleAddVariant} className="px-4 py-2 rounded-full text-sm font-medium bg-green-50 text-green-700 hover:bg-green-100 flex items-center gap-1 min-h-[44px]">
                <Plus className="w-4 h-4" /> Add
              </button>
              {variants.length > 1 && (
                <button onClick={handleDeleteVariant} className="px-4 py-2 rounded-full text-sm font-medium bg-red-50 text-red-600 hover:bg-red-100 flex items-center gap-1 min-h-[44px] ml-auto">
                  <Trash2 className="w-4 h-4" /> Delete Variant
                </button>
              )}
            </div>

            {/* Questions List */}
            <div className="space-y-4 mb-6">
              <div className="flex justify-between items-center">
                <h4 className="font-medium text-slate-700">Questions ({questions.length})</h4>
              </div>

              {questions.length === 0 ? (
                <div className="text-center py-8 text-slate-400 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                  No questions in this variant yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {questions.map((q, idx) => (
                    <div key={q.id} className="p-4 rounded-lg border border-slate-200 bg-white">
                      <div className="flex justify-between gap-4 mb-2">
                        <span className="font-medium text-slate-900">{idx + 1}. {q.text}</span>
                        <div className="flex gap-2 shrink-0">
                          <button onClick={() => handleDeleteQuestion(q.id)} className="text-slate-400 hover:text-red-500 p-1 -m-1 min-h-[44px] min-w-[44px] flex items-center justify-center">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      <div className="space-y-1 pl-4 border-l-2 border-slate-100">
                        {q.options.map((opt, oIdx) => (
                          <div key={oIdx} className={`text-sm ${oIdx === q.correctOption ? 'text-green-700 font-medium flex items-center gap-1' : 'text-slate-600'}`}>
                            {oIdx === q.correctOption && <div className="w-1.5 h-1.5 rounded-full bg-green-500 mr-1" />}
                            {opt}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Add Question Form */}
            {isAddingQ ? (
              <div className="p-4 rounded-lg border-2 border-blue-100 bg-blue-50/50">
                <h4 className="font-medium text-slate-800 mb-4">Add New Question</h4>
                <form onSubmit={handleAddQuestion} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Question Text</label>
                    <textarea required value={newQText} onChange={e => setNewQText(e.target.value)} className="w-full p-2 border border-slate-300 rounded focus:ring-blue-500 focus:border-blue-500" rows={2} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-2">Options (Mark correct with radio)</label>
                    {newQOptions.map((opt, idx) => (
                      <div key={idx} className="flex gap-2 mb-2 items-center">
                        <input type="radio" name="correctOpt" checked={newQCorrect === idx} onChange={() => setNewQCorrect(idx)} className="w-4 h-4 text-blue-600 min-h-[44px] min-w-[44px] cursor-pointer" />
                        <input type="text" value={opt} onChange={e => {
                          const newOpts = [...newQOptions];
                          newOpts[idx] = e.target.value;
                          setNewQOptions(newOpts);
                        }} className="flex-1 p-2 border border-slate-300 rounded focus:ring-blue-500 focus:border-blue-500" placeholder={`Option ${idx + 1}`} />
                        {newQOptions.length > 2 && (
                          <button type="button" onClick={() => {
                            const newOpts = newQOptions.filter((_, i) => i !== idx);
                            setNewQOptions(newOpts);
                            if (newQCorrect >= idx && newQCorrect > 0) setNewQCorrect(newQCorrect - 1);
                          }} className="text-slate-400 hover:text-red-500 p-2 min-h-[44px] min-w-[44px] flex items-center justify-center">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}
                    {newQOptions.length < 8 && (
                      <button type="button" onClick={() => setNewQOptions([...newQOptions, ''])} className="text-sm text-blue-600 font-medium mt-2 min-h-[44px] px-2 -ml-2 rounded hover:bg-blue-50">
                        + Add Option
                      </button>
                    )}
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded font-medium hover:bg-blue-700 min-h-[44px]">Save Question</button>
                    <button type="button" onClick={() => setIsAddingQ(false)} className="px-4 py-2 bg-white text-slate-600 border border-slate-300 rounded font-medium hover:bg-slate-50 min-h-[44px]">Cancel</button>
                  </div>
                </form>
              </div>
            ) : (
              <button onClick={() => setIsAddingQ(true)} className="w-full py-3 border-2 border-dashed border-slate-300 text-slate-600 rounded-lg font-medium hover:bg-slate-50 hover:border-slate-400 flex items-center justify-center gap-2 min-h-[44px]">
                <Plus className="w-5 h-5" /> Add Question
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Sticky Save Bar */}
      {isDirty && (
        <div className="md:hidden fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-slate-200 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-50 flex items-center justify-between">
          <div className="flex items-center gap-2 text-amber-600 text-sm font-medium">
            <AlertCircle className="w-4 h-4" /> Unsaved changes
          </div>
          <button
            onClick={handleSaveSettings}
            disabled={saving}
            className="bg-blue-600 text-white px-6 py-2 rounded-full font-medium shadow-sm min-h-[44px] disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save All'}
          </button>
        </div>
      )}
    </div>
  );
}

export default function ExamManagerPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center">Loading...</div>}>
      <ExamManager />
    </Suspense>
  );
}
