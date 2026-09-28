with open("src/app/exam/ExamClient.tsx", "r") as f:
    content = f.read()

content = content.replace(
    "pb-[env(safe-area-inset-bottom)]",
    "pb-[calc(1rem+env(safe-area-inset-bottom))]"
)

with open("src/app/exam/ExamClient.tsx", "w") as f:
    f.write(content)
