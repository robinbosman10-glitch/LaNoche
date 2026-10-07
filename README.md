# La Noche Discord-bot

Nieuwe botbasis met alle 10 commands uit de aangeleverde screenshots. **Dit is fase 1: de commands zijn registreerbaar, maar hun functies zijn nog niet gekoppeld of geïmplementeerd.** Elk command geeft een privébericht met wat nog ingesteld moet worden. Er worden nog geen rollen gewijzigd, tickets geopend, afwezigheden opgeslagen of activiteiten bijgehouden.

| Command | Bedoeling | Toegang in deze basis |
| --- | --- | --- |
| `/aangenomen` | Iemand aannemen op de proefrang | Beheerder |
| `/afwezig` | Eigen afwezigheid melden, DD-MM-YYYY | Iedereen |
| `/demote` | Naar een lagere gangrang zetten | Beheerder |
| `/discordinactief` | Activiteit en afwezigheid bekijken | Beheerder |
| `/ledenlijst` | Automatische ledenlijst plaatsen/bijwerken | Beheerder |
| `/ontslaan` | Rollen verwijderen, één uitzonderingsrol behouden | Beheerder |
| `/promotie` | Naar een hogere gangrang zetten | Beheerder |
| `/rolaanvraag` | Een rol aanvragen voor een ganglid | Iedereen |
| `/sollistatus` | Sollicitatiestatus-embeds bijwerken | Beheerder |
| `/ticket-panel` | Ticketpaneel plaatsen | Beheerder |

De commandnamen zijn exact overgenomen. Argumenten, formulieren en definitieve toegang per rol voegen we toe zodra de gewenste werking is afgesproken.

## Starten op Railway

1. Maak een nieuwe Railway-service via GitHub met `robinbosman10-glitch/LaNoche`.
2. Voeg bij **Variables** `DISCORD_TOKEN` (token van de nieuwe bot) en `GUILD_ID` (Discord server-ID) toe. Deel het token niet in de chat of GitHub.
3. Nodig de nieuwe applicatie uit in die server met de scopes `bot` en `applications.commands`. Voor deze eerste basis zijn geen beheerrechten of privileged intents voor de bot nodig.
4. Deploy de service. De Dockerfile installeert de dependencies en start de bot. Een domein of webpoort is niet nodig.
5. Controleer de logs op `La Noche online ... 10 commands geregistreerd.`

De Application ID wordt automatisch bepaald via de ingelogde bot. Gebruik de eigen nieuwe botapplicatie: bij elke start wordt de volledige server-commandlijst van die applicatie gesynchroniseerd met deze 10 commands. Andere botapplicaties worden niet geraakt. Gebruik één replica. Zolang de variabelen ontbreken, stopt de bot met een duidelijke foutmelding.

## Lokaal

Gebruik Node.js 24 (minimaal 24.0.0).

```sh
npm ci
cp .env.example .env
# Vul .env in
npm test
npm start
```

## Later koppelen

- Gangrangen in volgorde, proefrang en extra rollen bij aannemen.
- Rollen die elk command mogen gebruiken en de uitzonderingsrol bij ontslag.
- Kanalen voor HR-meldingen, aanvragen, afwezigheden en ledenlijst.
- Ticketcategorieën, supportrollen en sollicitatievragen/statussen.
- Logo, banner, kleuren en gewenste embedteksten.
- Permanente opslag en aanvullende intents voor de uiteindelijke functies.

`src/commands.js` bevat de commandlijst; `src/handler.js` de voorlopige antwoorden; `src/index.js` regelt de verbinding en registratie. De runtime controleert beheerdersrechten ook zelf. Pas dit samen met de commandpermissies aan wanneer aparte staffrollen worden gekoppeld.
