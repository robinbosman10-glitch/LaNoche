import { UserError } from './logic.js';
export const pots = ['gang','drugs','wapens'];
export const shares = {zwart:[10,45,45],wit:[40,60,0]};
const max = 1_000_000_000_000;
export function parseAmount(input) {
  const text=input.trim().toLowerCase();
  let amount;
  if (/^\d+(?:[,.]\d{1,6})?\s*(?:miljoen|m)$/.test(text)) amount=Number(text.replace(/\s*(miljoen|m)$/,'').replace(',','.'))*1_000_000;
  else if (/^(?:\d+|\d{1,3}(?:\.\d{3})+)$/.test(text)) amount=Number(text.replaceAll('.',''));
  if(!Number.isSafeInteger(amount) || amount<=0 || amount>max) throw new UserError('Vul een positief heel bedrag in, bijvoorbeeld 1000000, 1.000.000 of 1 miljoen (maximaal 1 biljoen).');
  return amount;
}
export function allocation(amount,kind) {
  if(!shares[kind] || !Number.isSafeInteger(amount) || amount<=0 || amount>max) throw new UserError('Ongeldig bedrag of geldsoort.');
  const result=shares[kind].map(p=>Math.floor(amount*p/100));
  const order=shares[kind].map((p,i)=>({i,remainder:amount*p%100})).sort((a,b)=>b.remainder-a.remainder || a.i-b.i);
  for(let left=amount-result.reduce((a,b)=>a+b,0),i=0;left>0;left--,i++) result[order[i].i]++;
  return result;
}
export function moneyStore(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS money_balances (guild TEXT,kind TEXT,pot TEXT,amount INTEGER NOT NULL CHECK(amount>=0),PRIMARY KEY(guild,kind,pot));
    CREATE TABLE IF NOT EXISTS money_transactions (id TEXT PRIMARY KEY,guild TEXT,actor TEXT,kind TEXT,action TEXT,amount INTEGER,pot TEXT,time INTEGER,deltas TEXT);`);
  return {
    moneyBalances(guild) { return db.prepare('SELECT kind,pot,amount FROM money_balances WHERE guild=?').all(guild); },
    moneyHistory(guild) { return db.prepare('SELECT * FROM money_transactions WHERE guild=? ORDER BY rowid DESC LIMIT 5').all(guild); },
    changeMoney({id,guild,actor,kind,action,amount,pot}) {
      const split=allocation(amount,kind);
      if(!['add','remove'].includes(action) || (action==='remove' && !pots.includes(pot))) throw new UserError('Ongeldige geldactie.');
      db.exec('BEGIN IMMEDIATE');
      try {
        const old=db.prepare('SELECT * FROM money_transactions WHERE id=?').get(id);
        if(old) {db.exec('COMMIT');return false;}
        const deltas=action==='add'?split:pots.map(p=>p===pot?-amount:0);
        for(const [i,p] of pots.entries()) {
          const current=db.prepare('SELECT amount FROM money_balances WHERE guild=? AND kind=? AND pot=?').get(guild,kind,p)?.amount??0;
          const next=current+deltas[i];
          if(next<0) throw new UserError('Er zit onvoldoende geld van deze soort in het gekozen potje. Er is niets gewijzigd.');
          if(!Number.isSafeInteger(next) || next>max) throw new UserError('Deze boeking overschrijdt het maximale saldo.');
          db.prepare('INSERT INTO money_balances VALUES (?,?,?,?) ON CONFLICT(guild,kind,pot) DO UPDATE SET amount=excluded.amount').run(guild,kind,p,next);
        }
        db.prepare('INSERT INTO money_transactions VALUES (?,?,?,?,?,?,?,?,?)').run(id,guild,actor,kind,action,amount,pot??null,Date.now(),JSON.stringify(deltas));
        db.exec('COMMIT');return true;
      } catch(error) {db.exec('ROLLBACK');throw error;}
    }
  };
}
