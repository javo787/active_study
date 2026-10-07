// Parser for student test banks in the plain-text format already used for teachers' imports (and by .qst files):
//
//   ?Question text            (also "? text", "?. text", "@text" in the legacy format)
//   +the right answer         (several + lines = several right answers)
//   -a wrong answer
//
// Real banks are messier than that, so the parser is deliberately forgiving. Things seen in a real 446-question bank:
//   - the right answer marked with & after the dash ("- &Kung Fu Tzu;")
//   - several options on ONE line ("-one. + two -three. -four -five", or even a whole question in one line)
//   - an option whose line has no marker at all ("political culture;")
//   - a question without the ? marker, numbered instead ("159. Define the electoral system?")
//   - a header line before the first question, stray "." lines, BOM, CRLF, tabs
// Nothing is thrown away silently: whatever cannot be used is reported as an issue, and the rest is kept.

export interface ParsedOption {
  text: string;
  correct: boolean;
}

export interface ParsedQuestion {
  text: string;
  options: ParsedOption[];
  /** 1-based line of the question in the source file. */
  line: number;
}

export type IssueKind =
  | 'ignored-line' // text before the first question, or a line with no letters/digits
  | 'unmarked-option' // a line without a marker was taken as a separate (wrong) option
  | 'unmarked-question' // a numbered line without ? was taken as a new question
  | 'inline-options' // several options written on one line were split
  | 'no-text' // skipped: the question has no text
  | 'few-options' // skipped: fewer than two options
  | 'no-correct' // skipped: no option is marked as right
  | 'duplicate'; // skipped: an identical question already exists

export interface ParseIssue {
  kind: IssueKind;
  /** 1-based line in the source file. */
  line: number;
  /** Start of the question or of the line concerned, for display. */
  excerpt: string;
  /** True when the question was left out of the result. */
  skipped: boolean;
}

export interface ParseResult {
  questions: ParsedQuestion[];
  issues: ParseIssue[];
  /** Question blocks found in the file (before skipping). */
  total: number;
  skipped: number;
  duplicates: number;
}

interface Draft {
  text: string;
  options: ParsedOption[];
  line: number;
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();
// "Has something to read": Latin, Latin extended, Greek, Cyrillic (incl. Tajik letters) or a digit.
const hasContent = (s: string) => /[0-9A-Za-z\u00C0-\u052F]/.test(s);
const excerptOf = (s: string) => (s.length > 70 ? `${s.slice(0, 70)}…` : s);

/**
 * An option line may hold several options ("-one. + two -three"). The candidate separators are whitespace followed
 * by + or -. A hyphen or sign inside running text ("- 1990 - 1995 years", "temperature of +60", "14 -16 days") looks
 * the same, so the line is only split when at least one separator is unmistakable: the text before it ends a
 * sentence (. ; ! ?), or the marker is glued to a LETTER ("-socialist", "+mobilization"). Glued to a digit is not
 * enough: that is a number or a range. Once one separator is certain, every candidate in the line is a separator.
 */
function splitInlineOptions(line: string): string[] | null {
  const parts = line.split(/\s+(?=[+-])/);
  if (parts.length < 2) return null;
  for (let k = 0; k < parts.length - 1; k++) {
    if (/[.;!?]$/.test(parts[k].trim()) || /^[+-][^\s\d]/.test(parts[k + 1])) return parts;
  }
  return null;
}

/** The legacy format uses @ for questions and # / #& for options; it only applies when no ? question exists. */
function isLegacyFormat(lines: string[]): boolean {
  let hasAt = false;
  for (const raw of lines) {
    const s = raw.trim();
    if (s.startsWith('?')) return false;
    if (s.startsWith('@')) hasAt = true;
  }
  return hasAt;
}

export interface ParseOptions {
  /** Drop questions identical to an earlier one (same text and same options). Default true. */
  dedupe?: boolean;
}

export function parseBankText(raw: string, options: ParseOptions = {}): ParseResult {
  const dedupe = options.dedupe ?? true;
  const lines = raw.replace(/^\uFEFF/, '').split(/\r\n|\r|\n/);
  const legacy = isLegacyFormat(lines);

  const isQuestionStart = (s: string) => (legacy ? s.startsWith('@') : s.startsWith('?'));
  const isOptionStart = (s: string) => (legacy ? s.startsWith('#') : s.startsWith('+') || s.startsWith('-'));

  const nextNonBlank = (from: number): string | null => {
    for (let j = from + 1; j < lines.length; j++) {
      const t = lines[j].trim();
      if (t) return t;
    }
    return null;
  };

  const parseQuestionText = (s: string) =>
    clean(
      s
        .slice(1)
        .replace(/^[.\s]+/, '') // "?. text"
        .replace(/^\d+\s*[.)]\s+/, '') // "159. text": the app shows its own number
    );

