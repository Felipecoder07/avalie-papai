// Runtime logs use a fixed module label and allowlisted error codes. Never serialize
// errors, HTTP/SMTP payloads, headers, URLs or arbitrary strings (even on success).
const codes = new Set(['SQLITE_BUSY', 'SQLITE_CONSTRAINT', 'SQLITE_ERROR', 'ETIMEDOUT', 'ECONNREFUSED', 'ECONNRESET']);
exports.forModule = moduleName => Object.fromEntries(['log', 'warn', 'error'].map(level => [level, (...args) => {
  const code = args.map(value => value?.code).find(value => codes.has(value));
  console[level](JSON.stringify({ module: moduleName, level, ...(code ? { code } : {}) }));
}]));
