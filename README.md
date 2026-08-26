# Cursor Bots

Skrivbordsapp med namngivna teammates. Varje bot är en [Cursor Cloud Agent](https://cursor.com/docs/cloud-agent). Usage går mot ditt **Cursor-konto**.

![Cursor Bots](docs/screenshots/app-main.png)

Sidofält, teamchatt och pixel-art-avatarer:

![Teamchatt](docs/screenshots/team-chat.png)

![Sidolista](docs/screenshots/sidebar-roster.png)

## Ladda ner

Installerbara byggen: [github.com/wachtelhund/CursorBot/releases](https://github.com/wachtelhund/CursorBot/releases).

- **macOS:** `Cursor-Bots-*-mac-arm64.dmg` (Apple silicon) och `Cursor-Bots-*-mac-x64.dmg` (Intel). Även `.zip`.
- **Linux:** `Cursor-Bots-*-linux-x64.AppImage`
- **Windows:** `Cursor-Bots-*-win-x64.exe` (NSIS)

Byggena är **osignerade**. På macOS: högerklicka → Öppna om Gatekeeper stoppar. På Windows kan SmartScreen varna.

En release skapas när du pushar en tagg `v*` (t.ex. `v0.1.0`) eller publicerar en GitHub Release. Workflow **Release** kan också köras manuellt under Actions — då landar filerna som artifacts, inte som en GitHub Release.

## Kör lokalt

```bash
npm install
npm run dev
```

I appen: kugghjul → klistra in en API-nyckel från [cursor.com/dashboard/api](https://cursor.com/dashboard/api).

`ELECTRON_RUN_AS_NODE` måste vara av (`npm run dev` tar bort den).

## Team

Öppna **Team** i sidofältet. En egen rad `@Research gör X` eller `@Research: gör X` startar den boten. `@alla` på egen rad tar alla. `@Namn` mitt i en mening väcker ingen. Bottarna kan skriva `@Namn: …` till varandra.

Inloggning till GitHub, AWS och Cloudflare görs i Cursor, inte här. Delade tokens lägger du under Inställningar.

## Bygg

```bash
npm run dist
```

Bygget läggs i `release/`.

## Usage

Körningar syns på [cursor.com/dashboard/usage](https://cursor.com/dashboard/usage) under **SDK**, och på [cursor.com/agents](https://cursor.com/agents) med **Source → SDK**.

Ikoner är anpassade från [LibreChat](https://github.com/danny-avila/LibreChat) (MIT). Se `THIRD_PARTY.md`.
