with open("src/app/exam/ExamClient.tsx", "r") as f:
    content = f.read()

import re
pattern = re.compile(r"  if \(status === 'unauthorized'\) \{.*?    \);\n  \}", re.DOTALL)

replacement = """  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] p-4">
        <div className="w-full max-w-md bg-white rounded-lg shadow-sm border border-slate-200 p-8 text-center">
          <h2 className="text-2xl font-bold text-slate-800 mb-4">Sign In Required</h2>
          <p className="text-slate-600 mb-6">You must be signed in to open this exam.</p>
          <InAppBrowserNotice />
          <button onClick={signInWithGoogle} className="inline-flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 min-h-[44px]">
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  if (user.role === 'student' && !user.fullName) {
    return <ProfileSetup />;
  }"""

new_content = pattern.sub(replacement, content)

with open("src/app/exam/ExamClient.tsx", "w") as f:
    f.write(new_content)
