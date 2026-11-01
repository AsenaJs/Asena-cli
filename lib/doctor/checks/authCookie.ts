import type { CheckResult } from '../../types';
import { AUTH_PACKAGE, escapeRegExp, importsFrom, lineOf, readSourceFiles } from '../authSource';
import type { SourceFile } from '../authSource';

export const AUTH_COOKIE_NAME = 'auth-cookie';

interface Problem {
  detail: string;
  hint: string;
}

const balancedObject = (code: string, open: number): string | null => {
  let depth = 0;

  for (let i = open; i < code.length; i++) {
    const char = code[i];

    if (char === '"' || char === "'" || char === '`') {
      let j = i + 1;

      while (j < code.length && code[j] !== char) {
        j += code[j] === '\\' ? 2 : 1;
      }

      i = j;
    } else if (char === '{') {
      depth++;
    } else if (char === '}' && --depth === 0) {
      return code.slice(open, i + 1);
    }
  }

  return null;
};

const objectAfter = (code: string, from: number, prefix: RegExp): string | null => {
  const match = prefix.exec(code.slice(from));

  return match ? balancedObject(code, from + match.index + match[0].length - 1) : null;
};

const literal = (object: string, key: string): string | boolean | undefined => {
  const match = new RegExp(
    `(?<![\\w$])(['"]?)${key}\\1\\s*:\\s*(?:'([^'\\\\\\n]*)'|"([^"\\\\\\n]*)"|(true|false))\\s*(?=[,}])`,
  ).exec(object);

  if (!match) {
    return undefined;
  }

  return match[4] ? match[4] === 'true' : (match[2] ?? match[3]);
};

const cookieProblems = (cookie: string): Problem[] => {
  if (cookie.includes('...')) {
    return [];
  }

  const name = literal(cookie, 'name');
  const domain = literal(cookie, 'domain');
  const cookiePath = literal(cookie, 'path');
  const secure = literal(cookie, 'secure');
  const sameSite = literal(cookie, 'sameSite');
  const problems: Problem[] = [];

  if (typeof name === 'string' && name.startsWith('__Host-')) {
    if (typeof domain === 'string') {
      problems.push({
        detail: `__Host- cookie '${name}' sets domain '${domain}'`,
        hint: 'remove domain from a __Host- cookie',
      });
    }

    if (typeof cookiePath === 'string' && cookiePath !== '/') {
      problems.push({
        detail: `__Host- cookie '${name}' sets path '${cookiePath}'`,
        hint: "use path '/' (the default) for a __Host- cookie",
      });
    }

    if (secure === false) {
      problems.push({
        detail: `__Host- cookie '${name}' sets secure: false`,
        hint: 'remove secure: false (the default is true)',
      });
    }
  }

  if (typeof name === 'string' && name.startsWith('__Secure-') && secure === false) {
    problems.push({
      detail: `__Secure- cookie '${name}' sets secure: false`,
      hint: 'remove secure: false (the default is true)',
    });
  }

  if (typeof sameSite === 'string' && sameSite.toLowerCase() === 'none' && secure === false) {
    problems.push({
      detail: "sameSite 'none' with secure: false",
      hint: "remove secure: false, or use sameSite 'lax'",
    });
  }

  return problems;
};

const fileProblems = (file: SourceFile): Problem[] => {
  const locals = importsFrom(file.code, AUTH_PACKAGE)
    .filter((binding) => binding.imported === 'Auth')
    .map((binding) => binding.local);
  const problems: Problem[] = [];

  for (const local of new Set(locals)) {
    for (const decorator of file.code.matchAll(new RegExp(`@${escapeRegExp(local)}\\s*\\(`, 'g'))) {
      const options = objectAfter(file.code, decorator.index + decorator[0].length, /^\s*(?:\(\s*\)\s*=>\s*\(\s*)?\{/);
      const cookie = options && objectAfter(options, 1, /(?<![\w$.])['"]?cookie['"]?\s*:\s*\{/);

      if (cookie) {
        const at = `${file.relPath}:${lineOf(file.code, decorator.index)}`;

        problems.push(...cookieProblems(cookie).map((problem) => ({ ...problem, detail: `${at} ${problem.detail}` })));
      }
    }
  }

  return problems;
};

export const checkAuthCookie = async (cwd: string): Promise<CheckResult> => {
  let files: SourceFile[];

  try {
    files = readSourceFiles(cwd);
  } catch (e) {
    return {
      name: AUTH_COOKIE_NAME,
      ok: false,
      detail: `could not scan ${cwd} for source files: ${(e as Error).message}`,
    };
  }

  const providers = files.filter((file) =>
    importsFrom(file.code, AUTH_PACKAGE).some((binding) => binding.imported === 'Auth'),
  );

  if (providers.length === 0) {
    return { name: AUTH_COOKIE_NAME, ok: true, detail: `no @Auth provider from ${AUTH_PACKAGE}` };
  }

  const problems = providers.flatMap(fileProblems);

  if (problems.length > 0) {
    return {
      name: AUTH_COOKIE_NAME,
      ok: false,
      detail: `browsers reject this session cookie: ${problems.map((problem) => problem.detail).join('; ')}`,
      hint: [...new Set(problems.map((problem) => problem.hint))].join(' | '),
    };
  }

  return {
    name: AUTH_COOKIE_NAME,
    ok: true,
    detail: 'no browser-rejected combination in the literal @Auth cookie options',
  };
};
