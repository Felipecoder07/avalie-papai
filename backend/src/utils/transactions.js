const { AsyncLocalStorage } = require('node:async_hooks');
// Owns the connection for the entire transaction, including raw callback users.
function installTransactions(db) {
  if (db.transaction) return db;
  const context = new AsyncLocalStorage();
  let locked = false, tail = Promise.resolve();
  const deferred = [];
  const raw = {};
  for (const method of ['run','get','all','exec']) {
    raw[method] = db[method].bind(db);
    db[method] = function (...args) {
      if (locked && !context.getStore()?.active) { deferred.push(() => raw[method](...args)); return db; }
      return raw[method](...args);
    };
  }
  const execute = sql => new Promise((resolve,reject) => raw.run(sql,err => err ? reject(err) : resolve()));
  db.transaction = async work => {
    if (context.getStore()?.active) return work(db);
    let release;
    const previous=tail;
    tail=new Promise(resolve => { release=resolve; });
    await previous;
    locked=true;
    const owner={ active:true };
    try {
      await execute('BEGIN IMMEDIATE');
      const result=await context.run(owner,()=>work(db));
      await execute('COMMIT');
      return result;
    } catch(error) {
      await execute('ROLLBACK').catch(()=>{});
      throw error;
    } finally {
      owner.active=false;
      locked=false;
      context.exit(()=>{ for(const operation of deferred.splice(0)) operation(); });
      release();
    }
  };
  return db;
}
module.exports={installTransactions};
