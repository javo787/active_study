with open("src/app/exam/ExamClient.tsx", "r") as f:
    content = f.read()

import re

# Add isSubmitting and submittingRef
content = content.replace(
    "const [isStarting, setIsStarting] = useState(false);",
    "const [isStarting, setIsStarting] = useState(false);\n  const [isSubmitting, setIsSubmitting] = useState(false);\n  const submittingRef = React.useRef(false);"
)

# Use isSubmitting and submittingRef in handleFinishExam
content = content.replace(
"""  const handleFinishExam = useCallback(async () => {
    if (!exam) return;
    if (!attempt && !isPreviewMode) return;

    try {""",
"""  const handleFinishExam = useCallback(async () => {
    if (!exam) return;
    if (!attempt && !isPreviewMode) return;
    if (submittingRef.current) return;

    submittingRef.current = true;
    setIsSubmitting(true);

    try {"""
)

content = content.replace(
"""      await updateDoc(doc(db, 'attempts', attempt!.id), {
        status: 'completed',
        finishedAt: serverTimestamp(),
        score,
        totalQuestions: questions.length,
        answers: answers,
      });
      setAttempt(prev => prev ? {...prev, status: 'completed', score, totalQuestions: questions.length} : null);
      setStatus('completed');

    } catch (err) {
      console.error(err);
      toast.error('Failed to submit exam');
    }
  }, [attempt, questions, answers, exam, isPreviewMode]);""",
"""      const now = Timestamp.now();
      await updateDoc(doc(db, 'attempts', attempt!.id), {
        status: 'completed',
        finishedAt: now,
        score,
        totalQuestions: questions.length,
        answers: answers,
      });
      setAttempt(prev => prev ? {...prev, status: 'completed', score, totalQuestions: questions.length, finishedAt: now} : null);
      setStatus('completed');

    } catch (err) {
      console.error(err);
      toast.error('Failed to submit exam');
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  }, [attempt, questions, answers, exam, isPreviewMode]);"""
)

# Apply Timestamp.fromMillis in loadExamAndAttempt auto submit
content = content.replace(
"""             setAttempt(prev => prev ? {...prev, status: 'completed', score: finalScore, totalQuestions: loadedQuestions.length} : null);""",
"""             setAttempt(prev => prev ? {...prev, status: 'completed', score: finalScore, totalQuestions: loadedQuestions.length, finishedAt: Timestamp.fromMillis(computedDeadline)} : null);"""
)

# Add missing React import
if "import React" not in content and "import { useEffect, useState, useCallback, useRef } from 'react';" not in content:
    content = content.replace(
        "import { useEffect, useState, useCallback } from 'react';",
        "import React, { useEffect, useState, useCallback, useRef } from 'react';"
    )
elif "useRef" not in content:
    content = content.replace(
        "import { useEffect, useState, useCallback } from 'react';",
        "import { useEffect, useState, useCallback, useRef } from 'react';"
    )

content = content.replace("React.useRef", "useRef")

# Apply isSubmitting to buttons
content = content.replace(
"""               <button
                 onClick={() => {
                   setShowConfirmSubmit(false);
                   handleFinishExam();
                 }}
                 className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-colors"
               >
                 Yes, Submit Now
               </button>""",
"""               <button
                 onClick={() => {
                   setShowConfirmSubmit(false);
                   handleFinishExam();
                 }}
                 disabled={isSubmitting}
                 className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-colors disabled:opacity-50"
               >
                 Yes, Submit Now
               </button>"""
)

content = content.replace(
"""              <button
                onClick={() => {
                  setShowNavigator(false);
                  setShowConfirmSubmit(true);
                }}
                className="px-6 py-3 bg-slate-900 text-white rounded-lg font-semibold hover:bg-slate-800 transition-colors"
              >
                Submit Exam
              </button>""",
"""              <button
                onClick={() => {
                  setShowNavigator(false);
                  setShowConfirmSubmit(true);
                }}
                disabled={isSubmitting}
                className="px-6 py-3 bg-slate-900 text-white rounded-lg font-semibold hover:bg-slate-800 transition-colors disabled:opacity-50"
              >
                Submit Exam
              </button>"""
)

with open("src/app/exam/ExamClient.tsx", "w") as f:
    f.write(content)
