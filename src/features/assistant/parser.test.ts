import { describe, it, expect } from 'vitest';
import { decodeTextFile, parseBankText, serializeBank } from './parser';

const texts = (r: ReturnType<typeof parseBankText>) => r.questions.map(q => q.text);
const opts = (r: ReturnType<typeof parseBankText>, i = 0) =>
  r.questions[i].options.map(o => `${o.correct ? '+' : '-'}${o.text}`);

describe('parseBankText: the basic format', () => {
  it('reads ? question, + right answer, - wrong answers', () => {
    const r = parseBankText('?What is 2+2?\n-3\n+4\n-5\n');
    expect(texts(r)).toEqual(['What is 2+2?']);
    expect(opts(r)).toEqual(['-3', '+4', '-5']);
    expect(r.issues).toEqual([]);
  });

  it('allows several right answers', () => {
    const r = parseBankText('?Pick primes\n+2\n+3\n-4\n');
    expect(r.questions[0].options.filter(o => o.correct)).toHaveLength(2);
  });

  it('copes with BOM, CRLF, tabs and blank lines between questions', () => {
    const r = parseBankText('\uFEFF?Q1\r\n-a\r\n+b\r\n\r\n\r\n?Q2\r\n- \tc\r\n+\td\r\n');
    expect(texts(r)).toEqual(['Q1', 'Q2']);
    expect(opts(r, 1)).toEqual(['-c', '+d']);
  });

  it('tolerates "? text", "?. text" and "?.. text"', () => {
    const r = parseBankText('? One\n-a\n+b\n?. Two\n-a\n+b\n?.. Three\n-a\n+b\n');
    expect(texts(r)).toEqual(['One', 'Two', 'Three']);
  });

  it('keeps Cyrillic and Tajik letters', () => {
    const r = parseBankText('?Пойтахти Тоҷикистон кадом аст?\n+Душанбе\n-Хуҷанд\n');
    expect(r.questions[0].text).toBe('Пойтахти Тоҷикистон кадом аст?');
    expect(opts(r)).toEqual(['+Душанбе', '-Хуҷанд']);
  });

  it('records the 1-based source line of each question', () => {
    const r = parseBankText('?A\n-x\n+y\n\n?B\n-x\n+y\n');
    expect(r.questions.map(q => q.line)).toEqual([1, 5]);
  });
});

describe('parseBankText: real-world mess', () => {
  it('treats & after the dash as the right answer', () => {
    const r = parseBankText('?Who?\n- \t&K. Marx;\n- \tWeber;\n');
    expect(opts(r)).toEqual(['+K. Marx;', '-Weber;']);
  });

  it('ignores a header line before the first question', () => {
    const r = parseBankText('DIF\n\n?Q\n-a\n+b\n');
    expect(texts(r)).toEqual(['Q']);
    expect(r.issues).toMatchObject([{ kind: 'ignored-line', line: 1, skipped: false }]);
  });

  it('ignores a lone "." line instead of making it an option', () => {
    const r = parseBankText('?Q\n-a.\n+b.\n.\n');
    expect(opts(r)).toEqual(['-a.', '+b.']);
  });

  it('takes an unmarked line after a finished option as a new wrong option', () => {
    const r = parseBankText('?Q\n+first;\n-second;\nthird;\n');
    expect(opts(r)).toEqual(['+first;', '-second;', '-third;']);
    expect(r.issues.map(i => i.kind)).toContain('unmarked-option');
  });

  it('joins a wrapped option onto the previous one when that did not end a sentence', () => {
    const r = parseBankText('?Q\n+a long option that\ncontinues here\n-other\n');
    expect(opts(r)).toEqual(['+a long option that continues here', '-other']);
  });

  it('joins a wrapped question text', () => {
    const r = parseBankText('?A very long question\nthat wraps?\n+yes\n-no\n');
    expect(texts(r)).toEqual(['A very long question that wraps?']);
  });

  it('starts a new question at a numbered line without ?', () => {
    const r = parseBankText('?One\n-a\n+b\n\n159. Define the electoral system?\n-x\n+y\n');
    expect(texts(r)).toEqual(['One', 'Define the electoral system?']);
    expect(r.issues.map(i => i.kind)).toContain('unmarked-question');
  });

  it('a line ending in ? after a finished option block starts a new question (here it has no options, so it is skipped)', () => {
    const r = parseBankText('?One\n-a\n+b\nwhat is this?\n-x\n');
    expect(texts(r)).toEqual(['One']);
    expect(r.issues).toContainEqual(expect.objectContaining({ kind: 'few-options', skipped: true }));
  });

  it('but with only one option so far, the same line is a wrapped option, not a new question', () => {
    const r = parseBankText('?One\n+a\nwhat is this?\n-b\n');
    expect(texts(r)).toEqual(['One']);
    expect(opts(r)).toEqual(['+a what is this?', '-b']);
  });
});

