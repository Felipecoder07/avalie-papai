const crypto=require('node:crypto');
const { decrypt }=require('./security');
function decode(value) {
  let bits='';
  for(const c of value.toUpperCase()) {
    const n='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(c);
    if(n<0) throw new Error('Invalid TOTP secret');
    bits+=n.toString(2).padStart(5,'0');
  }
  return Buffer.from((bits.match(/.{8}/g)||[]).map(v=>parseInt(v,2)));
}
function generate() {
  const bytes=crypto.randomBytes(20);
  const bits=[...bytes].map(n=>n.toString(2).padStart(8,'0')).join('');
  return bits.match(/.{5}/g).map(v=>'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'[parseInt(v,2)]).join('');
}
function verify(encoded,code) {
  if(typeof code!=='string'||!/^\d{6}$/.test(code)) return false;
  try {
    const value=decrypt(encoded);
    if(!value || value==='JBSWY3DPEHPK3PXP') return false;
    for(let offset=-1;offset<=1;offset++) {
      const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)+offset));
      const mac=crypto.createHmac('sha1',decode(value)).update(counter).digest();
      const pos=mac[mac.length-1]&15;
      const expected=((mac.readUInt32BE(pos)&0x7fffffff)%1000000).toString().padStart(6,'0');
      if(crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(code))) return true;
    }
  } catch { return false; }
  return false;
}
module.exports={generate,verify};
