with open("src/app/exam/ExamClient.tsx", "r") as f:
    content = f.read()

content = content.replace(
    "}, [id, user?.uid, user?.role, user?.fullName, authLoading, isPreviewMode]);",
    "}, [id, user, authLoading, isPreviewMode]);"
)

with open("src/app/exam/ExamClient.tsx", "w") as f:
    f.write(content)
