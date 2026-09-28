with open("src/app/dashboard/student/page.tsx", "r") as f:
    content = f.read()

import re

# Add useRef
content = content.replace(
    "import { useEffect, useState, useCallback } from 'react';",
    "import { useEffect, useState, useCallback, useRef } from 'react';"
)

content = content.replace(
    "const [searchQuery, setSearchQuery] = useState('');",
    "const [searchQuery, setSearchQuery] = useState('');\n  const lastFetchTimeRef = useRef<number>(0);"
)

content = content.replace(
"""      setExams(loadedExams);
      setAttempts(attemptsMap);
    } catch (error) {""",
"""      setExams(loadedExams);
      setAttempts(attemptsMap);
      lastFetchTimeRef.current = Date.now();
    } catch (error) {"""
)

content = content.replace(
"""  useEffect(() => {
    fetchData();
    const handleFocus = () => fetchData();
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [fetchData]);""",
"""  useEffect(() => {
    fetchData();
    const handleFocus = () => {
      if (Date.now() - lastFetchTimeRef.current > 60000) {
        fetchData();
      }
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [fetchData]);"""
)

with open("src/app/dashboard/student/page.tsx", "w") as f:
    f.write(content)
