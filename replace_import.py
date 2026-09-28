with open("src/app/exam/ExamClient.tsx", "r") as f:
    content = f.read()

content = content.replace(
    "import ProfileSetup from '@/components/ProfileSetup';",
    "import ProfileSetup from '@/components/ProfileSetup';\nimport InAppBrowserNotice from '@/components/InAppBrowserNotice';"
)

with open("src/app/exam/ExamClient.tsx", "w") as f:
    f.write(content)
