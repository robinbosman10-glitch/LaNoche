import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
export function createStore(directory) {
  mkdirSync(directory, { recursive: true });
  const db = new DatabaseSync(join(directory, 'lanoche.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS activity (guild TEXT, user TEXT, last INTEGER, PRIMARY KEY(guild,user));
    CREATE TABLE IF NOT EXISTS absences (guild TEXT, user TEXT, start INTEGER, end INTEGER, PRIMARY KEY(guild,user));
    CREATE TABLE IF NOT EXISTS panels (guild TEXT PRIMARY KEY, channel TEXT, message TEXT);
    CREATE TABLE IF NOT EXISTS memberlists (guild TEXT PRIMARY KEY, channel TEXT, messages TEXT);
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);`);
  db.prepare('INSERT OR IGNORE INTO meta VALUES (?,?)').run('trackingStart', String(Date.now()));
  return {
    since: Number(db.prepare('SELECT value FROM meta WHERE key=?').get('trackingStart').value),
    activity(guild, user, time) { db.prepare('INSERT INTO activity VALUES (?,?,?) ON CONFLICT(guild,user) DO UPDATE SET last=MAX(last,excluded.last)').run(guild,user,time); },
    last(guild, user) { return db.prepare('SELECT last FROM activity WHERE guild=? AND user=?').get(guild,user)?.last; },
    absent(guild,user) { return db.prepare('SELECT start,end FROM absences WHERE guild=? AND user=?').get(guild,user); },
    setAbsent(guild,user,start,end) { db.prepare('INSERT INTO absences VALUES (?,?,?,?) ON CONFLICT(guild,user) DO UPDATE SET start=excluded.start,end=excluded.end').run(guild,user,start,end); },
    clearAbsent(guild,user) { db.prepare('DELETE FROM absences WHERE guild=? AND user=?').run(guild,user); },
    panel(guild) { return db.prepare('SELECT channel,message FROM panels WHERE guild=?').get(guild); },
    setPanel(guild,channel,message) { db.prepare('INSERT INTO panels VALUES (?,?,?) ON CONFLICT(guild) DO UPDATE SET channel=excluded.channel,message=excluded.message').run(guild,channel,message); },
    list(guild) { const row = db.prepare('SELECT channel,messages FROM memberlists WHERE guild=?').get(guild); return row ? {...row, messages: JSON.parse(row.messages)} : null; },
    setList(guild,channel,messages) { db.prepare('INSERT INTO memberlists VALUES (?,?,?) ON CONFLICT(guild) DO UPDATE SET channel=excluded.channel,messages=excluded.messages').run(guild,channel,JSON.stringify(messages)); },
    close() { db.close(); },
  };
}
