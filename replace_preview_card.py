with open("src/app/exam/ExamClient.tsx", "r") as f:
    content = f.read()

content = content.replace(
"""           <h2 className="text-2xl font-bold text-slate-800 mb-6">Exam Completed</h2>""",
"""           <h2 className="text-2xl font-bold text-slate-800 mb-6 flex items-center justify-center gap-2">
             Exam Completed
             {isPreviewMode && <span className="bg-blue-100 text-blue-800 text-xs font-bold px-2 py-1 rounded">PREVIEW</span>}
           </h2>"""
)

with open("src/app/exam/ExamClient.tsx", "w") as f:
    f.write(content)
