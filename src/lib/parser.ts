export interface ParsedQuestion {
  text: string;
  options: string[];
  correctOption: string; // The index of the correct option as string or the text
}

export function parseExamFile(fileContent: string): ParsedQuestion[] {
  const lines = fileContent.split('\n').map((l) => l.trim()).filter(Boolean);
  const questions: ParsedQuestion[] = [];

  let currentQuestion: Partial<ParsedQuestion> = {};

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Format 1
    if (line.startsWith('?')) {
      if (currentQuestion.text && currentQuestion.options) {
         questions.push(currentQuestion as ParsedQuestion);
      }
      currentQuestion = { text: line.substring(1).trim(), options: [] };
    } else if (line.startsWith('+')) {
      const opt = line.substring(1).trim();
      currentQuestion.options?.push(opt);
      currentQuestion.correctOption = (currentQuestion.options!.length - 1).toString();
    } else if (line.startsWith('-')) {
      const opt = line.substring(1).trim();
      currentQuestion.options?.push(opt);
    }
    // Format 2
    else if (line.startsWith('@')) {
       if (currentQuestion.text && currentQuestion.options) {
         questions.push(currentQuestion as ParsedQuestion);
      }
      currentQuestion = { text: line.substring(1).trim(), options: [] };
    } else if (line.startsWith('# &') || line.startsWith('#&')) {
       const prefixLen = line.startsWith('# &') ? 3 : 2;
       const opt = line.substring(prefixLen).trim();
       currentQuestion.options?.push(opt);
       currentQuestion.correctOption = (currentQuestion.options!.length - 1).toString();
    } else if (line.startsWith('#')) {
       const opt = line.substring(1).trim();
       currentQuestion.options?.push(opt);
    }
  }

  if (currentQuestion.text && currentQuestion.options) {
      questions.push(currentQuestion as ParsedQuestion);
  }

  return questions;
}
