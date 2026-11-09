// readSource.js: read a source file as text, with Windows line endings turned into plain "\n".
// Why: some Star check files look for multi-line pieces of code (for example a "} finally {" line
// followed by the next line). Jeffrey's PCs check files out with CRLF line endings (core.autocrlf),
// so "\n" in those searches would not match and the checks failed there while passing elsewhere.
// Reading through this helper makes every check see the same text on any checkout. It only changes
// the text the check looks at; it never touches the file itself.

import { readFileSync } from 'node:fs';

// Accepts a file path or a URL object (new URL(..., import.meta.url)).
export function readSource(pathOrUrl) {
  return readFileSync(pathOrUrl, 'utf8').replace(/\r\n/g, '\n');
}
