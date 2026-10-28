export const logsitePages=[
 ['overview','Overzicht'],['roster','Live ledenlijst'],['safe','Kluisoverzicht'],['pots','Potjesoverzicht'],
 ['messages','Berichten'],['channels','Kanalen & threads'],['roles','Rollen & rechten'],['voice','Voice'],['members','Leden'],['moderation','Bans, kicks & time-outs'],['server','Server & integraties'],['tickets','Tickets & transcripts'],['absence','Afwezigheid'],['money','Potjeslogs'],['vault','Kluislogs'],['blacklist','Perm Blacklist'],['ranks','Gangleden & rangen'],['warns','Waarschuwingen'],['commands','Botcommands'],['system','Bot & fouten']
].map(([id,label])=>({id,label}));
export const allLogsitePages=logsitePages.map(p=>p.id);
export function accountSettings(label,pages){
 if(typeof label!=='string'||label.trim().length>80||!Array.isArray(pages)||pages.some(p=>!allLogsitePages.includes(p)))throw new Error('invalid_settings');
 return {label:label.trim(),pages:[...new Set(pages)]};
}
