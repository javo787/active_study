with open("src/app/exam/ExamClient.tsx", "r") as f:
    content = f.read()

content = content.replace(
"""        await updateDoc(doc(db, 'attempts', attempt.id), {""",
"""        await updateDoc(doc(db, 'attempts', attempt!.id), {"""
)

with open("src/app/exam/ExamClient.tsx", "w") as f:
    f.write(content)
