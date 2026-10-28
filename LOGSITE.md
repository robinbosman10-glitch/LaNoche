# La Noche Logs — Discord-login

Productiedomein: **https://la-noche-logs.nl**. De website draait in dezelfde Railway-service als de bot, met dezelfde SQLite-opslag op `/data`. De oude Sites-preview is niet de productiehost voor Discord OAuth.

## Instellen

1. Railway-project `282dd411-bba0-4d8d-a3e6-974927b77a06`, service `6e672b8e-bdd3-4eb2-9056-0a8c73da650b`, environment `5a4e8761-80c0-49e6-ab4f-ceacb279b362`.
2. Voeg bij Settings → Networking → Custom Domain `la-noche-logs.nl` toe aan de bestaande HTTP-poort (`PORT`, standaard 3000).
3. Neem de routing- en eigendomsverificatie-DNS-records exact over uit Railway. Voor het hoofddomein is CNAME-flattening/ALIAS bij de DNS-provider nodig; verzin geen vast IP-adres.
4. Voeg in de Discord Developer Portal, bij de bestaande botapp → OAuth2 → Redirects, exact toe:
   `https://la-noche-logs.nl/auth/discord/callback`
5. Zet in Railway `DISCORD_OAUTH_CLIENT_SECRET` op het OAuth2 Client Secret (niet de bottoken). `DISCORD_OAUTH_CLIENT_ID` mag expliciet worden ingesteld; anders gebruikt de app het application-ID van de ingelogde bot. `LOGSITE_BASE_URL` is standaard `https://la-noche-logs.nl`.
6. Laat Railway de nieuwe versie deployen. Controleer dat het domein en certificaat actief zijn, klik op Inloggen met Discord en meld je aan als de vaste beheerder.

Bewaar geen geheimen in GitHub, chats of screenshots. Zonder OAuth-configuratie blijft login gesloten en meldt de website dat de beheerder de instellingen moet afronden. De botfuncties blijven draaien.

## Accountbeheer

Enige beheerder: **424086753327054849**. Dit ID is vast in de servercode; het kan niet via de website worden gewijzigd of verwijderd. Discord-serverrollen, Administrator-rechten of aangeleverde browserheaders geven geen websitebeheer.

De beheerder ziet **Accounts beheren**. Voeg een Discord-ID toe om alleen leesrechten op alle logpagina's te geven. Verwijderen trekt toegang onmiddellijk in en verwijdert de actieve sessies van dat account. Ook iedere log-API-aanvraag controleert de actuele toegangslijst. Er is geen functie om andere beheerders te maken.

OAuth gebruikt authorization code + PKCE en browsergebonden, eenmalige state van 10 minuten. Alleen `identify` wordt gevraagd. Discord bepaalt het ID; de browser mag het niet zelf opgeven voor authenticatie. OAuth-tokens blijven server-side en worden niet opgeslagen. Applicatiesessies verlopen na 12 uur; alleen de tokenhash wordt bewaard. De cookie heeft Secure, HttpOnly, SameSite=Lax en een __Host-prefix. Beheerwijzigingen en uitloggen vereisen same-origin plus een eigen CSRF-token.

Oude persoonlijke bearerlinks uit `/logsite` worden niet meer geaccepteerd door de API. `/logsite` geeft nu de gewone domeinlink aan toegelaten gebruikers, waarna altijd Discord-login nodig is.

## Branding en logs

Beide serverlogo's volgen het actuele servericoon uit Discord. Bij geen icoon wordt het bestaande La Noche-logo gebruikt. Na login staat linksonder de echte Discord-naam en avatar, met GIF-ondersteuning en correcte standaardavatar. Lichte/donkere/systeemweergave blijft beschikbaar.

16 logpagina's, automatische verversing, zoeken, filters, details en pagina-export. Bestaande botregistraties worden hervatbaar en zonder dubbele invoer ingelezen. Oude eigen rang-/warnembeds worden in de achtergrond geïmporteerd. De website meldt ontbrekende auditlog- of berichtinhoudrechten. Niet eerder opgeslagen of gewiste gegevens zijn niet achteraf te reconstrueren.

`npm test` controleert onder meer de vaste eigenaar, intrekken van toegang, OAuth-state/replay, cookies, CSRF, afwijzen van oude bearerlinks, avatars en de bestaande botfuncties.


## Live ledenlijst

De pagina **Live ledenlijst** leest `/api/members` via dezelfde beveiligde Discord-sessie. Zij toont echte Discord-leden per hoogste ingestelde gangrang, van hoog naar laag, zonder bots of dubbeltellingen. Namen, avatars en goedgekeurde afwezigheid komen uit Discord. De gedeelde member-cache wordt aanvankelijk volledig geladen en daarna door Discord Gateway-events bijgewerkt. De site ververst standaard iedere 10 seconden; pauze en verversinterval gelden ook hier. Bij verbindingsproblemen wordt de laatst ontvangen lijst duidelijk als niet bijgewerkt gemarkeerd. Niet-ingelogde bezoekers krijgen geen ledengegevens.
