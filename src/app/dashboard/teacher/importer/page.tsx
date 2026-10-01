'use client';

import { useEffect, useState } from 'react';
import { collection, doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { parseExamFile, ParsedQuestion } from '@/lib/parser';
import { toast } from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';
import { commitInChunks, expiryFromNow, EXAM_TTL_DAYS } from '@/lib/examOps';
import { fetchOwnedGroups } from '@/lib/groups';
import { Group } from '@/types';
import AudiencePicker, { Audience } from '@/components/AudiencePicker';
import { useRouter } from 'next/navigation';
import { FileText, HelpCircle, AlertTriangle, CheckCircle } from 'lucide-react';

export default function CustomTestImporter() {
  const router = useRouter();
  const { user } = useAuth();

  const [parsedQuestions, setParsedQuestions] = useState<ParsedQuestion[]>([]);
  const [invalidCount, setInvalidCount] = useState(0);
  const [examTitle, setExamTitle] = useState('');
  const [timeLimit, setTimeLimit] = useState(60);

  const [numVariants, setNumVariants] = useState(1);
  const [shuffle, setShuffle] = useState(false);
  const [publishImmediately, setPublishImmediately] = useState(true);

  const [groups, setGroups] = useState<Group[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(true);
  const [audience, setAudience] = useState<Audience>('groups');
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);

  useEffect(() => {
    if (!user) return;
    fetchOwnedGroups(user.uid)
      .then(setGroups)
      .catch(error => console.error('Failed to load groups', error))
      .finally(() => setGroupsLoading(false));
  }, [user]);

  const [rangeStart, setRangeStart] = useState(1);
  const [rangeEnd, setRangeEnd] = useState(1);
  const [useEntireRange, setUseEntireRange] = useState(false);
  const [randomPickCount, setRandomPickCount] = useState(10);

  const [isPublishing, setIsPublishing] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const arrayBuffer = event.target?.result as ArrayBuffer;
      let text = new TextDecoder('utf-8').decode(arrayBuffer);

      // If the text contains the replacement character (invalid utf-8 sequence),
      // we fallback to windows-1251 (Cyrillic legacy).
      if (text.includes('\uFFFD')) {
        text = new TextDecoder('windows-1251').decode(arrayBuffer);
      }

      const questions = parseExamFile(text);

      // Validate
      let valid = 0, invalid = 0;
      const validatedQuestions = questions.map(q => {
        const isValid =
          q.text.trim().length > 0 &&
          q.options.length >= 2 &&
          !isNaN(Number(q.correctOption)) &&
          Number(q.correctOption) >= 0 &&
          Number(q.correctOption) < q.options.length;

        if (isValid) valid++;
        else invalid++;

        return { ...q, isValid };
      });

      setParsedQuestions(validatedQuestions);
      setInvalidCount(invalid);

      if (valid > 0) {
        toast.success(`Found ${valid} valid questions${invalid > 0 ? ` (${invalid} invalid skipped)` : ''}`);
        setRangeStart(1);
        setRangeEnd(valid);
        setRandomPickCount(Math.min(10, valid));
      } else {
        toast.error('No valid questions found in file');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const publishExam = async () => {
    if (!user) return;

    const validQuestions = parsedQuestions.filter(q => (q as ParsedQuestion & { isValid?: boolean }).isValid);

    if (validQuestions.length === 0) {
      toast.error('No valid questions to import.');
      return;
    }

    if (audience === 'groups' && selectedGroups.length === 0) {
      toast.error('Pick at least one group, or choose "Anyone with the link".');
      return;
    }

    setIsPublishing(true);
    const loadingToast = toast.loading('Importing exam in background...');

    try {
      const masterExamRef = doc(collection(db, 'exams'));
      const examId = masterExamRef.id;
      const expiresAt = expiryFromNow(EXAM_TTL_DAYS);
      const now = serverTimestamp();

      // 1. Create the exam doc (initially unpublished to avoid weird states if chunking fails)
      const initialBatch = writeBatch(db);
      initialBatch.set(masterExamRef, {
        title: examTitle || 'Imported Exam',
        timeLimit: Number(timeLimit),
        isPublished: false,
        totalVariants: Number(numVariants),
        createdAt: now,
        expiresAt,
        createdBy: user.uid,
        createdByName: user.fullName || user.displayName,
        visibility: audience === 'groups' ? 'listed' : 'link',
        groupIds: audience === 'groups' ? selectedGroups : [],
      });
      await initialBatch.commit();

      // 2. Prepare chunks for variants and questions
      const ops = [];

      const maxAvailable = rangeEnd - rangeStart + 1;
      const pickCount = useEntireRange ? maxAvailable : randomPickCount;

      for (let i = 0; i < numVariants; i++) {
        // 1. Slice the requested range
        let pool = validQuestions.slice(rangeStart - 1, rangeEnd);

        // 2. Random pick if needed
        if (!useEntireRange && pickCount < pool.length) {
          const shuffledPool = [...pool];
          for (let j = shuffledPool.length - 1; j > 0; j--) {
            const k = Math.floor(Math.random() * (j + 1));
            [shuffledPool[j], shuffledPool[k]] = [shuffledPool[k], shuffledPool[j]];
          }
          pool = shuffledPool.slice(0, pickCount);
        }

        // 3. Shuffle questions and options if requested
        if (shuffle) {
           for (let j = pool.length - 1; j > 0; j--) {
              const k = Math.floor(Math.random() * (j + 1));
              [pool[j], pool[k]] = [pool[k], pool[j]];
           }

           pool = pool.map(q => {
               const optionsWithIndexes = q.options.map((opt, idx) => ({ text: opt, isCorrect: idx.toString() === q.correctOption }));
               for (let j = optionsWithIndexes.length - 1; j > 0; j--) {
                  const k = Math.floor(Math.random() * (j + 1));
                  [optionsWithIndexes[j], optionsWithIndexes[k]] = [optionsWithIndexes[k], optionsWithIndexes[j]];
               }
               const newCorrectIndex = optionsWithIndexes.findIndex(o => o.isCorrect);

               return {
                   text: q.text,
                   options: optionsWithIndexes.map(o => o.text),
                   correctOption: newCorrectIndex.toString()
               };
           });
        }

        const variantRef = doc(collection(db, `exams/${examId}/variants`));
        ops.push((batch: import('firebase/firestore').WriteBatch) => batch.set(variantRef, {
          examId,
          expiresAt,
        }));

        pool.forEach(q => {
           const questionRef = doc(collection(db, `exams/${examId}/variants/${variantRef.id}/questions`));
           ops.push((batch: import('firebase/firestore').WriteBatch) => batch.set(questionRef, {
               text: q.text,
               options: q.options,
               correctOption: Number(q.correctOption),
               type: 'radio',
               expiresAt,
           }));
        });
      }

      // 3. Commit children in chunks
      await commitInChunks(ops);

      // 4. Finally, publish if requested
      if (publishImmediately) {
         const finalBatch = writeBatch(db);
         finalBatch.update(masterExamRef, { isPublished: true });
         await finalBatch.commit();
      }

      toast.success('Exam imported successfully!', { id: loadingToast });
      router.push(`/dashboard/teacher/exam?id=${examId}`);

    } catch (error) {
      console.error(error);
      toast.error('Error importing exam. Check if a partial draft was saved.', { id: loadingToast });
      setIsPublishing(false);
    }
  };

  const currentValidQuestions = parsedQuestions.filter(q => (q as ParsedQuestion & { isValid?: boolean }).isValid);
  const maxAvailable = rangeEnd - rangeStart + 1;
  const pickCount = useEntireRange ? maxAvailable : randomPickCount;

  const isRangeValid = rangeStart >= 1 && rangeEnd <= currentValidQuestions.length && rangeStart <= rangeEnd;
  const isPickValid = useEntireRange || (randomPickCount >= 1 && randomPickCount <= maxAvailable);
  const canPublish = isRangeValid && isPickValid && examTitle && currentValidQuestions.length > 0;

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      <div className="flex justify-between items-center bg-white p-4 sm:p-6 rounded-lg shadow-sm border border-slate-200">
        <h2 className="text-2xl font-bold text-slate-800">Custom Test Importer</h2>
        <button onClick={() => setShowHelp(!showHelp)} className="text-blue-600 hover:bg-blue-50 p-2 rounded-full min-h-[44px] min-w-[44px] flex items-center justify-center">
          <HelpCircle className="w-5 h-5" />
        </button>
      </div>

      {showHelp && (
        <div className="bg-blue-50 border border-blue-200 p-5 rounded-lg text-sm text-blue-900 space-y-4">
          <h3 className="font-semibold text-base">Supported File Formats (.txt)</h3>
          <p>We support text files saved in UTF-8 or Windows-1251 encoding. Two syntaxes are supported:</p>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-white p-3 rounded border border-blue-100">
              <div className="font-medium mb-2">Syntax 1: Using `?`, `+`, `-`</div>
              <pre className="text-xs font-mono text-slate-600 whitespace-pre-wrap">
? What is the capital of France?
- London
- Berlin
+ Paris
- Madrid
              </pre>
            </div>
            <div className="bg-white p-3 rounded border border-blue-100">
              <div className="font-medium mb-2">Syntax 2: Using `@`, `#&`, `#`</div>
              <pre className="text-xs font-mono text-slate-600 whitespace-pre-wrap">
@ What is 2 + 2?
# 3
#& 4
# 5
# 22
              </pre>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white p-4 sm:p-6 rounded-lg shadow-sm border border-slate-200 space-y-6">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">Upload Text File (.txt)</label>
          <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-slate-300 border-dashed rounded-lg cursor-pointer bg-slate-50 hover:bg-slate-100 transition-colors">
            <div className="flex flex-col items-center justify-center pt-5 pb-6">
              <FileText className="w-8 h-8 text-slate-400 mb-2" />
              <p className="text-sm text-slate-500"><span className="font-semibold">Click to upload</span> or drag and drop</p>
            </div>
            <input type="file" accept=".txt" onChange={handleFileUpload} className="hidden" />
          </label>
        </div>

        {parsedQuestions.length > 0 && (
          <div className={`p-4 rounded-lg border ${invalidCount > 0 ? 'bg-orange-50 border-orange-200' : 'bg-green-50 border-green-200'} flex items-start gap-3`}>
            {invalidCount > 0 ? <AlertTriangle className="w-5 h-5 text-orange-600 shrink-0 mt-0.5" /> : <CheckCircle className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />}
            <div>
              <p className={`font-medium ${invalidCount > 0 ? 'text-orange-800' : 'text-green-800'}`}>
                Parsed {parsedQuestions.length} questions
              </p>
              <p className={`text-sm ${invalidCount > 0 ? 'text-orange-700' : 'text-green-700'}`}>
                {currentValidQuestions.length} valid questions ready for import. {invalidCount > 0 && `${invalidCount} invalid questions will be skipped (missing text, < 2 options, or no correct option marked).`}
              </p>
            </div>
          </div>
        )}

        {currentValidQuestions.length > 0 && (
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 font-medium text-sm text-slate-700">Preview (First 5 valid questions)</div>
            <div className="p-4 space-y-4 max-h-64 overflow-y-auto bg-white">
              {currentValidQuestions.slice(0, 5).map((q, idx) => (
                <div key={idx} className="text-sm">
                  <div className="font-medium text-slate-800 mb-1">{idx + 1}. {q.text}</div>
                  <div className="pl-4 space-y-1">
                    {q.options.map((opt, oIdx) => (
                      <div key={oIdx} className={oIdx.toString() === q.correctOption ? 'text-green-700 font-medium flex items-center gap-1' : 'text-slate-600'}>
                        {oIdx.toString() === q.correctOption && <div className="w-1.5 h-1.5 rounded-full bg-green-500 mr-1" />}
                        {opt}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {currentValidQuestions.length > 5 && (
                <div className="text-center text-sm text-slate-500 pt-2 italic">... and {currentValidQuestions.length - 5} more</div>
              )}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-slate-100">
           <div>
             <label className="block text-sm font-medium text-slate-700">Exam Title</label>
             <input type="text" value={examTitle} onChange={e => setExamTitle(e.target.value)} placeholder="e.g. Midterm Test" className="mt-1 block w-full rounded-md border-slate-300 shadow-sm border p-2" />
           </div>
           <div>
             <label className="block text-sm font-medium text-slate-700">Time Limit (minutes)</label>
             <input type="number" value={timeLimit} onChange={e => setTimeLimit(Number(e.target.value))} min="1" className="mt-1 block w-full rounded-md border-slate-300 shadow-sm border p-2" />
           </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
           <div>
             <label className="block text-sm font-medium text-slate-700">Number of Variants</label>
             <input type="number" value={numVariants} onChange={e => setNumVariants(Number(e.target.value))} min="1" max="100" className="mt-1 block w-full rounded-md border-slate-300 shadow-sm border p-2" />
             <p className="text-xs text-slate-500 mt-1">Generates exact copies of the pool (useful with shuffle).</p>
           </div>
        </div>

        {currentValidQuestions.length > 0 && (
          <div className="pt-4 border-t border-slate-100 space-y-4">
            <h3 className="font-semibold text-slate-800">Variant Generation Rules</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
               <div>
                 <label className="block text-sm font-medium text-slate-700">Range Start</label>
                 <input type="number" value={rangeStart} onChange={e => setRangeStart(Number(e.target.value))} min="1" max={currentValidQuestions.length} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm border p-2" />
               </div>
               <div>
                 <label className="block text-sm font-medium text-slate-700">Range End</label>
                 <input type="number" value={rangeEnd} onChange={e => setRangeEnd(Number(e.target.value))} min="1" max={currentValidQuestions.length} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm border p-2" />
               </div>
            </div>

            <div className="flex flex-col gap-3 p-4 bg-slate-50 rounded-lg border border-slate-200">
               <label className="flex items-center space-x-2 cursor-pointer min-h-[44px]">
                 <input type="checkbox" checked={useEntireRange} onChange={e => setUseEntireRange(e.target.checked)} className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-5 h-5" />
                 <span className="text-sm font-medium text-slate-700">Use all {Math.max(0, maxAvailable)} questions in range for each variant</span>
               </label>

               {!useEntireRange && (
                 <div>
                   <label className="block text-sm font-medium text-slate-700">Randomly pick N questions per variant</label>
                   <input type="number" value={randomPickCount} onChange={e => setRandomPickCount(Number(e.target.value))} min="1" max={Math.max(1, maxAvailable)} className="mt-1 block w-full max-w-[200px] rounded-md border-slate-300 shadow-sm border p-2" />
                 </div>
               )}
            </div>

            {(!isRangeValid || !isPickValid) && (
              <p className="text-red-600 text-sm font-medium mt-2">
                {!isRangeValid ? "Range is invalid." : "Pick count must be within range size."}
              </p>
            )}

            {isRangeValid && isPickValid && (
               <p className="text-blue-600 text-sm font-medium mt-2">
                 Each variant will have {pickCount} questions.
               </p>
            )}
          </div>
        )}

        <div className="space-y-3 pt-4 border-t border-slate-100">
           <label className="flex items-center space-x-2 cursor-pointer min-h-[44px]">
             <input type="checkbox" checked={shuffle} onChange={e => setShuffle(e.target.checked)} className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-5 h-5" />
             <span className="text-sm font-medium text-slate-700">Shuffle questions and options (per variant)</span>
           </label>

           <label className="flex items-center space-x-2 cursor-pointer min-h-[44px]">
             <input type="checkbox" checked={publishImmediately} onChange={e => setPublishImmediately(e.target.checked)} className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-5 h-5" />
             <span className="text-sm font-medium text-slate-700">Publish immediately</span>
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
           onClick={publishExam}
           disabled={isPublishing || !canPublish}
           className="w-full bg-blue-600 text-white font-bold py-3 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors min-h-[44px] mt-4"
        >
          {isPublishing ? 'Importing...' : 'Import Exam'}
        </button>
      </div>
    </div>
  );
}
