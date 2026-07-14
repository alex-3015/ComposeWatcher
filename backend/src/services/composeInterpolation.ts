import fs from 'fs';
import path from 'path';

export type ComposeEnvironment = Record<string, string>;

const BRACED_VARIABLE_RE = /\$\{([a-zA-Z_][a-zA-Z0-9_]*)(?:(:-|-)([^}]*))?\}/g;
const UNBRACED_VARIABLE_RE = /\$([a-zA-Z_][a-zA-Z0-9_]*)/g;
const ESCAPED_DOLLAR = '\u0000compose-watcher-dollar\u0000';

function parseEnvironmentValue(raw: string): string {
  const trimmed = raw.trim();
  const singleQuoted = trimmed.match(/^'([^']*)'(?:\s+#.*)?$/);
  if (singleQuoted) return singleQuoted[1];

  const doubleQuoted = trimmed.match(/^"((?:\\.|[^"\\])*)"(?:\s+#.*)?$/);
  if (doubleQuoted) {
    return doubleQuoted[1].replace(/\\([\\"nrt])/g, (_match, escaped: string) => {
      if (escaped === 'n') return '\n';
      if (escaped === 'r') return '\r';
      if (escaped === 't') return '\t';
      return escaped;
    });
  }

  return trimmed.replace(/\s+#.*$/, '').trim();
}

export function parseComposeEnvironment(contents: string): ComposeEnvironment {
  const environment: ComposeEnvironment = {};
  for (const line of contents.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    environment[match[1]] = parseEnvironmentValue(match[2]);
  }
  return environment;
}

export function interpolateComposeValue(source: string, environment: ComposeEnvironment): string {
  let result = source.replaceAll('$$', ESCAPED_DOLLAR);

  for (let pass = 0; pass < 10; pass += 1) {
    const previous = result;
    result = result.replace(
      BRACED_VARIABLE_RE,
      (expression, name: string, operator: string | undefined, fallback: string | undefined) => {
        const value = environment[name];
        const isSet = value !== undefined;
        if (!operator) return isSet ? value : expression;
        if (operator === ':-') return isSet && value !== '' ? value : (fallback ?? '');
        return isSet ? value : (fallback ?? '');
      },
    );
    result = result.replace(UNBRACED_VARIABLE_RE, (expression, name: string) => {
      return environment[name] ?? expression;
    });
    if (result === previous) break;
  }

  return result.replaceAll(ESCAPED_DOLLAR, '$');
}

export async function loadComposeEnvironment(composeFilePath: string): Promise<ComposeEnvironment> {
  try {
    const contents = await fs.promises.readFile(
      path.join(path.dirname(composeFilePath), '.env'),
      'utf-8',
    );
    const parsed = parseComposeEnvironment(contents);
    return Object.fromEntries(
      Object.entries(parsed).map(([name, value]) => [name, interpolateComposeValue(value, parsed)]),
    );
  } catch {
    return {};
  }
}
