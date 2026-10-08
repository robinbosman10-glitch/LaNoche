# La Noche Discord-bot

Discord-bot met La Noche-logo, zwarte/oranje banner en Nederlandse embeds.

## Commands

- `/aangenomen persoon [reden]`: geeft rollen `1314658388914864218` en `1311587016928133160`, melding in `1557288102286987274`. Blokkeert bestaande hogere gangrangen.
- `/afwezig`: eigen formulier met reden, begin- en einddatum (DD-MM-YYYY). Registreert direct en plaatst embed in `1553517123844706435`. Geen goedkeuring/afwezigheidsrol ingesteld. Datums zijn inclusief, Europe/Amsterdam; dubbele actuele meldingen worden geblokkeerd. De status verloopt vanzelf.
- `/demote persoon [reden]`: één gangrang omlaag; melding in het commandkanaal.
- `/promotie persoon [reden]`: één gangrang omhoog; melding in `1553516833632555029`.
- `/ontslaan persoon [reden]`: verwijdert alle verwijderbare rollen behalve `1553520983628062810`; melding in `1553516886199771216`. De uitzonderingsrol wordt behouden als het lid die al heeft. @everyone en door Discord beheerde rollen kunnen niet worden verwijderd. Als een gewone rol niet bewerkbaar is, wordt de actie vooraf gestopt.
- `/discordinactief`: plaatst activiteit en afwezigheidsstatus van gangleden in het commandkanaal. Laatste gemeten bericht, geen verzonnen historie. Telt alleen berichten in zichtbare kanalen terwijl de bot online is; geen berichtinhoud opgeslagen. De reden van afwezigheid komt niet in dit overzicht.
- `/ledenlijst`: plaatst de lijst in het vaste kanaal `1553516111176138852`, daarna wordt dezelfde lijst bijgewerkt, ongeacht waar het command wordt uitgevoerd. Alle 12 rangen van hoog naar laag, leden per rang, lege rangen tonen *Geen Leden op de rang!*. Live verversing bij rol-/lidwijzigingen, binnenkomst en vertrek (wijzigingen worden circa 1,5 seconde gebundeld), plus iedere 5 minuten als vangnet en na herstart. Grote lijsten worden verdeeld over berichten.
- `/sollistatus`: plaatst bij eerste gebruik het sollicitatiebericht in het huidige kanaal. Volgende keren wordt hetzelfde bericht bijgewerkt. Sollicitaties staan open; geïnteresseerden worden naar de leiding verwezen tot het ticketpaneel is ingericht.
- `/rolaanvraag` en `/ticket-panel`: nog niet gekoppeld.

Alle beheercommands vereisen voorlopig Administrator (ook in de runtime). `/afwezig` en het nog niet gekoppelde `/rolaanvraag` zijn voor leden. De hoogste/laagste rang heeft geen verdere promotie/demote. Iemand met meerdere gangrangen moet eerst gecorrigeerd worden. Beheerders kunnen zichzelf en leden op of boven hun eigen hoogste rol niet wijzigen; de servereigenaar is uitgezonderd van die laatste vergelijking. De bot moet het doelwit altijd kunnen beheren.

## Railway instellen

1. Koppel deze GitHub-repository en deploy met de Dockerfile.
2. Voeg Variables toe: `DISCORD_TOKEN` en `GUILD_ID`. Deel het token niet in chat of GitHub.
3. **Maak een Railway-volume met mount path `/data`**. De SQLite-database bewaart activiteit, afwezigheidsdatums en bericht-ID's. Zonder volume gaat die informatie bij een nieuwe deployment verloren. De Dockerfile stelt `DATA_DIR=/data` in. Gebruik één replica.
4. Zet in Discord Developer Portal > Bot **Server Members Intent** aan. Message Content Intent en Presence Intent zijn niet nodig.
5. Nodig de bot uit met scopes `bot` en `applications.commands`. Geef **Beheer rollen**, **Kanalen bekijken**, **Berichten versturen**, **Links insluiten**, **Bestanden bijvoegen** en **Berichtgeschiedenis lezen**. Voor threads ook **Berichten in threads versturen**.
6. Zet de botrol boven alle gangrangen en alle andere rollen die bij ontslag verwijderd moeten worden.
7. Controleer logs op `La Noche online ... 10 commands geregistreerd.`

Bij elke start worden de 10 commands voor deze botapplicatie in de opgegeven server gesynchroniseerd. Gebruik de nieuwe, eigen La Noche-applicatie. Publieke meldingen worden alleen verstuurd bij het uitvoeren van de betreffende commands of bij het verversen van de reeds geplaatste ledenlijst. Er worden geen automatische pings verstuurd.

