# La Noche Logs

Dashboard: https://la-noche-logs-preview.robinbosman10.chatgpt.site

Na deployment van de bot: gebruik `/logsite` als Discord-beheerder. De persoonlijke knop koppelt de website aan het bestaande Railway HTTPS-domein. Geen bottoken of extra Railway-secret nodig. Als er nog geen openbaar domein bestaat: Railway Settings → Networking → Generate Domain, daarna herstarten. `TRANSCRIPT_BASE_URL` kan als expliciete HTTPS-origin dienen.

## Toegang

De bot verstrekt alleen aan opnieuw gecontroleerde Administrators een willekeurige, leesbare sessie van 12 uur. De database bewaart uitsluitend de SHA-256-hash. Een nieuw `/logsite`-command trekt de vorige sessie van dezelfde persoon in. Het dashboard verwijdert de verbindingsgegevens direct uit het URL-fragment en bewaart ze alleen in sessionStorage van dat tabblad. Deel de persoonlijke link niet. API-verzoeken gebruiken een Authorization-header, niet een querystring. Geen CORS-toegang voor andere websites. De API controleert iedere 30 seconden opnieuw of de gebruiker nog Administrator is. De Site blijft daarnaast privé binnen Sites.

## Gegevens en dekking

16 categorieën met databasefiltering, paginering en pollinterval 5/10/30 seconden. Export betreft expliciet de zichtbare pagina, maximaal 50 regels. CSV-formules en HTML worden ontsmet. Licht/donker/systeemvoorkeur wordt per browser onthouden.

De website leest bestaande server_logs, audit_outbox, money_transactions, vault_bookings en blacklist_logs zonder de saldi, tickets of Discord-berichten te wijzigen. Import is hervatbaar en idempotent. Nieuwe openingen/claims van tickets en succesvolle rang-/warnacties krijgen eigen registraties. Eerder geplaatste rang- en waarschuwingsembeds van deze bot worden langzaam ingelezen uit bereikbare tekstkanalen, maximaal twee pagina's per 30 seconden. Ontbrekende kanaaltoegang en voortgang verschijnen in het dashboard. Die historie-import verandert geen berichten.

Algemene events: berichten (maken/bewerken/verwijderen/bulk), reacties, voice/status, toetreden/vertrek, bijnamen, auditlogacties (onder andere rollen, kanalen, threads, bans/kicks/time-outs, serverinstellingen en integraties), AutoMod, serverevents, commandgebruik en botfouten. Gateway- en auditloggebeurtenissen kunnen beide dezelfde handeling beschrijven; het detail vermeldt de bron en de bekende uitvoerder. Commandgebruik betekent niet dat de opdracht geslaagd is; voltooide domeinacties staan in hun eigen categorie.

Discord blijft de bron van wat beschikbaar is. De site toont ontbrekende Auditlogboek bekijken- of Message Content Intent-toegang. Oude niet vastgelegde, gewiste berichten en voicegeschiedenis van vóór logging kunnen niet worden gereconstrueerd. Bots/webhooks worden niet als gewone chat gelogd om logloops te vermijden. Historische geldresets blijven zichtbaar als boekhoudkundige gebeurtenissen; er worden geen bedragen gereset door deze wijziging.

## Controle

`npm test` test onder meer sessierotatie, serverautorisatie, CORS, ledgerimport zonder dubbelen, filters en bestaande botfunctionaliteit. De uiteindelijke Railway-deploy en eerste verbinding via `/logsite` moeten online succesvol zijn voordat het dashboard als live geverifieerd geldt.
