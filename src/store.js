import { randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
export function createStore(directory) {
  mkdirSync(directory, { recursive: true });
  const db = new DatabaseSync(join(directory, 'lanoche.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS ticket_panels (guild TEXT, channel TEXT, message TEXT, support TEXT, parent TEXT, PRIMARY KEY(guild,channel));
    CREATE TABLE IF NOT EXISTS tickets (guild TEXT, channel TEXT PRIMARY KEY, user TEXT, kind TEXT, support TEXT, claimed TEXT, closed INTEGER DEFAULT 0, message TEXT);
    DROP INDEX IF EXISTS one_open_ticket;
    CREATE INDEX IF NOT EXISTS open_tickets_by_user ON tickets(guild,user) WHERE closed=0;
    CREATE TRIGGER IF NOT EXISTS max_two_open_tickets BEFORE INSERT ON tickets
    WHEN NEW.closed=0 AND (SELECT COUNT(*) FROM tickets WHERE guild=NEW.guild AND user=NEW.user AND closed=0)>=2
    BEGIN SELECT RAISE(ABORT, 'max_two_open_tickets'); END;
    CREATE TABLE IF NOT EXISTS transcript_links (guild TEXT, ticket TEXT, token TEXT UNIQUE, PRIMARY KEY(guild,ticket));
    CREATE TABLE IF NOT EXISTS ticket_log_messages (guild TEXT, ticket TEXT, channel TEXT, message TEXT, PRIMARY KEY(guild,ticket));
    CREATE TABLE IF NOT EXISTS audit_outbox (id TEXT PRIMARY KEY, guild TEXT, payload TEXT, sent INTEGER DEFAULT 0);
    CREATE TABLE IF NOT EXISTS activity (guild TEXT, user TEXT, last INTEGER, PRIMARY KEY(guild,user));
    CREATE TABLE IF NOT EXISTS absences (guild TEXT, user TEXT, start INTEGER, end INTEGER, PRIMARY KEY(guild,user));
    CREATE TABLE IF NOT EXISTS absence_requests (id TEXT PRIMARY KEY, guild TEXT, user TEXT, start INTEGER, end INTEGER, reason TEXT, status TEXT, reviewer TEXT, channel TEXT, message TEXT, dirty INTEGER DEFAULT 1);
    CREATE UNIQUE INDEX IF NOT EXISTS one_active_absence_request ON absence_requests(guild,user) WHERE status IN ('pending','approving','approved');
    CREATE TABLE IF NOT EXISTS panels (guild TEXT PRIMARY KEY, channel TEXT, message TEXT);
    CREATE TABLE IF NOT EXISTS memberlists (guild TEXT PRIMARY KEY, channel TEXT, messages TEXT);
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);`);
  db.prepare('INSERT OR IGNORE INTO meta VALUES (?,?)').run('trackingStart', String(Date.now()));
  return {
    transcriptToken(guild,ticket) {
      db.prepare('INSERT OR IGNORE INTO transcript_links VALUES (?,?,?)').run(guild,ticket,randomBytes(32).toString('hex'));
      return db.prepare('SELECT token FROM transcript_links WHERE guild=? AND ticket=?').get(guild,ticket).token;
    },
    transcriptByToken(token) {return db.prepare('SELECT guild,ticket FROM transcript_links WHERE token=?').get(token);},
    auditMigrationDone(key) {return Boolean(db.prepare('SELECT value FROM meta WHERE key=?').get(key));},
    finishAuditMigration(key) {db.prepare('INSERT OR REPLACE INTO meta VALUES (?,?)').run(key,'done');},
    replaceAudit(event) {db.prepare('UPDATE audit_outbox SET payload=?,sent=0 WHERE id=?').run(JSON.stringify(event),event.id);},
    auditEvent(id) {const row=db.prepare('SELECT payload FROM audit_outbox WHERE id=?').get(id);return row?JSON.parse(row.payload):null;},
    ticketLog(guild,ticket) {return db.prepare('SELECT channel,message FROM ticket_log_messages WHERE guild=? AND ticket=?').get(guild,ticket);},
    setTicketLog(guild,ticket,channel,message) {db.prepare('INSERT INTO ticket_log_messages VALUES (?,?,?,?) ON CONFLICT(guild,ticket) DO UPDATE SET channel=excluded.channel,message=excluded.message').run(guild,ticket,channel,message);},
    queueAudit(event) { db.prepare('INSERT OR IGNORE INTO audit_outbox(id,guild,payload) VALUES (?,?,?)').run(event.id,event.guild,JSON.stringify(event)); },
    pendingAudit(guild) { return db.prepare('SELECT id,payload FROM audit_outbox WHERE guild=? AND sent=0 ORDER BY rowid LIMIT 50').all(guild).map(r=>JSON.parse(r.payload)); },
    markAuditSent(id) {db.prepare('UPDATE audit_outbox SET sent=1 WHERE id=?').run(id);},
    since: Number(db.prepare('SELECT value FROM meta WHERE key=?').get('trackingStart').value),
    activity(guild, user, time) { db.prepare('INSERT INTO activity VALUES (?,?,?) ON CONFLICT(guild,user) DO UPDATE SET last=MAX(last,excluded.last)').run(guild,user,time); },
    last(guild, user) { return db.prepare('SELECT last FROM activity WHERE guild=? AND user=?').get(guild,user)?.last; },
    absent(guild,user) { return db.prepare('SELECT start,end FROM absences WHERE guild=? AND user=?').get(guild,user); },
    setAbsent(guild,user,start,end) { db.prepare('INSERT INTO absences VALUES (?,?,?,?) ON CONFLICT(guild,user) DO UPDATE SET start=excluded.start,end=excluded.end').run(guild,user,start,end); },
    clearAbsent(guild,user) { db.prepare('DELETE FROM absences WHERE guild=? AND user=?').run(guild,user); },
    beginAbsenceReset(guild,version) {
      const key=`absenceReset:${guild}:${version}`;
      if(db.prepare('SELECT value FROM meta WHERE key=?').get(key)) return;
      db.exec('BEGIN IMMEDIATE');
      try {
        db.prepare('DELETE FROM absences WHERE guild=?').run(guild);
        db.prepare("UPDATE absence_requests SET status='cancelled',dirty=1 WHERE guild=? AND status IN ('pending','approving','approved')").run(guild);
        db.prepare('INSERT INTO meta VALUES (?,?)').run(key,'pending');
        db.exec('COMMIT');
      } catch(error) {db.exec('ROLLBACK');throw error;}
    },
    absenceResetState(guild,version) {return db.prepare('SELECT value FROM meta WHERE key=?').get(`absenceReset:${guild}:${version}`)?.value;},
    completeAbsenceReset(guild,version) {db.prepare('UPDATE meta SET value=? WHERE key=?').run('done',`absenceReset:${guild}:${version}`);},
    absenceRequest(id) { return db.prepare('SELECT * FROM absence_requests WHERE id=?').get(id); },
    absenceRequests(guild) { return db.prepare("SELECT * FROM absence_requests WHERE guild=? AND (status IN ('pending','approving','approved') OR dirty=1)").all(guild); },
    activeAbsenceRequest(guild,user) { return db.prepare("SELECT * FROM absence_requests WHERE guild=? AND user=? AND status IN ('pending','approving','approved')").get(guild,user); },
    createAbsenceRequest(r) { db.prepare('INSERT INTO absence_requests (id,guild,user,start,end,reason,status,channel) VALUES (?,?,?,?,?,?,?,?)').run(r.id,r.guild,r.user,r.start,r.end,r.reason,'pending',r.channel); },
    updateAbsenceRequest(id,patch) { const r={...this.absenceRequest(id),...patch}; db.prepare('UPDATE absence_requests SET status=?,reviewer=?,message=?,dirty=? WHERE id=?').run(r.status,r.reviewer??null,r.message??null,r.dirty,id); },
    deleteAbsenceRequest(id) { db.prepare('DELETE FROM absence_requests WHERE id=?').run(id); },
    panel(guild) { return db.prepare('SELECT channel,message FROM panels WHERE guild=?').get(guild); },
    setPanel(guild,channel,message) { db.prepare('INSERT INTO panels VALUES (?,?,?) ON CONFLICT(guild) DO UPDATE SET channel=excluded.channel,message=excluded.message').run(guild,channel,message); },
    list(guild) { const row = db.prepare('SELECT channel,messages FROM memberlists WHERE guild=?').get(guild); return row ? {...row, messages: JSON.parse(row.messages)} : null; },
    setList(guild,channel,messages) { db.prepare('INSERT INTO memberlists VALUES (?,?,?) ON CONFLICT(guild) DO UPDATE SET channel=excluded.channel,messages=excluded.messages').run(guild,channel,JSON.stringify(messages)); },
    ticketPanel(guild,channel) { return db.prepare('SELECT * FROM ticket_panels WHERE guild=? AND channel=?').get(guild,channel); },
    setTicketPanel(guild,channel,message,support,parent) { db.prepare('INSERT INTO ticket_panels VALUES (?,?,?,?,?) ON CONFLICT(guild,channel) DO UPDATE SET message=excluded.message,support=excluded.support,parent=excluded.parent').run(guild,channel,message,support,parent); },
    tickets(guild) { return db.prepare('SELECT * FROM tickets WHERE guild=?').all(guild); },
    ticket(channel) { return db.prepare('SELECT * FROM tickets WHERE channel=?').get(channel); },
    openTickets(guild,user) { return db.prepare('SELECT * FROM tickets WHERE guild=? AND user=? AND closed=0').all(guild,user); },
    openTicket(guild,user) { return db.prepare('SELECT * FROM tickets WHERE guild=? AND user=? AND closed=0').get(guild,user); },
    addTicket(t) { db.prepare('INSERT INTO tickets VALUES (?,?,?,?,?,?,?,?)').run(t.guild,t.channel,t.user,t.kind,t.support,t.claimed,t.closed,t.message); },
    updateTicket(channel,patch) { const t={...this.ticket(channel),...patch}; db.prepare('UPDATE tickets SET claimed=?,closed=? WHERE channel=?').run(t.claimed,t.closed,channel); },
    close() { db.close(); },
  };
}
