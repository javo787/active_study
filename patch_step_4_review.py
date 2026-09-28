with open("src/app/exam/ExamClient.tsx", "r") as f:
    content = f.read()

import re

review_ui = """  if (status === 'review') {
    return (
      <div className="flex flex-col h-[100dvh] bg-slate-50">
        <header className="sticky top-0 z-20 bg-white border-b border-slate-200 shadow-sm px-4 py-3 flex items-center justify-between">
          <h2 className="font-bold text-slate-800">Answer Review</h2>
          <button onClick={() => setStatus('completed')} className="text-sm font-medium text-blue-600 hover:underline">
            Close
          </button>
        </header>
        <main className="flex-1 overflow-y-auto px-4 py-6">
          <div className="max-w-2xl mx-auto space-y-6">
            {questions.map((q, idx) => {
              const userAnswer = answers[q.id];
              const isCorrect = userAnswer === q.correctOption;
              const skipped = userAnswer === undefined;

              return (
                <div key={q.id} className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
                  <div className="flex gap-3 mb-4">
                    <span className="font-bold text-slate-400">{idx + 1}.</span>
                    <h3 className="text-slate-800 font-medium whitespace-pre-wrap">{q.text}</h3>
                  </div>

                  <div className="space-y-2 ml-7">
                    {q.options.map((opt, optIdx) => {
                      const isUserChoice = userAnswer === optIdx;
                      const isActualCorrect = q.correctOption === optIdx;

                      let rowClass = "p-3 rounded border text-sm flex gap-3";
                      if (isActualCorrect && isUserChoice) rowClass += " bg-green-50 border-green-200";
                      else if (isActualCorrect) rowClass += " bg-green-50 border-green-200";
                      else if (isUserChoice) rowClass += " bg-red-50 border-red-200";
                      else rowClass += " bg-slate-50 border-slate-100 text-slate-500 opacity-70";

                      return (
                        <div key={optIdx} className={rowClass}>
                          <div className="w-5 flex-shrink-0 flex items-center justify-center font-bold">
                             {isUserChoice && isActualCorrect && <span className="text-green-600">✓</span>}
                             {isUserChoice && !isActualCorrect && <span className="text-red-500">✗</span>}
                             {!isUserChoice && isActualCorrect && <span className="text-green-600">✓</span>}
                          </div>
                          <div className="flex-1">
                            <span className={isUserChoice || isActualCorrect ? 'text-slate-800' : ''}>{opt}</span>
                            {isActualCorrect && <span className="ml-2 text-xs font-bold text-green-700 uppercase">Correct Answer</span>}
                            {isUserChoice && !isActualCorrect && <span className="ml-2 text-xs font-bold text-red-600 uppercase">Your Answer</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {skipped && (
                    <div className="ml-7 mt-3 text-sm font-medium text-amber-600 bg-amber-50 px-3 py-2 rounded inline-block">
                      Question skipped (no answer provided)
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </main>
      </div>
    );
  }

  const currentQ = questions[currentQuestionIndex] as Question & { displayIndices?: number[] };"""

content = content.replace(
    "  const currentQ = questions[currentQuestionIndex] as Question & { displayIndices?: number[] };",
    review_ui
)

with open("src/app/exam/ExamClient.tsx", "w") as f:
    f.write(content)
