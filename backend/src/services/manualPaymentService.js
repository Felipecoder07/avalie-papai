const {httpError}=require('../utils/security');
function manualMethod(value) {
 const key=String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
 const methods={'pix':'Pix','pix (manual)':'Pix','dinheiro':'Dinheiro','credito':'Cartao de Credito','cartao de credito':'Cartao de Credito','debito':'Cartao de Debito','cartao de debito':'Cartao de Debito','voucher':'Voucher Interno','voucher interno':'Voucher Interno'};
 if(!Object.hasOwn(methods,key)) throw httpError(400,'Metodo manual invalido. Pagamento online exige confirmacao do provedor.');
 return methods[key];
}
module.exports={manualMethod};
