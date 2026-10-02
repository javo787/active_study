'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { collection, doc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'react-hot-toast';
import { expiryFromNow, EXAM_TTL_DAYS } from '@/lib/examOps';
import { fetchOwnedGroups } from '@/lib/groups';
import { Group } from '@/types';
import AudiencePicker, { Audience } from '@/components/AudiencePicker';

export default function CreateExam() {
  const router = useRouter();
  const { user } = useAuth();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [timeLimit, setTimeLimit] = useState(60);
  const [passingPercent, setPassingPercent] = useState('');
  const [shuffleQuestions, setShuffleQuestions] = useState(false);
  const [shuffleOptions, setShuffleOptions] = useState(false);
  const [showAnswers, setShowAnswers] = useState(false);
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(true);
  const [audience, setAudience] = useState<Audience>('groups');
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);

  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!user) return;
    fetchOwnedGroups(user.uid)
      .then(setGroups)
      .catch(error => console.error('Failed to load groups', error))
      .finally(() => setGroupsLoading(false));
  }, [user]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (audience === 'groups' && selectedGroups.length === 0) {
      toast.error('Pick at least one group, or choose "Anyone with the link".');
      return;
    }

    setIsSubmitting(true);
    try {
      const batch = writeBatch(db);

      const newExamRef = doc(collection(db, 'exams'));
      const examId = newExamRef.id;
      const expiresAt = expiryFromNow(EXAM_TTL_DAYS);

      batch.set(newExamRef, {
        title,
        description,
        timeLimit: Number(timeLimit),
        passingPercent: passingPercent ? Number(passingPercent) : null,
        shuffleQuestions,
        shuffleOptions,
        showAnswers,
        visibility: audience === 'groups' ? 'listed' : 'link',
        groupIds: audience === 'groups' ? selectedGroups : [],
        isPublished: false,
        totalVariants: 1,
        createdAt: serverTimestamp(),
        expiresAt,
        createdBy: user.uid,
        createdByName: user.fullName || user.displayName,
      });

      const newVariantRef = doc(collection(db, `exams/${examId}/variants`));
      batch.set(newVariantRef, {
        examId,
        expiresAt,
      });

      await batch.commit();

      toast.success('Exam draft created');
      router.push(`/dashboard/teacher/exam?id=${examId}`);
    } catch (error) {
      toast.error('Failed to create exam');
      console.error(error);
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto bg-white p-4 sm:p-6 rounded-lg shadow-sm border border-slate-200">
      <h2 className="text-2xl font-bold text-slate-800 mb-6">Create New Exam</h2>

      <form onSubmit={handleCreate} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700">Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border"
            rows={4}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700">Time Limit (minutes)</label>
            <input
              type="number"
              value={timeLimit}
              onChange={(e) => setTimeLimit(Number(e.target.value))}
              min="1"
              max="600"
              className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Passing Percentage (Optional)</label>
            <input
              type="number"
              value={passingPercent}
              onChange={(e) => setPassingPercent(e.target.value)}
              min="0"
              max="100"
              placeholder="e.g. 70"
              className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border"
            />
          </div>
        </div>

        <div className="space-y-3 pt-4 border-t border-slate-100">
          <label className="flex items-center space-x-3 cursor-pointer min-h-[44px]">
            <input
              type="checkbox"
              checked={shuffleQuestions}
              onChange={e => setShuffleQuestions(e.target.checked)}
              className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm font-medium text-slate-700">Shuffle questions</span>
          </label>

          <label className="flex items-center space-x-3 cursor-pointer min-h-[44px]">
            <input
              type="checkbox"
              checked={shuffleOptions}
              onChange={e => setShuffleOptions(e.target.checked)}
              className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm font-medium text-slate-700">Shuffle options within questions</span>
          </label>

          <label className="flex items-center space-x-3 cursor-pointer min-h-[44px]">
            <input
              type="checkbox"
              checked={showAnswers}
              onChange={e => setShowAnswers(e.target.checked)}
              className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm font-medium text-slate-700">Show correct answers after submit</span>
          </label>

        </div>

        <div className="pt-4 border-t border-slate-100">
          <AudiencePicker
            groups={groups}
            loading={groupsLoading}
            audience={audience}
            selected={selectedGroups}
            onChange={(a, sel) => { setAudience(a); setSelectedGroups(sel); }}
          />
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors min-h-[44px] mt-6 disabled:opacity-50"
        >
          {isSubmitting ? 'Creating...' : 'Create Exam'}
        </button>
      </form>
    </div>
  );
}
