with open("src/app/exam/ExamClient.tsx", "r") as f:
    content = f.read()

import re

# Fix any
content = content.replace(
    "} catch (err: any) {",
    "} catch (err: unknown) {"
)
content = content.replace(
    "if (err?.code === 'permission-denied') {",
    "if (typeof err === 'object' && err !== null && 'code' in err && (err as { code: string }).code === 'permission-denied') {"
)

# Fix unused var isCorrect
content = content.replace(
"""            {questions.map((q, idx) => {
              const userAnswer = answers[q.id];
              const isCorrect = userAnswer === q.correctOption;
              const skipped = userAnswer === undefined;""",
"""            {questions.map((q, idx) => {
              const userAnswer = answers[q.id];
              const skipped = userAnswer === undefined;"""
)

with open("src/app/exam/ExamClient.tsx", "w") as f:
    f.write(content)
