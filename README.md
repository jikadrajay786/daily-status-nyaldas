# Daily Status

Daily work updates for non-technical teams, in English, Hindi and Gujarati, backed by Supabase.

| Folder            | What                                                                                      |
| ----------------- | ----------------------------------------------------------------------------------------- |
| `apps/desktop`    | Electron app for macOS and Windows                                                        |
| `apps/mobile`     | Expo app for iOS and Android (sign-in, Today, History, Team; settings and reminders next) |
| `packages/core`   | Shared by both: Supabase services, schema types, translations, date rules                 |
| `packages/editor` | The status editor, shared by desktop and the mobile app's in-app web page                 |
| `supabase`        | Database migrations (RLS, roles, views)                                                   |

## Setup

```bash
npm install                                   # installs every workspace
cp apps/desktop/.env.example apps/desktop/.env  # then fill in the Supabase URL and publishable key
cp apps/mobile/.env.example apps/mobile/.env    # same two values, EXPO_PUBLIC_ prefix
```

## Commands (run from the repo root)

| Command                              | Does                                                                                |
| ------------------------------------ | ----------------------------------------------------------------------------------- |
| `npm run dev`                        | Desktop app with hot reload                                                         |
| `npm run build:mac` / `build:win`    | Desktop installers (`apps/desktop/dist`)                                            |
| `npm run android` / `npm run ios`    | Build and install the mobile dev app (first time, or after adding a native package) |
| `npm run mobile`                     | Metro for the installed dev app (press `a` / `i`)                                   |
| `npm test`                           | Unit tests for the shared core                                                      |
| `npm run typecheck` / `npm run lint` | Every workspace                                                                     |
