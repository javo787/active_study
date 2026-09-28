with open("src/app/exam/ExamClient.tsx", "r") as f:
    content = f.read()

import re

new_completed_card = """           <div className="space-y-3">
             {exam?.showAnswers ? (
               <button
                 onClick={() => setStatus('review')}
                 className="w-full py-3 px-4 bg-blue-100 text-blue-700 hover:bg-blue-200 rounded-md font-medium transition-colors mb-2"
               >
                 Review answers
               </button>
             ) : (
               <p className="text-sm text-slate-500 italic mb-4">Answer review is disabled by your teacher.</p>
             )}
             <Link href="/dashboard/student" className="block w-full py-3 px-4 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-md font-medium transition-colors">
               Back to Dashboard
             </Link>
           </div>"""

content = content.replace(
"""           <div className="space-y-3">
             {exam?.showAnswers ? (
               <p className="text-sm text-slate-500 italic">Review answers coming soon...</p>
             ) : (
               <p className="text-sm text-slate-500 italic mb-4">Answer review is disabled by your teacher.</p>
             )}
             <Link href="/dashboard/student" className="block w-full py-3 px-4 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-md font-medium transition-colors">
               Back to Dashboard
             </Link>
           </div>""",
new_completed_card
)

# update state type definition
content = content.replace(
    "const [status, setStatus] = useState<'loading' | 'ready' | 'in_progress' | 'terminated' | 'completed' | 'unavailable'>('loading');",
    "const [status, setStatus] = useState<'loading' | 'ready' | 'in_progress' | 'terminated' | 'completed' | 'unavailable' | 'review'>('loading');"
)

with open("src/app/exam/ExamClient.tsx", "w") as f:
    f.write(content)
