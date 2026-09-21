function protectPublicFiles(req, res, next) {
  let pathname;
  try { pathname = decodeURIComponent(req.path); } catch { return res.sendStatus(400); }
  const segments = pathname.replaceAll('\\', '/').split('/');
  if (segments.some(part => part.startsWith('.')) || ['node_modules', 'backups', 'data', 'backend'].includes(segments[1]?.toLowerCase()) ||
      /\.(?:env|sqlite3?|db|sql|bak|backup|map)(?:-(?:wal|shm))?$/i.test(pathname) ||
      /\/(?:package(?:-lock)?\.json|yarn\.lock|pnpm-lock\.yaml)$/i.test(pathname)) return res.sendStatus(404);
  next();
}
module.exports = { protectPublicFiles };
