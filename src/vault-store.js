import {UserError} from './logic.js';
export const openingVault=[
 ['wit','',350000+200000+350000+200000+700000+600000-1380000],
 ['zwart','',655000+371000+103000-512000+108000+70000+729000],
 ['wapen','mes',-1+3-1],['wapen','pistol',2],['munitie','9mm kogel',27],
 ['voorraad','cocazaden',471+376+536+80-1380],['voorraad','goede zakjes coke',23],['voorraad','goede wietzaden',100]
];
export function normalizeItem(value) {
 const text=value.trim().toLowerCase().replace(/\s+/g,' ');
 const aliases={messen:'mes',pistool:'pistol',pistolen:'pistol',pistols:'pistol','9mm kogels':'9mm kogel','9mm':'9mm kogel',cocazaad:'cocazaden','goed zakjes coke':'goede zakjes coke','goede zakje coke':'goede zakjes coke','goed zakje coke':'goede zakjes coke','goede wietzaad':'goede wietzaden'};
 if(!text || text.length>30)throw new UserError('Vul een voorwerp in van maximaal 30 tekens.');
 return aliases[text]??text;
}
export function vaultStore(db) {
 db.exec(`CREATE TABLE IF NOT EXISTS vault_balances(guild TEXT,kind TEXT,item TEXT,amount INTEGER NOT NULL CHECK(amount>=0),PRIMARY KEY(guild,kind,item));
 CREATE TABLE IF NOT EXISTS vault_bookings(id TEXT PRIMARY KEY,guild TEXT,payload TEXT,url TEXT);`);
 return {
 initializeVault(guild) {
  const key=`vault-opening-2026-10-27:${guild}`;
  db.exec('BEGIN IMMEDIATE');try {
   if(db.prepare('SELECT value FROM meta WHERE key=?').get(key)){db.exec('COMMIT');return false;}
   for(const [kind,item,amount] of openingVault)db.prepare('INSERT INTO vault_balances VALUES(?,?,?,?)').run(guild,kind,item,amount);
   db.prepare('INSERT INTO meta VALUES(?,?)').run(key,'done');db.exec('COMMIT');return true;
  }catch(e){db.exec('ROLLBACK');throw e;}
 },
 vaultBalances(guild){return db.prepare('SELECT kind,item,amount FROM vault_balances WHERE guild=? ORDER BY kind,item').all(guild);},
 bookVault(id,guild,entry) {
  if(!['wit','zwart','wapen','munitie','voorraad'].includes(entry.kind)||!['add','remove'].includes(entry.action)||!Number.isSafeInteger(entry.amount)||entry.amount<=0)throw new UserError('Ongeldige kluisboeking.');
  const item=['wit','zwart'].includes(entry.kind)?'':normalizeItem(entry.item);
  db.exec('BEGIN IMMEDIATE');try {
   if(db.prepare('SELECT id FROM vault_bookings WHERE id=?').get(id)){db.exec('COMMIT');return false;}
   const current=db.prepare('SELECT amount FROM vault_balances WHERE guild=? AND kind=? AND item=?').get(guild,entry.kind,item)?.amount??0;
   const amount=current+(entry.action==='add'?entry.amount:-entry.amount);
   if(amount<0)throw new UserError('Er zit onvoldoende geld of voorraad van deze soort in de kluis. Er is niets gewijzigd.');
   if(!Number.isSafeInteger(amount)||amount>1e12)throw new UserError('Deze boeking overschrijdt de maximale kluisinhoud.');
   const count=db.prepare('SELECT COUNT(*) AS n FROM vault_balances WHERE guild=? AND amount>0').get(guild).n;
   if(!current && amount>0 && count>=40)throw new UserError('Maximaal 40 verschillende voorwerpen in de kluis.');
   db.prepare('INSERT INTO vault_balances VALUES(?,?,?,?) ON CONFLICT(guild,kind,item) DO UPDATE SET amount=excluded.amount').run(guild,entry.kind,item,amount);
   db.prepare('INSERT INTO vault_bookings(id,guild,payload) VALUES(?,?,?)').run(id,guild,JSON.stringify({...entry,item}));db.exec('COMMIT');return true;
  }catch(e){db.exec('ROLLBACK');throw e;}
 },
 vaultBooking(id){const r=db.prepare('SELECT payload FROM vault_bookings WHERE id=?').get(id);return r?JSON.parse(r.payload):null;},
 recentVaultBookings(guild){return db.prepare('SELECT id,payload FROM vault_bookings WHERE guild=? ORDER BY rowid DESC LIMIT 8').all(guild).map(r=>({...JSON.parse(r.payload),id:r.id}));},
 pendingVaultPosts(guild){return db.prepare('SELECT id,payload FROM vault_bookings WHERE guild=? AND url IS NULL ORDER BY rowid LIMIT 50').all(guild).map(r=>({...JSON.parse(r.payload),id:r.id}));},
 };
}
