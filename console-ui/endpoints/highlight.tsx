import type { ReactNode } from 'react';
import { prettyJson } from './requestBuilder';

const TOKEN = /("(?:\\.|[^"\\])*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false|null)\b/g;

/** Pretty JSON as spans for keys, strings and numbers; any other text is returned as it is. */
export const highlightJson = (body: string): ReactNode[] => {
  const pretty = prettyJson(body);

  if (pretty === null) return [body];

  const parts: ReactNode[] = [];
  let last = 0;

  for (const match of pretty.matchAll(TOKEN)) {
    const index = match.index;

    if (index > last) parts.push(pretty.slice(last, index));

    const [text, string, colon, number, literal] = match;
    const key = `${index}`;

    if (string !== undefined) {
      parts.push(
        <span key={key} className={colon ? 'k' : 's'}>
          {string}
        </span>,
      );

      if (colon) parts.push(colon);
    } else if (number !== undefined || literal !== undefined) {
      parts.push(
        <span key={key} className="n">
          {text}
        </span>,
      );
    }

    last = index + text.length;
  }

  if (last < pretty.length) parts.push(pretty.slice(last));

  return parts;
};
