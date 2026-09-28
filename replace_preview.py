with open("src/app/exam/ExamClient.tsx", "r") as f:
    content = f.read()

content = content.replace(
"""  const handleSelectOption = async (questionId: string, originalOptionIndex: number) => {
    if (!attempt || status !== 'in_progress') return;

    const newAnswers = { ...answers, [questionId]: originalOptionIndex };
    setAnswers(newAnswers);

    if (isPreviewMode) return;""",
"""  const handleSelectOption = async (questionId: string, originalOptionIndex: number) => {
    if (status !== 'in_progress') return;
    if (!attempt && !isPreviewMode) return;

    const newAnswers = { ...answers, [questionId]: originalOptionIndex };
    setAnswers(newAnswers);

    if (isPreviewMode) return;"""
)

content = content.replace(
"""  const handleFinishExam = useCallback(async () => {
    if (!attempt || !exam) return;

    try {
      const score = questions.filter(q => answers[q.id] === q.correctOption).length;

      if (!isPreviewMode) {
        await updateDoc(doc(db, 'attempts', attempt.id), {
          status: 'completed',
          finishedAt: serverTimestamp(),
          score,
          totalQuestions: questions.length,
          answers: answers,
        });
      }
      setAttempt(prev => prev ? {...prev, status: 'completed', score, totalQuestions: questions.length} : null);
      setStatus('completed');

    } catch (err) {
      console.error(err);
      toast.error('Failed to submit exam');
    }
  }, [attempt, questions, answers, exam, isPreviewMode]);""",
"""  const handleFinishExam = useCallback(async () => {
    if (!exam) return;
    if (!attempt && !isPreviewMode) return;

    try {
      const score = questions.filter(q => answers[q.id] === q.correctOption).length;

      if (isPreviewMode) {
        // Dummy attempt for preview mode result screen
        setAttempt({
          id: 'preview',
          studentId: 'preview',
          studentName: 'Preview',
          studentEmail: 'preview',
          examId: exam.id,
          variantId: 'preview',
          status: 'completed',
          score,
          totalQuestions: questions.length,
          answers: answers,
        } as Attempt);
        setStatus('completed');
        return;
      }

      await updateDoc(doc(db, 'attempts', attempt!.id), {
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
  }, [attempt, questions, answers, exam, isPreviewMode]);"""
)

with open("src/app/exam/ExamClient.tsx", "w") as f:
    f.write(content)
