if (process.env.NODE_ENV !== 'test') throw new Error('Fixture restrita aos testes. Use convite ou recuperação verificada.');
const logger = require('../utils/safeLogger').forModule('seed_client');
const bcrypt = require('bcrypt');
const db = require('../config/database');

const seed = async () => {
  db.run(`INSERT INTO Clientes (nome, email, telefone) VALUES ('Cliente Teste 2', 'cliente2@courtmanager.com', '11999999999')`, function(err) {
    if(err) {
      logger.error(err);
      return;
    }
    const cliente_id = this.lastID;
    bcrypt.hash('cliente123', 12).then(hash => {
      db.run(`INSERT INTO Usuarios (nome, email, senha_hash, perfil, cliente_id) VALUES ('Cliente Teste', 'cliente2@courtmanager.com', ?, 'Cliente', ?)`, [hash, cliente_id], (err) => {
        if(!err) logger.log('Usuário Cliente inserido! (cliente2@courtmanager.com / cliente123)');
      });
    });
  });
};
seed();
