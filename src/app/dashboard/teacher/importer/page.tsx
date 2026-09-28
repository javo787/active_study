'use client';

import { useState } from 'react';
import { collection, doc, writeBatch, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { parseExamFile, ParsedQuestion } from '@/lib/parser';
import { toast } from 'react-hot-toast';

export default function CustomTestImporter() {
  const [parsedQuestions, setParsedQuestions] = useState<ParsedQuestion[]>([]);
  const [examTitle, setExamTitle] = useState('');
  const [timeLimit, setTimeLimit] = useState(60);

  const [rangeStart, setRangeStart] = useState(1);
  const [rangeEnd, setRangeEnd] = useState(10);

  const [useEntireRange, setUseEntireRange] = useState(false);
  const [randomPickCount, setRandomPickCount] = useState(10);

  const [numVariants, setNumVariants] = useState(1);
  const [shuffle, setShuffle] = useState(false);

  const [isPublishing, setIsPublishing] = useState(false);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const questions = parseExamFile(text);
      setParsedQuestions(questions);
      setRangeEnd(questions.length);
      toast.success(`Parsed ${questions.length} questions successfully.`);
    };
    reader.readAsText(file);
  };

  const publishExam = async () => {
    if (parsedQuestions.length === 0) {
      toast.error('No questions parsed.');
      return;
    }

    setIsPublishing(true);

    try {
      const masterExamRef = doc(collection(db, 'exams'));
      const batch = writeBatch(db);

      const expiresAt = Timestamp.fromDate(new Date(Date.now() + 3 * 24 * 60 * 60 * 1000));

      batch.set(masterExamRef, {
        title: examTitle,
        timeLimit: Number(timeLimit),
        isPublished: true,
        totalVariants: Number(numVariants),
        createdAt: serverTimestamp(),
        expiresAt,
      });

      for (let i = 0; i < numVariants; i++) {
        // Slice
        let pool = parsedQuestions.slice(rangeStart - 1, rangeEnd);

        // Random Pick
        if (!useEntireRange) {
           pool = pool.sort(() => 0.5 - Math.random()).slice(0, randomPickCount);
        }

        // Shuffle Questions and Options
        if (shuffle) {
           pool = pool.sort(() => 0.5 - Math.random());
           pool = pool.map(q => {
               const optionsWithIndexes = q.options.map((opt, idx) => ({ text: opt, isCorrect: idx.toString() === q.correctOption }));
               const shuffledOptions = optionsWithIndexes.sort(() => 0.5 - Math.random());
               const newCorrectIndex = shuffledOptions.findIndex(o => o.isCorrect);

               return {
                   text: q.text,
                   options: shuffledOptions.map(o => o.text),
                   correctOption: newCorrectIndex.toString()
               };
           });
        }

        const variantRef = doc(collection(db, `exams/${masterExamRef.id}/variants`));
        batch.set(variantRef, {
          examId: masterExamRef.id,
          expiresAt,
        });

        // Add questions
        pool.forEach(q => {
           const questionRef = doc(collection(db, `exams/${masterExamRef.id}/variants/${variantRef.id}/questions`));
           batch.set(questionRef, {
               text: q.text,
               options: q.options,
               correctOption: Number(q.correctOption),
               type: 'radio',
               expiresAt,
           });
        });
      }

      await batch.commit();
      toast.success('Exam published successfully with variants!');

      // Reset form
      setParsedQuestions([]);
      setExamTitle('');
    } catch (error) {
      console.error(error);
      toast.error('Error publishing exam.');
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 bg-white shadow-sm border border-slate-200 rounded-lg">
      <h2 className="text-2xl font-bold text-slate-800 mb-6">Custom Test Importer</h2>

      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-slate-700">Upload Text File (.txt)</label>
          <input type="file" accept=".txt" onChange={handleFileUpload} className="mt-1 block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
          <p className="mt-2 text-sm text-slate-500">Parsed Questions: {parsedQuestions.length}</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
           <div>
             <label className="block text-sm font-medium text-slate-700">Exam Title</label>
             <input type="text" value={examTitle} onChange={e => setExamTitle(e.target.value)} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm border p-2" />
           </div>
           <div>
             <label className="block text-sm font-medium text-slate-700">Time Limit (minutes)</label>
             <input type="number" value={timeLimit} onChange={e => setTimeLimit(Number(e.target.value))} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm border p-2" />
           </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t pt-4">
           <div>
             <label className="block text-sm font-medium text-slate-700">Start from Question X</label>
             <input type="number" value={rangeStart} onChange={e => setRangeStart(Number(e.target.value))} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm border p-2" />
           </div>
           <div>
             <label className="block text-sm font-medium text-slate-700">End at Question Y</label>
             <input type="number" value={rangeEnd} onChange={e => setRangeEnd(Number(e.target.value))} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm border p-2" />
           </div>
        </div>

        <div className="space-y-4 border-t pt-4">
           <label className="flex items-center space-x-2 cursor-pointer min-h-[44px]">
             <input type="checkbox" checked={useEntireRange} onChange={e => setUseEntireRange(e.target.checked)} className="rounded border-slate-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50 min-h-[24px] min-w-[24px]" />
             <span className="text-sm font-medium text-slate-700">Use Entire Range</span>
           </label>

           <div>
             <label className="block text-sm font-medium text-slate-700">Random Pick Count (Disabled if Use Entire Range is checked)</label>
             <input type="number" disabled={useEntireRange} value={randomPickCount} onChange={e => setRandomPickCount(Number(e.target.value))} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm border p-2 disabled:bg-slate-100 disabled:text-slate-400" />
           </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t pt-4">
           <div>
             <label className="block text-sm font-medium text-slate-700">Number of Variants</label>
             <input type="number" value={numVariants} onChange={e => setNumVariants(Number(e.target.value))} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm border p-2" />
           </div>
        </div>

        <div className="border-t pt-4">
           <label className="flex items-center space-x-2 cursor-pointer">
             <input type="checkbox" checked={shuffle} onChange={e => setShuffle(e.target.checked)} className="rounded border-slate-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50" />
             <span className="text-sm font-medium text-slate-700">Shuffle Questions and Options</span>
           </label>
        </div>

        <button
           onClick={publishExam}
           disabled={isPublishing || parsedQuestions.length === 0 || !examTitle}
           className="w-full bg-blue-600 text-white font-bold py-3 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors min-h-11"
        >
          {isPublishing ? 'Publishing...' : 'Publish Exam'}
        </button>
      </div>
    </div>
  );
}