## Lokaal

Node.js 24+, `npm ci`, kopieer `.env.example` naar `.env`, vul token/server-ID in, zet `DATA_DIR=./data`, `npm test`, `npm start`.

## Configuratie en assets

`src/settings.js`: kanaal-ID's, aangenomen-rollen, uitzonderingsrol en de 12 rang-ID's intern van laag naar hoog.

`assets/logo.png`: het originele aangeleverde logo. `assets/banner.png`: de bijpassende statische banner, gemaakt met de ingebouwde imagegen-tool. Prompt: premium brede La Noche Discord-banner, aangeleverd oranje logo, zwart getextureerde achtergrond, oranje neonranden, rook en vonken; alleen tekst LA NOCHE. De banner is statisch, geen GIF.

Tests controleren ranggrenzen, behoud van rollen, datums, opslag over herstarts, lijstpaginering en toegangscontrole. Live Discord-acties vereisen de hostingconfiguratie en zijn niet vanuit deze ontwikkelomgeving uitgevoerd.


## Ticketpaneel

Voer na deployment `/ticket-panel` uit in het gewenste tekstkanaal. Het paneel gebruikt het La Noche-logo en een geanimeerde zwart-oranje GIF-banner in dezelfde embed, onder de tekst en boven het keuzemenu. Drugs inkoop en verkoop delen één tekstblok maar blijven aparte menukeuzes. Nieuwe ticketembeds gebruiken dezelfde animatie. De GIF loopt vier seconden, bevat 60 frames en is ongeveer 3,4 MB. Discord kan animaties stilzetten afhankelijk van de persoonlijke toegankelijkheids-/autoplayinstellingen.

- Vier onderwerpen: Sollicitaties, WitWas, Drugs inkoop en Drugs verkoop (roleplay).
- `/ticket-panel` heeft geen categorie- of rolopties meer: elk onderwerp gebruikt automatisch de vaste koppeling hieronder.
- Opnieuw uitvoeren in hetzelfde kanaal werkt het bestaande paneel bij. De koppelingen gelden direct voor nieuwe tickets, ook vanuit bestaande panelen. Eerder geopende tickets behouden hun bestaande kanaal en behandelrol.

| Ticketsoort | Discord-categorie | Behandelrol (naast beheerders) |
| --- | --- | --- |
| Sollicitaties | 1557638802934337616 | 1328812727287677061 |
| Drugs inkoop / verkoop | 1557639006991155271 | 1311585567921934367 |
| WitWas | 1557639163807932516 | 1384749084694286356 |

- Maximaal twee open tickets per gebruiker, over alle ticketsoorten samen. Gesloten, verwijderde of handmatig weggehaalde ticketkanalen tellen niet mee. Privétoegang voor de aanvrager, behandelrol, bot en serverbeheerders.
- Het eerste ticketbericht heeft Claimen, Unclaimen en Sluiten. Het wordt indien mogelijk vastgepind. Alleen de behandelaar of een beheerder kan een claim vrijgeven.
- Sluiten vraagt bevestiging, maakt het ticket alleen-lezen voor de aanvrager en bewaart het gesprek. Een serverbeheerder behoudt zijn Discord-bevoegdheden.
- Ticketgegevens en claims blijven behouden in de SQLite-database; gebruik het bestaande Railway-volume op `/data`.

Botrechten: Kanalen bekijken/beheren, Rollen beheren (kanaalrechten aanpassen), Berichten versturen/beheren, Berichtgeschiedenis lezen, Links insluiten en Bestanden bijvoegen. Bestaande ticketkanalen krijgen expliciete toegangsregels en nemen geen openbare categoriepermissies over.

Validatie: `npm test`; Discord-livecontrole gebeurt na deployment met een gewoon lid en een behandelaar.

Bestaand paneel vernieuwen na deployment: voer `/ticket-panel` opnieuw uit in hetzelfde kanaal; de opgeslagen bericht-ID voorkomt een dubbel paneel. Andere meldingen behouden hun bestaande banner.


### Ticketlogo, meldingen en verwijderen

Het ronde logo in het ticketpaneel en ticketembeds is nu `assets/ticket-logo.gif` (vier seconden, 60 frames). Het betreft het embedlogo, niet de Discord-accountavatar van de bot.

Bij het openen staat uitsluitend de ingestelde behandelrol in de berichttekst met een expliciete mention-allowlist. Meteen na verzenden wordt alleen de tekst leeggemaakt; de embed, animaties en knoppen blijven staan. De bot krijgt in het ticket een expliciete Mention Everyone-permissie om ook niet-vermeldbare behandelrollen te kunnen pingen. Discord-notificatie-instellingen van ontvangers blijven van toepassing.

