// Shared fail-fast validator; run before importing app/database or starting jobs.
const { validateEnvironment } = require('../utils/security');
module.exports = { validateEnvironment };
