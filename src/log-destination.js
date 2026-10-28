export const webOnlyLogs=()=>process.env.LOG_DESTINATION==='web';
// Only dedicated log channels. Operational channels and dashboards are excluded.
export const retiredLogChannels=new Map([
 ['1564898831898779658','system'],
 ['1564621640271265792','money'],
 ['1564634188278267914','vault'],
 ['1420469739725000744','tickets'],
 ['1557653747654729748','absence'],
 ['1564635987160600707','vault']
]);
export function deliverLogsToWebsite(guild,store){
 store.syncWebLogs(guild.id);
 // Mark only delivery queues. Source events, money, stock and transcripts remain intact.
 store.markWebsiteDelivery(guild.id);
 return Promise.resolve();
}