describe('parseBankText: several options on one line', () => {
  it('splits when sentence-ending punctuation precedes the separators', () => {
    const r = parseBankText('?How many?\n-one. + two -three. -four -five\n');
    expect(opts(r)).toEqual(['-one.', '+two', '-three.', '-four', '-five']);
    expect(r.issues[0].kind).toBe('inline-options');
  });

  it('splits when a marker is glued to a word', () => {
    const r = parseBankText('?Which?\n-democratic -socialist\n+civil\n-feudal\n');
    expect(opts(r)).toEqual(['-democratic', '-socialist', '+civil', '-feudal']);
  });

  it('splits a whole question written on one line, including "- word" separators', () => {
    const r = parseBankText('?When?\n-in the 5th century - 20th century - 18th century +second half of the 19th century\n');
    expect(opts(r)).toEqual(['-in the 5th century', '-20th century', '-18th century', '+second half of the 19th century']);
  });

  it('splits plain numbers when each ends with a full stop', () => {
    const r = parseBankText('?Year?\n-1990. -1991. +1994. -1989. -1993.\n');
    expect(opts(r)).toEqual(['-1990.', '-1991.', '+1994.', '-1989.', '-1993.']);
  });

  it('does not split signs and ranges inside an option: +60, 14 -16', () => {
    const r = parseBankText('?T?\n- at a temperature of +60 C\n+ 14 -16 days\n- 5 - 6 days\n');
    expect(opts(r)).toEqual(['-at a temperature of +60 C', '+14 -16 days', '-5 - 6 days']);
    expect(r.issues).toEqual([]);
  });

  it('does not split a hyphenated phrase', () => {
    const r = parseBankText('?Q\n+steam-formalin chamber\n-up - down\n');
    expect(opts(r)).toEqual(['+steam-formalin chamber', '-up - down']);
  });
});

describe('parseBankText: what gets skipped, and why', () => {
  it('skips a question without any right answer and reports it', () => {
    const r = parseBankText('?Q1\n-a\n-b\n?Q2\n-a\n+b\n');
    expect(texts(r)).toEqual(['Q2']);
    expect(r.issues).toContainEqual(expect.objectContaining({ kind: 'no-correct', line: 1, skipped: true }));
    expect(r.total).toBe(2);
    expect(r.skipped).toBe(1);
  });

  it('skips a question with fewer than two options', () => {
    const r = parseBankText('?Q\n+only\n');
    expect(r.questions).toEqual([]);
    expect(r.issues[0].kind).toBe('few-options');
  });

  it('skips a question without text', () => {
    const r = parseBankText('?\n-a\n+b\n');
    expect(r.issues[0].kind).toBe('no-text');
  });

  it('removes exact duplicates regardless of option order and case, and counts them', () => {
    const r = parseBankText('?Same\n-a\n+b\n\n?same\n+B\n-A\n\n?Different\n-a\n+b\n');
    expect(texts(r)).toEqual(['Same', 'Different']);
    expect(r.duplicates).toBe(1);
  });

  it('keeps duplicates when asked to, but still counts them', () => {
    const r = parseBankText('?Same\n-a\n+b\n\n?Same\n-a\n+b\n', { dedupe: false });
    expect(r.questions).toHaveLength(2);
    expect(r.duplicates).toBe(1);
    expect(r.skipped).toBe(0);
    expect(r.issues.some(i => i.kind === 'duplicate')).toBe(false);
  });

  it('keeps the same question text when the options differ', () => {
    const r = parseBankText('?Same\n-a\n+b\n\n?Same\n-a\n+c\n');
    expect(r.questions).toHaveLength(2);
  });

  it('returns nothing, without throwing, for an empty or unrelated file', () => {
    expect(parseBankText('').questions).toEqual([]);
    expect(parseBankText('just some notes\nnot a test\n').questions).toEqual([]);
  });
});

describe('parseBankText: the legacy @ / # format', () => {
  it('reads @ questions with # options and #& for the right answer', () => {
    const r = parseBankText('@Question one\n# wrong\n#& right\n@Question two\n#&yes\n# no\n');
    expect(texts(r)).toEqual(['Question one', 'Question two']);
    expect(opts(r, 0)).toEqual(['-wrong', '+right']);
    expect(opts(r, 1)).toEqual(['+yes', '-no']);
  });
});

describe('serializeBank', () => {
  it('round-trips through parseBankText', () => {
    const source = parseBankText('?One\n-a\n+b\n\n?Two\n+x\n+y\n-z\n');
    const again = parseBankText(serializeBank(source.questions));
    expect(again.questions.map(q => [q.text, q.options])).toEqual(source.questions.map(q => [q.text, q.options]));
  });
});

describe('decodeTextFile', () => {
  it('decodes UTF-8', () => {
    const bytes = new TextEncoder().encode('?Тоҷикистон');
    expect(decodeTextFile(bytes.buffer)).toBe('?Тоҷикистон');
  });

  it('falls back to windows-1251 for old Cyrillic files', () => {
    // "Привет" in windows-1251: CF F0 E8 E2 E5 F2 (not valid UTF-8)
    const bytes = new Uint8Array([0xcf, 0xf0, 0xe8, 0xe2, 0xe5, 0xf2]);
    expect(decodeTextFile(bytes.buffer)).toBe('Привет');
  });
});