`$delete` is een tekstcommando en wordt niet als slashcommand geregistreerd. Het werkt uitsluitend in geregistreerde tickets, ook gesloten tickets, voor de ingestelde behandelrol en beheerders. De invoer wordt indien mogelijk verwijderd. Het commando verwijdert het kanaal direct, zonder extra bevestiging of transcript.

Voor `$delete`: Discord Developer Portal → applicatie → Bot → Privileged Gateway Intents → Message Content Intent aanzetten, opslaan en bot herstarten. Bij opstart controleert de bot de application flags. Als het intent niet beschikbaar is, start de rest van de bot zonder dit tekstcommando door en verschijnt een melding in de logs.

Na sluiten staat onder het sluitingsbericht een rode **Ticket verwijderen**-knop. Alleen de ingestelde behandelrol en beheerders kunnen hiermee het kanaal direct verwijderen, zonder extra bevestiging. Deze knop vereist geen Message Content Intent. Eerder geplaatste sluitingsberichten krijgen de knop niet automatisch; daarvoor blijft `$delete` beschikbaar.


### Algemene ticketbeheerrol

Rol `1557644739703078912` heeft toegang tot alle ticketsoorten en kan claimen, claims vrijgeven (ook van andere behandelaren), sluiten en verwijderen. Bij elk nieuw ticket worden zowel deze rol als de specifieke behandelrol kort getagd en daarna uit de berichttekst gehaald. Bij opstart voegt de bot deze rol ook toe aan eerder opgeslagen ticketkanalen, inclusief gesloten tickets; verwijderde kanalen worden overgeslagen. Controleer de melding `Tickettoegang bijgewerkt` in de logs voor eventuele ontbrekende Discord-rechten. Gewone categoriebehandelaren blijven beperkt tot hun eigen tickets en kunnen alleen hun eigen claim vrijgeven.

`/sollistatus` krijgt onderaan een linkknop naar https://discord.com/channels/1311580149094809650/1553516379921973329. Bij opstart scant de bot alle berichtpagina’s in het ingestelde sollicitatiekanaal en het eventueel eerder opgeslagen sollicitatiekanaal. Eigen bestaande sollicitatieberichten krijgen dezelfde knop zonder nieuwe ping of wijziging van tekst/afbeeldingen. Reeds aanwezige links worden overgeslagen. Hiervoor zijn Bekijk kanaal en Berichtgeschiedenis lezen vereist; de logs vermelden eventuele fouten.


## Afwezigheid beoordelen

Nieuwe `/afwezig`-aanvragen verschijnen in het bestaande afwezigheidskanaal met animated banner en logo. Coördinatorrol `1557649156607189015` wordt getagd. Uitsluitend leden met die rol mogen de groene **✅ Goedgekeuren**-knop of rode **❌ Afgekeuren**-knop gebruiken; Administrator geeft geen uitzondering.

Na goedkeuring ontvangt het lid direct afwezigheidsrol `1557648943565774878` en telt de aanvraag mee in het afwezigheidsoverzicht. Afgekeurde en onbeoordeelde aanvragen geven geen rol. De einddatum telt volledig mee in Europe/Amsterdam; daarna wordt de rol binnen ongeveer 30 seconden verwijderd terwijl de bot online is. De controle loopt ook bij opstart, zodat gemiste einddatums na downtime alsnog worden verwerkt. Tijdelijke Discord-fouten worden opnieuw geprobeerd. Aanvragen en beoordelingen blijven opgeslagen in het bestaande `/data`-volume.

De bot moet Rollen beheren hebben, boven de afwezigheidsrol en het lid staan en de coördinatorrol kunnen taggen. Oude afwezigheidsmeldingen van vóór deze update blijven behouden; alleen nieuwe aanvragen krijgen de beoordelingsknoppen en automatische roltoekenning.

Eenmalige reset `2026-10-08-reset-1`: bij de eerste start met deze versie worden oude afwezigheidsregistraties gewist, openstaande/goedgekeurde aanvragen ingetrokken en rol `1557648943565774878` bij alle leden verwijderd. De voltooide reset wordt in SQLite vastgelegd en herhaalt zich niet bij volgende deployments. Tijdens een onvoltooide reset worden nieuwe aanvragen tijdelijk geblokkeerd; ontbrekende rolrechten worden opnieuw geprobeerd. Bestaande aanvraagembeds krijgen status ingetrokken en uitgeschakelde knoppen. Historische berichten worden niet verwijderd.