  const parseOption = (s: string): ParsedOption => {
    if (legacy) {
      const m = /^#\s*(&?)\s*(.*)$/.exec(s)!;
      return { text: clean(m[2]), correct: m[1] === '&' };
    }
    const m = /^([+-])\s*(&?)\s*(.*)$/.exec(s)!;
    return { text: clean(m[3]), correct: m[1] === '+' || m[2] === '&' };
  };

  const drafts: Draft[] = [];
  const issues: ParseIssue[] = [];
  let cur: Draft | null = null;

  const note = (kind: IssueKind, line: number, text: string, skipped = false) =>
    issues.push({ kind, line, excerpt: excerptOf(text), skipped });

  for (let i = 0; i < lines.length; i++) {
    const s = lines[i].trim();
    if (!s) continue;
    const lineNo = i + 1;

    if (isQuestionStart(s)) {
      cur = { text: parseQuestionText(s), options: [], line: lineNo };
      drafts.push(cur);
      continue;
    }

    if (isOptionStart(s)) {
      if (!cur) {
        note('ignored-line', lineNo, s);
        continue;
      }
      const parts = legacy ? null : splitInlineOptions(s);
      if (parts) note('inline-options', lineNo, s);
      for (const part of parts ?? [s]) {
        const option = parseOption(part);
        if (option.text) cur.options.push(option);
        else note('ignored-line', lineNo, part); // a marker with nothing after it
      }
      continue;
    }

    // A line without any marker.
    if (!cur) {
      note('ignored-line', lineNo, s); // header such as "DIF" before the first question
      continue;
    }
    if (!hasContent(s)) {
      note('ignored-line', lineNo, s); // a lone "." or similar
      continue;
    }

    const next = nextNonBlank(i);
    const startsLikeQuestion = /^\d+\s*[.)]\s*\S/.test(s) || s.endsWith('?');
    if (!legacy && cur.options.length >= 2 && startsLikeQuestion && next !== null && isOptionStart(next)) {
      cur = { text: parseQuestionText(`?${s}`), options: [], line: lineNo };
      drafts.push(cur);
      note('unmarked-question', lineNo, s);
    } else if (cur.options.length === 0) {
      cur.text = clean(`${cur.text} ${s}`); // question text wrapped onto the next line
    } else {
      const last = cur.options[cur.options.length - 1];
      if (/[.;!?:]$/.test(last.text)) {
        cur.options.push({ text: clean(s), correct: false });
        note('unmarked-option', lineNo, s);
      } else {
        last.text = clean(`${last.text} ${s}`); // option text wrapped onto the next line
      }
    }
  }

  // Validation and de-duplication.
  const questions: ParsedQuestion[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  let duplicates = 0;

  for (const d of drafts) {
    let problem: IssueKind | null = null;
    if (!d.text) problem = 'no-text';
    else if (d.options.length < 2) problem = 'few-options';
    else if (!d.options.some(o => o.correct)) problem = 'no-correct';

    if (problem) {
      skipped++;
      note(problem, d.line, d.text || '(no text)', true);
      continue;
    }

    const key = `${d.text.toLowerCase()}|${d.options
      .map(o => `${o.correct ? '+' : '-'}${o.text.toLowerCase()}`)
      .sort()
      .join('|')}`;
    if (seen.has(key)) {
      duplicates++;
      if (dedupe) {
        skipped++;
        note('duplicate', d.line, d.text, true);
        continue;
      }
    }
    seen.add(key);
    questions.push({ text: d.text, options: d.options, line: d.line });
  }

  issues.sort((a, b) => a.line - b.line);
  return { questions, issues, total: drafts.length, skipped, duplicates };
}

/** Writes questions back in the same format (for "Export"); parseBankText(serializeBank(x)) gives x back. */
export function serializeBank(questions: { text: string; options: { text: string; correct: boolean }[] }[]): string {
  return (
    questions
      .map(q => [`?${q.text}`, ...q.options.map(o => `${o.correct ? '+' : '-'}${o.text}`)].join('\n'))
      .join('\n\n') + '\n'
  );
}

/**
 * Decodes the bytes of an uploaded file. UTF-8 first; if that is not valid UTF-8 (typical for older Windows files
 * with Cyrillic text) it falls back to windows-1251 instead of showing garbage.
 */
export function decodeTextFile(buffer: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder('windows-1251').decode(buffer);
  }
}
