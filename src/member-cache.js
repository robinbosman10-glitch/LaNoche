import { UserError } from './logic.js';
const states = new WeakMap();
export function invalidateMembers(guild) { states.delete(guild); }
export async function getMembers(guild, now = Date.now()) {
  let state = states.get(guild);
  if (!state) { state = { ready:false, pending:null, retryAt:0 }; states.set(guild,state); }
  if (state.ready) return guild.members.cache;
  if (state.pending) return state.pending;
  if (now < state.retryAt) throw new UserError(`Discord laat de leden nog niet opnieuw laden. Probeer het over ${Math.ceil((state.retryAt-now)/1000)} seconden opnieuw; de bestaande lijst blijft staan.`);
  state.pending = (async()=>{
    try {
      await guild.members.fetch();
      state.ready=true;
      return guild.members.cache;
    } catch(error) {
      const seconds=Number(error.data?.retry_after);
      const wait=Number.isFinite(seconds) && seconds>0 ? Math.max(60000,Math.ceil(seconds*1000)+1000) : 60000;
      state.retryAt=Date.now()+wait;
      if(error.name==='GatewayRateLimitError') throw new UserError(`Discord begrenst het inladen van leden. Probeer het over ${Math.ceil(wait/1000)} seconden opnieuw; de bestaande lijst blijft staan.`);
      throw error;
    } finally { state.pending=null; }
  })();
  return state.pending;
}
