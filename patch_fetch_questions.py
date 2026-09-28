with open("src/app/exam/ExamClient.tsx", "r") as f:
    content = f.read()

content = content.replace(
"""        if (attemptData.status === 'completed') {
          setStatus('completed');
          return;
        }""",
"""        if (attemptData.status === 'completed') {
          // If we open a completed attempt from dashboard and might want to review answers, load questions
          const qSnapshot = await getDocs(collection(db, `exams/${examData.id}/variants/${attemptData.variantId}/questions`));
          if (cancelled) return;
          const loadedQuestions = qSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Question));
          setQuestions(loadedQuestions);
          setAnswers(attemptData.answers || {});

          setStatus('completed');
          return;
        }"""
)

with open("src/app/exam/ExamClient.tsx", "w") as f:
    f.write(content)
