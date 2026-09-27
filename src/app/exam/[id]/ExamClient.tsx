'use client';

import { useEffect, useState, useCallback } from 'react';
import { doc, getDoc, getDocs, collection, addDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useProctoring } from '@/hooks/useProctoring';
import { Exam, Question } from '@/types';
import { toast } from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';

export default function ExamTakingInterface({ params }: { params: { id: string } }) {
  const { user } = useAuth();
  const isPreviewMode = user?.role === 'admin' || user?.role === 'teacher';
  const [exam, setExam] = useState<Exam | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'in_progress' | 'terminated' | 'completed'>('loading');

  const handleTerminate = useCallback(() => {
    setStatus('terminated');
  }, []);

  useProctoring({ attemptId, status, onTerminate: handleTerminate, isPreviewMode });

  useEffect(() => {
    const fetchExamDetails = async () => {
      try {
        const examDoc = await getDoc(doc(db, 'exams', params.id));
        if (!examDoc.exists()) {
          toast.error('Exam not found');
          return;
        }
        setExam({ id: examDoc.id, ...examDoc.data() } as Exam);
        setStatus('ready');
      } catch (error) {
        console.error('Error fetching exam:', error);
      }
    };

    fetchExamDetails();
  }, [params.id]);

  const handleFinishExam = useCallback(async () => {
    if (!attemptId) return;

    try {
      await updateDoc(doc(db, 'attempts', attemptId), {
        status: 'completed',
        finishedAt: serverTimestamp(),
      });
      setStatus('completed');

      // Restore header
      const header = document.getElementById('student-header');
      if (header) header.style.display = 'block';

    } catch (err) {
      console.error(err);
      toast.error('Failed to submit exam');
    }
  }, [attemptId]);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (status === 'in_progress' && timeLeft !== null && timeLeft > 0) {
      timer = setTimeout(() => setTimeLeft(prev => prev! - 1), 1000);
    } else if (status === 'in_progress' && timeLeft === 0) {
      handleFinishExam();
    }
    return () => clearTimeout(timer);
  }, [status, timeLeft, handleFinishExam]);

  const handleStartExam = async () => {
    if (!exam) return;

    try {
      // 1. Fetch variants and pick one randomly
      const variantsSnapshot = await getDocs(collection(db, `exams/${exam.id}/variants`));
      if (variantsSnapshot.empty) {
        toast.error('No variants found for this exam.');
        return;
      }

      const variantsList = variantsSnapshot.docs;
      const randomVariant = variantsList[Math.floor(Math.random() * variantsList.length)];
      const variantId = randomVariant.id;

      // 2. Fetch questions for this variant
      const qSnapshot = await getDocs(collection(db, `exams/${exam.id}/variants/${variantId}/questions`));
      const loadedQuestions = qSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Question));
      setQuestions(loadedQuestions);

      // 3. Create attempt
      const attemptRef = await addDoc(collection(db, 'attempts'), {
        studentId: user?.uid || 'anonymous',
        examId: exam.id,
        variantId: variantId, // store the variant assigned
        answers: {},
        status: 'in_progress',
        startedAt: serverTimestamp(),
        isPreview: isPreviewMode,
      });

      setAttemptId(attemptRef.id);
      setTimeLeft(exam.timeLimit * 60);
      setStatus('in_progress');
      toast.success('Exam started. Do not switch tabs or copy/paste.', { duration: 5000 });

      // Hide header hack for full screen feel
      const header = document.getElementById('student-header');
      if (header) header.style.display = 'none';

    } catch (err) {
      console.error(err);
      toast.error('Failed to start exam');
    }
  };

  const handleSelectOption = async (questionId: string, optionIndex: number) => {
    if (!attemptId || status !== 'in_progress') return;

    const newAnswers = { ...answers, [questionId]: optionIndex };
    setAnswers(newAnswers);

    try {
      await updateDoc(doc(db, 'attempts', attemptId), {
        answers: newAnswers
      });
    } catch (error) {
      console.error('Failed to save answer:', error);
      toast.error('Failed to save answer');
    }
  };

  if (status === 'loading') return <div className="text-center mt-20">Loading exam...</div>;
  if (status === 'terminated') return <div className="text-center mt-20 text-red-600 font-bold text-2xl">Exam Terminated</div>;
  if (status === 'completed') return <div className="text-center mt-20 text-green-600 font-bold text-2xl">Exam Completed Successfully!</div>;

  if (status === 'ready') {
    return (
      <div className="max-w-2xl mx-auto bg-white p-8 rounded-lg shadow-sm border border-slate-200 mt-10">
        <h2 className="text-2xl font-bold text-slate-800 mb-4">{exam?.title}</h2>
        <p className="text-slate-600 mb-6">{exam?.description}</p>
        <ul className="mb-8 space-y-2 text-slate-700">
          <li><strong>Time Limit:</strong> {exam?.timeLimit} minutes</li>
          {!isPreviewMode && (
             <li className="text-red-500 mt-4"><strong>Warning:</strong> Switching tabs or losing window focus will terminate the exam. Right-click and Copy/Paste are disabled.</li>
          )}
          {isPreviewMode && (
             <li className="text-blue-500 mt-4"><strong>Preview Mode Active:</strong> Proctoring is bypassed and correct answers are highlighted. This attempt will not affect statistics.</li>
          )}
        </ul>
        <button
          onClick={handleStartExam}
          className="w-full bg-blue-600 text-white py-3 px-4 rounded-md hover:bg-blue-700 transition-colors font-semibold"
        >
          I understand, Start Exam
        </button>
      </div>
    );
  }

  const currentQ = questions[currentQuestionIndex];

  return (
    <div className="max-w-3xl mx-auto mt-4 select-none">
      <div className="flex justify-between items-center bg-white p-4 rounded-t-lg border-b border-slate-200 shadow-sm">
        <div className="font-semibold text-slate-700">
          Question {currentQuestionIndex + 1} of {questions.length}
        </div>
        <div className="font-bold text-slate-800 text-xl">
          {Math.floor(timeLeft! / 60)}:{(timeLeft! % 60).toString().padStart(2, '0')}
        </div>
      </div>

      <div className="bg-white p-8 rounded-b-lg shadow-sm mb-6 min-h-[300px]">
        <h3 className="text-xl font-medium text-slate-800 mb-6">{currentQ?.text}</h3>

        <div className="space-y-3">
          {currentQ?.options.map((option, index) => {
            const isSelected = answers[currentQ.id] === index;
            const isCorrectHighlight = isPreviewMode && currentQ.correctOption === index;

            return (
              <label
                key={index}
                className={`flex items-center p-4 border rounded-md cursor-pointer transition-colors ${
                  isCorrectHighlight ? 'border-green-500 bg-green-50 ring-2 ring-green-200' :
                  isSelected ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name={currentQ.id}
                  value={index}
                  checked={isSelected}
                  onChange={() => handleSelectOption(currentQ.id, index)}
                  className={`w-4 h-4 ${isCorrectHighlight ? 'text-green-600' : 'text-blue-600'}`}
                />
                <span className="ml-3 text-slate-700 flex-1">{option}</span>
                {isCorrectHighlight && (
                  <span className="ml-2 text-green-600 font-bold text-sm bg-green-100 px-2 py-1 rounded">Correct</span>
                )}
              </label>
            );
          })}
        </div>
      </div>

      <div className="flex justify-between">
        <button
          disabled={currentQuestionIndex === 0}
          onClick={() => setCurrentQuestionIndex(prev => prev - 1)}
          className="px-6 py-2 bg-slate-200 text-slate-700 rounded-md disabled:opacity-50"
        >
          Previous
        </button>

        {currentQuestionIndex === questions.length - 1 ? (
          <button
            onClick={handleFinishExam}
            className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
          >
            Finish Exam
          </button>
        ) : (
          <button
            onClick={() => setCurrentQuestionIndex(prev => prev + 1)}
            className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Next
          </button>
        )}
      </div>
    </div>
  );
}
