const { changeOwnPassword } = require('../services/passwordService');
const { issueSession } = require('../services/sessionService');
const { publicError } = require('../utils/security');
exports.changeOwnPassword = async (req, res) => {
  try {
    await changeOwnPassword(req.user, req.body);
    await issueSession(req.user, req, res);
    res.json({ message: 'Senha alterada. As outras sessões foram encerradas.' });
  } catch (error) {
    res.status(error.status || 500).json({ error: publicError(error, 'Não foi possível alterar a senha.') });
  }
};
