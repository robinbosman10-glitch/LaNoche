import {UserError} from './logic.js';
export function warehouseName(value){
 if(typeof value!=='string')throw new UserError('Vul een loods en een product in.');
 const name=value.trim().replace(/\s+/g,' ').toLowerCase();
 if(!name||name.length>60)throw new UserError('Gebruik een naam van 1 tot 60 tekens voor de loods en het product.');
 return name;
}
export function warehouseStore(db){
 db.exec(`CREATE TABLE IF NOT EXISTS warehouse_balances(guild TEXT NOT NULL,location TEXT NOT NULL,item TEXT NOT NULL,amount INTEGER NOT NULL CHECK(amount>=0),PRIMARY KEY(guild,location,item));
 CREATE TABLE IF NOT EXISTS warehouse_bookings(id TEXT PRIMARY KEY,guild TEXT NOT NULL,payload TEXT NOT NULL);`);
 return {
  useDefaultWarehouse(guild){
   const key=`warehouse-default-location-2026-10-28:${guild}`;
   db.exec('BEGIN IMMEDIATE');try{
    if(db.prepare('SELECT 1 FROM meta WHERE key=?').get(key)){db.exec('COMMIT');return false;}
    const rows=db.prepare('SELECT item,SUM(amount) amount FROM warehouse_balances WHERE guild=? GROUP BY item').all(guild);
    if(rows.some(r=>!Number.isSafeInteger(r.amount)||r.amount>1e12))throw new UserError('De gezamenlijke voorraad overschrijdt de limiet. Er is niets gewijzigd.');
    db.prepare('DELETE FROM warehouse_balances WHERE guild=?').run(guild);
    for(const r of rows)db.prepare('INSERT INTO warehouse_balances VALUES(?,?,?,?)').run(guild,'loods',r.item,r.amount);
    db.prepare('INSERT INTO meta VALUES(?,?)').run(key,'done');db.exec('COMMIT');return true;
   }catch(e){db.exec('ROLLBACK');throw e;}
  },
  warehouseBalances(guild){return db.prepare('SELECT location,item,amount FROM warehouse_balances WHERE guild=? ORDER BY location,item').all(guild);},
  warehouseBooking(id){const r=db.prepare('SELECT payload FROM warehouse_bookings WHERE id=?').get(id);return r?JSON.parse(r.payload):null;},
  bookWarehouse(id,guild,entry){
   if(!['add','remove'].includes(entry.action)||!Number.isSafeInteger(entry.amount)||entry.amount<=0||entry.amount>1e12)throw new UserError('Vul een positief heel aantal in (maximaal 1 biljoen).');
   const location=warehouseName(entry.location),item=warehouseName(entry.item);
   db.exec('BEGIN IMMEDIATE');try{
    if(db.prepare('SELECT id FROM warehouse_bookings WHERE id=?').get(id)){db.exec('COMMIT');return false;}
    const before=db.prepare('SELECT amount FROM warehouse_balances WHERE guild=? AND location=? AND item=?').get(guild,location,item)?.amount||0,after=before+(entry.action==='add'?entry.amount:-entry.amount);
    if(after<0)throw new UserError('Onvoldoende voorraad van dit product in deze loods. Er is niets gewijzigd.');
    if(!Number.isSafeInteger(after)||after>1e12)throw new UserError('Deze boeking overschrijdt de maximale voorraad.');
    if(!before&&after>0&&db.prepare('SELECT COUNT(*) n FROM warehouse_balances WHERE guild=? AND amount>0').get(guild).n>=200)throw new UserError('Maximaal 200 actieve voorraadregels.');
    db.prepare('INSERT INTO warehouse_balances VALUES(?,?,?,?) ON CONFLICT(guild,location,item) DO UPDATE SET amount=excluded.amount').run(guild,location,item,after);
    db.prepare('INSERT INTO warehouse_bookings VALUES(?,?,?)').run(id,guild,JSON.stringify({...entry,location,item}));db.exec('COMMIT');return true;
   }catch(e){db.exec('ROLLBACK');throw e;}
  }
 };
}
