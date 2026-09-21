const { decrypt } = require('../../utils/security');

// One-time cutover: invalidate all credentials issued before the cookie-only release.
async function identityCutover(db) {
  await db.transaction(async () => {
    if (await db.getAsync('SELECT 1 FROM SecurityMigrations WHERE version=4')) return;
    const users = await db.allAsync('SELECT id,two_factor_secret FROM Usuarios WHERE two_factor_secret IS NOT NULL');
    for (const user of users) {
      if (decrypt(user.two_factor_secret, { allowPlaintext: true }) === 'JBSWY3DPEHPK3PXP') {
        await db.runAsync('UPDATE Usuarios SET two_factor_secret=NULL WHERE id=?', [user.id]);
        await db.runAsync('DELETE FROM MfaRecovery WHERE usuario_id=?', [user.id]);
      }
    }
    await db.runAsync('DELETE FROM MfaEnrollment');
    await db.runAsync('DELETE FROM SessionMfa');
    await db.runAsync('UPDATE AuthSessions SET revoked=1');
    await db.runAsync('UPDATE RecoveryChallenges SET used=1');
    await db.runAsync('UPDATE Usuarios SET reset_password_token=NULL,reset_password_expires=NULL');
    await db.runAsync('INSERT INTO SecurityMigrations(version) VALUES(4)');
  });
}
module.exports = { identityCutover };
