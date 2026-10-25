# Team Tracker

Verfolge deine Sportteams in Gladys: Live-Ergebnisse, das nächste Spiel und Szenen,
die ausgeführt werden, wenn dein Team punktet oder gewinnt.

> **Beta.** Die Ergebnisse stammen aus der öffentlichen API von ESPN, die kostenlos, aber
> nicht dokumentiert ist: Sie kann sich ohne Vorankündigung ändern. Feedback ist im
> [GitHub-Repository](https://github.com/prohand/gladys-teamtracker/issues) oder im
> [Gladys-Forum](https://community.gladysassistant.com/) willkommen.

## Was du erhältst

- **Ein Gerät pro Team**, mit drei Werten:
  - **Punkte**: die Punkte deines Teams im laufenden (oder letzten) Spiel;
  - **Punkte des Gegners**;
  - **Spiel**: eine Zeile, z. B. `Live · 63' · PSG 2 – 1 OM`,
    `Beendet · PSG 2 – 1 OM · Sieg` oder `Nächstes Spiel · Sa., 17. Okt., 17:15 · bei STR`.
- **Szenen-Auslöser**: Spiel beginnt bald, Spiel begonnen, Mein Team hat gepunktet,
  Gegner hat gepunktet, Spiel beendet.
- **Eine Szenen-Aktion**, die das Spiel eines Teams liest, um das Ergebnis anzusagen oder
  das Licht je nach Ergebnis zu ändern.
- **Zwei Dashboard-Widgets**: das laufende Spiel eines Teams und die Liste aller deiner
  Teams.

Kein Konto, kein API-Schlüssel, nichts in deinem Netzwerk zu installieren. Gladys 5.3 oder
neuer ist erforderlich.

## Konfiguration

1. Öffne den Tab **Konfiguration** der Integration.
2. Trage unter **Teams** die zu verfolgenden Teams als `LIGA:TEAM` ein, durch Kommas
   getrennt:

   ```
   LIG1:PSG, TOP14:RAC, NFL:KC, NBA:LAL
   ```

   - `LIGA` ist ein Code aus der [Tabelle unten](#ligen).
   - `TEAM` ist die Abkürzung des Teams (`PSG`, `KC`) oder seine ESPN-ID (`160`).
   - Unsicher? Klicke auf **Team suchen**, wähle die Liga und gib einen
     Teil des Namens ein: Die Integration listet die genauen Zeilen zum Einfügen auf.

3. Wähle die **Sprache** der Spieltexte und deine **Zeitzone** (z. B.
   `Europe/Berlin`, `Europe/Paris`), die für die Anstoßzeiten verwendet wird.
4. Speichere und klicke dann auf **Teams testen**: Jedes Team wird mit seinem
   laufenden oder nächsten Spiel aufgelistet, und jeder Eintrag, der nicht verfolgt werden
   kann, nennt den Grund.
5. Öffne den Tab **Entdecken** und füge die Team-Geräte mit **Zu Gladys hinzufügen** hinzu.

### Weitere Einstellungen

| Einstellung                             | Standard     | Bedeutung                                                     |
| --------------------------------------- | ------------ | ------------------------------------------------------------- |
| Erinnerung vor Anstoß (min)             | 30           | So lange vorher wird der Auslöser „Spiel beginnt bald“ aktiv. |
| Aktualisierung während eines Spiels (s) | 30           | Wie oft die Ergebnisse während eines Spiels gelesen werden.   |
| Aktualisierung zwischen Spielen (min)   | 15           | Wie oft die nächsten Spiele sonst geprüft werden.             |
| Zeitzone                                | Europe/Paris | Anstoßzeiten werden in dieser Zone angegeben (IANA-Name).     |
| Sprache der Spieltexte                  | Englisch     | Sprache der Zeile „Spiel“ und des `summary` der Szenen.       |

Die Integration wird für die Erinnerung und den Anstoß von selbst aktiv: Du brauchst
keine kurze Aktualisierung, um den Beginn eines Spiels mitzubekommen.

## Ligen

| Code   | Liga                    | Code    | Liga                    |
| ------ | ----------------------- | ------- | ----------------------- |
| `LIG1` | Ligue 1                 | `TOP14` | Top 14                  |
| `LIG2` | Ligue 2                 | `SIXN`  | Six Nations             |
| `CDF`  | Coupe de France         | `RWC`   | Rugby World Cup         |
| `D1F`  | Première Ligue (Frauen) | `NFL`   | NFL                     |
| `EPL`  | Premier League          | `NCAAF` | NCAA Football           |
| `LIGA` | LaLiga                  | `NBA`   | NBA                     |
| `SERA` | Serie A                 | `WNBA`  | WNBA                    |
| `BUND` | Bundesliga              | `NCAAM` | NCAA Men's Basketball   |
| `CL`   | Champions League        | `NCAAW` | NCAA Women's Basketball |
| `EL`   | Europa League           | `NHL`   | NHL                     |
| `ECL`  | Conference League       | `MLB`   | MLB                     |
| `MLS`  | MLS                     | `WC`    | FIFA World Cup          |
| `NWSL` | NWSL                    | `WWC`   | FIFA Women's World Cup  |

**Eine andere Liga?** Jede ESPN-Teamliga funktioniert mit ihren zwei Pfadsegmenten statt
eines Codes: `soccer/por.1:SLB` (Liga Portugal), `soccer/ned.1:AJA` (Eredivisie). Das
sind die beiden Teile nach `/sports/` in den Adressen der ESPN-API.

**Ein Team in zwei Wettbewerben** (Ligue 1 und Champions League) sind zwei Einträge:
`LIG1:PSG, CL:PSG`. Jeder ist ein eigenes Gerät.

**Gleiche Abkürzung für zwei Teams** (drei Teams der Top 14 heißen `STA`): Verwende
die ESPN-ID, die **Team suchen** angibt (`TOP14:25922` für Stade Toulousain).

Einzelsportarten (Tennis, Golf, F1, MMA) werden nicht unterstützt: Ein Spiel dort besteht
nicht aus zwei Teams mit einem Ergebnis.

## Szenen

Die Integration fügt dem Szenen-Editor eigene Karten hinzu, in der Kategorie
**Integrationen**.

### Auslöser

| Auslöser                | Wann                                                                  |
| ----------------------- | --------------------------------------------------------------------- |
| Spiel beginnt bald      | Die Erinnerung vor Anstoß ist fällig (standardmäßig 30 min).          |
| Spiel begonnen          | Das Spiel hat begonnen.                                               |
| Mein Team hat gepunktet | Die Punkte deines Teams sind gestiegen (Tor, Versuch, …).             |
| Gegner hat gepunktet    | Die Punkte des Gegners sind gestiegen.                                |
| Spiel beendet           | Das Spiel ist vorbei; filterbar nach Sieg, Niederlage, Unentschieden. |

Jeder Auslöser kann auf ein **Team** und auf **Heim**- oder **Auswärts**spiele beschränkt
werden; leer gelassen passt jedes Team. Die folgenden Aktionen können die Details mit
`{{triggerEvent.data.<name>}}` lesen:

| Variable         | Beispiel                      | Auslöser                                      |
| ---------------- | ----------------------------- | --------------------------------------------- |
| `team_name`      | `Paris Saint-Germain`         | alle                                          |
| `opponent`       | `Strasbourg`                  | alle                                          |
| `home_away`      | `away`                        | alle                                          |
| `league`         | `Ligue 1`                     | alle                                          |
| `team_score`     | `2`                           | alle                                          |
| `opponent_score` | `1`                           | alle                                          |
| `summary`        | `Live · 63' · PSG 2 – 1 STR`  | alle                                          |
| `points`         | `1` (`6` für einen Touchdown) | Mein Team hat gepunktet, Gegner hat gepunktet |
| `result`         | `win`, `loss` oder `draw`     | Spiel beendet                                 |
| `kickoff`        | `2026-10-17T15:15Z`           | Spiel beginnt bald                            |
| `minutes`        | `30`                          | Spiel beginnt bald                            |

Beispiele:

- **Torlicht**: „Mein Team hat gepunktet“ → das Wohnzimmerlicht 30 Sekunden lang grün
  schalten.
- **Spielerinnerung**: „Spiel beginnt bald“ → eine Nachricht „{{triggerEvent.data.summary}}“
  senden.
- **Ergebnis**: „Spiel beendet“, Ergebnis = Sieg → ein Lied abspielen.

Die Ergebnisse werden standardmäßig alle 30 Sekunden gelesen: Ein Ereignis kommt bis zu
dieser Zeit nach der Aktion auf dem Spielfeld an, zuzüglich der eigenen Verzögerung von
ESPN.

### Aktion: Spiel eines Teams lesen

Gibt den folgenden Aktionen das laufende oder nächste Spiel eines Teams: `state` (`pre`,
`in`, `post` oder `none`), `is_live`, `team_score`, `opponent_score`, `opponent`,
`kickoff`, `result` und `summary`. Sie antwortet aus der letzten Abfrage, ohne ESPN
aufzurufen.

Die beiden Punktestände sind auch Gerätewerte: Eine Szenen-**Bedingung** kann sie
vergleichen („nur wenn mein Team führt“).

## Dashboard

- **Spiel eines Teams**: Wähle in den Widget-Einstellungen ein Team. Live-Ergebnis
  (es folgt den Gerätewerten in Echtzeit, sobald das Gerät erstellt ist), Spielzeit,
  Anstoß, Gegner, Heim oder auswärts und eine Schaltfläche **Aktualisieren**.
- **Meine Teams**: alle verfolgten Teams mit ihrem Logo, laufende Spiele zuerst, mit einem
  Abzeichen **LIVE**, dem Ergebnis oder **DEMNÄCHST**.

## Fehlerbehebung

- **Ein Team fehlt in Entdecken**: Klicke auf **Teams testen**, es nennt den Grund
  (unbekannte Liga, Team nicht gefunden, Abkürzung von mehreren Teams geteilt, ESPN nicht
  erreichbar).
- **Das Abzeichen eines Teams zeigt „Nicht erreichbar“**: ESPN hat auf die letzte Abfrage
  nicht geantwortet. Die zuletzt bekannten Ergebnisse bleiben angezeigt; die nächste
  Abfrage versucht es erneut.
- **Die Anstoßzeiten sind um einige Stunden verschoben**: Stelle deine **Zeitzone**
  ein.
- **Protokolle**: Öffne den Tab **Protokolle** der Integration in Gladys. Jedes
  Szenen-Ereignis wird protokolliert (`Scene event team_scored <- LIG1:PSG: …`).

## Datenschutz

Die Integration sendet ESPN nur die Ligen und Team-IDs, die sie liest. Sie benötigt kein
Konto und speichert eine kleine Datei in ihrem eigenen `/data`-Volume (die letzte Abfrage
jedes Teams).
