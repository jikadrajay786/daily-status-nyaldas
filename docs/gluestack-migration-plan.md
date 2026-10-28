# Plan: moving the UI to gluestack-ui

Status: proposal, nothing changed yet. Written 24 Oct 2026.

## Recommendation

- **Mobile: migrate**, on gluestack-ui **v5** (current; "v2" is two majors old) with the **Uniwind** styling engine.
- **Desktop: don't migrate.** Keep its DOM components and Tailwind v4 tokens, and share one token source with mobile so both apps still look the same.
- **Start with a one-day spike** and stop if it fails any of its checks.

## Why not NativeWind, and why not v2

| Option                               | Tailwind | Status            | Fit here                                                                                                                                                             |
| ------------------------------------ | -------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| gluestack v2 + NativeWind 4.2.7      | v3       | stable            | Clashes with the Tailwind v4 already hoisted for desktop, `packages/editor` and the mobile DOM editor. Two Tailwind majors in one npm workspace don't hoist cleanly. |
| gluestack v5 + NativeWind 5.0.0-rc.0 | v4       | release candidate | Works once v5 is stable. Not worth shipping on an RC.                                                                                                                |
| gluestack v5 + Uniwind 1.13          | v4       | stable            | Same Tailwind as the rest of the repo, supports RN ≥ 0.81 (we're on 0.88), and the gluestack CLI supports it, including monorepo mode.                               |

The `className` styling is the same with either engine, so we can switch to NativeWind v5 later without touching screens.

## Why the desktop stays as it is

The desktop renderer is React DOM, not React Native. gluestack components would need it to run through `react-native-web`, which would undo rules in CLAUDE.md:

- **Text size:** everything sizes off the root font (`data-size`) so the app reflows at 200%. React Native Web uses fixed pixels.
- **Accessibility:** native `<select>`, the `:focus-visible` outline, forced-colours support via `aria-pressed`, and the custom scrollbars.
- **Task board:** HTML drag and drop, which React Native has no equivalent for.
- **Size of the job:** about 2,900 lines in 25 files for little gain, since desktop already uses Tailwind with semantic tokens.

## Phases

**0. Spike (1 day, on a branch).** Install with the gluestack CLI in monorepo mode for `apps/mobile` only. It passes if all of these work:

- A dev build (`expo run:*`) on Android and iOS with Expo SDK 58, RN 0.88 and Hermes.
- The React Compiler stays on.
- The DOM editor's `postcss.config.mjs` and `dom/editor.css` still build next to the Uniwind Metro plugin.
- The Hindi/Gujarati fonts render.
- `npm ls react` still shows a single copy.

If anything fails, stop and keep the current setup.

**1. Tokens (1–2 days).**

- Turn the six palettes in `lib/theme.ts` (system, light, dark, midnight, cyberpunk, sepia) into CSS variables for Uniwind themes.
- Move the shared values into one source both apps read, so `main.css` and mobile can't drift.
- Keep "Match my phone", 4.5:1 contrast on every text/background pair, and 3:1 on the focus colour.

**2. Primitives (2–3 days).**

- Rebuild the insides of `components/ui.tsx` on gluestack: `Screen`, `Title`, `Button`, `Field`, `Notice`, `Link`, `Badge`, `Skeleton`, `Loading`, `Card`, `Avatar`, `Stat`, `Segmented`.
- Keep the same exported names and props, so no screen changes yet.
- Keep the current behaviour:
  - 48pt touch targets;
  - the `busy` spinner in front of an unchanged label;
  - screen-reader labels and live regions;
  - font scaling;
  - `KeyboardAvoidingView` padding.

**3. Screens (4–6 days, one per pull request).**

- Order: sign-in/verify → Settings → Tasks → History → Today → Team (list, person, edit).
- Change `StyleSheet.create` to `className` in 20 files (about 4,200 lines of TSX in all).
- Check each screen in all 6 themes, 3 languages and at the 2x text size.

**4. Keep these custom, restyle only.**

- `LiquidTabBar` (SVG + Reanimated springs);
- `OtpInput`;
- `SubmissionCalendar` (memoised);
- the `TaskCard` swipe;
- native `RichText`;
- the DOM editor, which is already Tailwind v4.

**5. Clean up.**

- Remove the palette objects from `theme.ts`.
- Update CLAUDE.md: drop "plain StyleSheet (no NativeWind)" and add the rules below.
- Optionally, add an ESLint rule against `StyleSheet.create` in `src/app`.

**6. Verify (2 days).**

- Android and iOS release builds; compare APK size against the current ~106 MB.
- TalkBack and VoiceOver.
- Reduced motion.
- Scrolling speed in the History and Team lists on a low-end Android phone.

**Total:** about 2–3 weeks.

## Risks

- **App size and Android speed:** new dependencies (react-aria, Uniwind runtime) add weight, and `className` on long list rows adds a cost on Android. Measure both in phase 6.
- **Platform versions:** Uniwind and gluestack must keep up with Expo SDK and RN upgrades, so check them before each SDK bump.
- **Disk space:** only about 9.5 GB is free, and a second `node_modules` tree plus native rebuilds need several GB.

## Rules to adopt afterwards (adapted from the pasted guidelines)

- **Mobile:** reuse `apps/mobile/src/components/ui` (gluestack-based) before writing a new component. Style with `className` and semantic tokens, never hex or palette colours.
- **Desktop:** reuse `components/ui.tsx` and the semantic Tailwind tokens. Use rem-based `auto-fit` grids and `flex-wrap`, not `sm:`/`md:`/`lg:` breakpoints, because breakpoints ignore the Text size setting.
- **Both:** extend an existing component through props instead of making a second one. Every pressable element keeps its accessibility label and role.

## Phase 0 result (24 Oct 2026): go, with three conditions

Branch `spike/gluestack-uniwind`. Installed `uniwind@1.13.0`, `@gluestack-ui/core@5.0.15`, `@gluestack-ui/utils@5.0.6` and `@expo/html-elements@58.0.3` from the root. Copied Box, Text, Heading, Button, VStack, HStack and Card into `apps/mobile/src/components/gs`, plus a spike screen (`gs/Spike.tsx`).

| Check                                           | Result                                                                                        |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Android dev build (emulator)                    | Pass. No new native code, so the installed debug app runs it.                                 |
| iOS dev build (iPhone 17 Pro simulator)         | Pass, same reason.                                                                            |
| React Compiler still on                         | Pass. Spike compiles to `react-compiler-runtime` memo cache.                                  |
| DOM editor CSS next to the Uniwind Metro plugin | Pass. Editor renders styled on iOS; its CSS bundle still has `.rich` and the theme variables. |
| Hindi/Gujarati fonts                            | Pass on both platforms, including conjuncts, and at Android's 2x font size.                   |
| One copy of React                               | Pass (19.3.0).                                                                                |
| Runtime themes beyond light/dark                | Pass. A third palette (`sepia`) switches live on both platforms.                              |
| Typecheck, lint                                 | Pass, after the fixes below.                                                                  |

Conditions found:

- **One theme owner.** `Uniwind.setTheme('light' | 'dark')` also forces React Native's app-wide colour scheme, and our root layout reads that scheme. Passing it back into `GluestackUIProvider mode` made the two fight (tap sepia, get dark). Phase 1 must make Uniwind the only owner: our saved theme calls `Uniwind.setTheme`, "Match my phone" calls `setTheme('system')`, and `lib/theme.ts` reads Uniwind instead of `useColorScheme()`.
- **Don't trust the CLI's `--uniwind`.** `gluestack-ui@5.0.3 init --uniwind` silently generated a NativeWind v4 / Tailwind v3 setup. The Uniwind files were copied by hand from its own `starter-kit-expo-uniwind`. Use `npx gluestack-ui add` only after checking what it writes.
- **Treat templates as our code.** The Button template had a type bug under our strict TypeScript (ActivityIndicator's `size` passed into a style variant) and needed explicit return types and formatting for our lint rules.

Also seen: an extra unguarded Expo Router route became the fallback for `/` when signed out, so the spike screen is a plain component, not a route. The dev-only "configured linking in multiple places" error showed once, right after changing Android's font size. It is not confirmed to be related.

Not covered by the spike: release builds, app size, list scrolling speed, screen readers. Those stay in phase 6.

## Phase 1 result (24 Oct 2026): done

- **One colour source:** the six palettes moved to `packages/core/src/palettes.ts`. `test/palettes.test.ts` compares every value with desktop's `main.css` (resolving `light-dark()` and `var()`), and keeps `apps/mobile/src/theme.gen.css` in sync as a file snapshot. A one-digit change to sepia's `--ok-fg` failed both checks and named the variable.
- **One theme owner:** the root layout gives Uniwind the saved choice before the first frame and on every change, then reads `useUniwind().theme` for the palette, so existing StyleSheet screens and gluestack components always agree. `GluestackUIProvider` no longer touches the theme.
- **Tokens:** `global.css` exposes desktop's token names, and gluestack's names map onto them. Opacity tints like `bg-ok/15` work on device.
- **Button template restyled** with our tokens, 48pt height and no `dark:` classes, to match `components/ui.tsx`.

Checked on the Android emulator: all six themes, "Match my phone" following the phone's dark mode both ways, the choice surviving a restart, and the existing sign-in screen following the theme. On the iOS simulator, the real Settings radios switch and save the theme.

## Phase 2 result (24 Oct 2026): done

`apps/mobile/src/components/ui.tsx` keeps its exports and props; inside, every primitive is gluestack + Uniwind classes, with no `StyleSheet` or colour lookups:

| Primitive                    | Built from                                                                                        |
| ---------------------------- | ------------------------------------------------------------------------------------------------- |
| Screen, Title, Loading, Stat | VStack/HStack/Heading/Text, Uniwind-wrapped `SafeAreaView`                                        |
| Button                       | gluestack Button (variants mapped: primary → default, ghost, danger → destructive), ButtonSpinner |
| Field                        | gluestack Input + InputField (`placeholderTextColorClassName`, `selectionColorClassName`)         |
| Notice, Badge                | Box / gluestack Badge with tone classes (`bg-ok/15`, `border-ok/30`, `text-ok-fg`)                |
| Link, Segmented              | gluestack Pressable, Spinner                                                                      |
| Card, Avatar                 | gluestack Card, Avatar (plain Text inside)                                                        |
| Skeleton                     | `Animated.View` for the fade, Box for the `bg-selected` bar                                       |

New gluestack templates: Input, Badge, Avatar, Pressable, Spinner, restyled with our tokens (48pt, 10px corners, no `dark:`).

Problems found and fixed:

- **1.3 GB of React Spectrum.** The newest `@react-types/*` releases depend on Adobe's whole design system. npm ignored both flat and scoped `overrides`, so mobile pins the last lean versions as devDependencies; gluestack's packages dropped from 1.6 GB to 485 MB. Its `react-aria` packages are still duplicated under `core` and `utils`.
- **Metro and `.mjs`.** The new `react-aria` exports `.mjs` files, which Expo's default source extensions don't include; `metro.config.js` adds them.
- **Template bugs under our strict TypeScript:** Input typed its ref as its props (fixed with one commented cast), Badge's icon types (icon removed), Avatar ignored `size`, and Spinner had a hard-coded English "loading" label.
- **Avatar initials.** gluestack's `AvatarFallbackText` takes `charAt(0)`, which turns क्ष into क; our Avatar keeps passing core's `firstGrapheme` initials as plain text.

Checked: Android sign-in in light and dark, at 2x text (48dp minimum confirmed), typing into a field; iOS Today, History, Tasks and Settings in Warm paper; every primitive (Stat, loading Skeleton, both Avatar sizes, Badges, busy Link, all Notice tones) on the spike screen. Not seen on a real screen yet: the admin Team screens (Stat, Avatar), since the test accounts are staff.

## Phase 3 progress

**Sign-in / verify (24 Oct 2026): done.** `AuthScreen`, `VerifyEmail` and `OtpInput` have no `StyleSheet` or `useTheme()` left. In `OtpInput`, the Reanimated views carry only the animated values (shake, caret blink) and the drawn boxes are gluestack Boxes with Uniwind classes. Checked on Android: sign-in, sign-up, empty-field errors (checked on the phone, nothing sent), and the code boxes with three digits typed (filled, active with caret, the split after the third box, the resend countdown).

**Settings and AppLock (24 Oct 2026): done.** Native colour props use Uniwind's `*ColorClassName` props instead of palette lookups: the Switch tracks and thumb (`trackColorOnClassName`, `thumbColorClassName`, `ios_backgroundColorClassName`), and, through `withUniwind`, the lucide check icon (`colorClassName`) and the iOS time picker (`accentColorClassName`). The row dividers use Uniwind's `hairlineWidth()`. What stays as values is data, not styling: each theme swatch shows another theme's colours from `PALETTES`, and the picker's `themeVariant` is light/dark. Settings now shares one `Toggle` and `SwitchRow` for its two switches. Checked on iOS (Warm paper and Neon: list, check icon, switches, picker) and Android (on/off switch thumbs, the time button, the blocked-reminder notice, the lock screen).

**Tasks and TaskCard (24 Oct 2026): done.** Uniwind's Metro resolver backs every `react-native` import outside React Native itself, Reanimated included, so `className` works on `Animated.View`/`Animated.Text` alongside animated styles. TaskCard keeps palette values only for colours Reanimated fades between statuses (badge, option fill and border); everything static is a class, the spinner and tick use `*ColorClassName`, and the swipeable's 14px corner is a style constant because that third-party prop takes no class. The tone class maps moved to `lib/tones.ts` (exporting them from `ui.tsx` breaks Fast Refresh). Checked on Android with placeholder tasks (every status, overdue badge, Hindi title, a partial swipe showing the green action, released without completing anything) and the real empty Tasks screen on iOS. The progress bar was not seen with data: the test accounts have no tasks.

**History and StatusCard (24 Oct 2026): done.** Plain layout and text, now all classes; `CardsSkeleton` shares the card's head-row classes so loading cards keep the same shape. Checked on Android with placeholder updates (edit/delete, the delete confirmation, the locked note, an edited card, a team card with author, the skeleton) and the real empty History screen on iOS.

**Found along the way: "Cance".** On Android, weight-600 text is measured narrower than it is drawn, so a short button label beside another button lost its last letter ("Cancel" next to "Yes, delete"). An exact copy of the pre-migration Button does the same, so it predates the migration; weight 700 or `sans-serif-medium` measure correctly, and `textBreakStrategy`, `includeFontPadding`, layout changes and line height don't help. Button labels are now `font-semibold android:font-bold` in the Button template.

**Today, DateField and HoursField (24 Oct 2026): done.** The collapsed-not-unmounted form (the editor's WebView must stay mounted) is now `h-0 overflow-hidden opacity-0` on the same view; the editor still gets the palette as resolved CSS variables (`cssVars`), since it runs in a WebView. Icons and the iOS date picker use `*ColorClassName`; the picker's light/dark `themeVariant` stays a value. Checked on iOS (the real Today screen: date, badge, editor, stepper, Submit, recent updates) and Android (the date button and "All dates" state, the stepper going 8 → 9, the hours error state). Not seen: the submitted and locked states of Today, since the test account has no updates.

**Team screens and MemberPicker (24 Oct 2026): done.** The person screen's timeline (a left rule with a dot per update) is now `border-l-2` plus an absolutely positioned dot, and the streak flame uses `colorClassName`. MemberPicker's "Close" label is `android:font-bold` for the same clipping reason as buttons. Checked on Android with the Team list rendered signed out (layout, stat cards, filters, the member picker sheet, the People tab; data reads fail under RLS and show the friendly notice). Not seen: the person and edit screens, which need an admin session and a real person; they rely on typecheck and lint.

**RichText, SubmissionCalendar and LiquidTabBar (25 Oct 2026): done; phase 3 complete.** No mobile file uses `StyleSheet.create`.

- RichText: every allowed mark, colour and highlight is a fixed class; nested Text still inherits a ticked item's strike-through. The rule keeps `StyleSheet.hairlineWidth * 2` as a value, since a class gives one hairline, not a multiple.
- SubmissionCalendar: the day marks keep their shapes (dot, cross, ring, dash) as classes, so `Mark` no longer needs the palette.
- LiquidTabBar: layout is classes; the springs and the SVG path are unchanged. Values that stay values: the capsule's SVG fill (animated component), the icon `color` React Navigation passes, the safe-area bottom padding, and the shadow (iOS shadow props and Android `elevation` have no class). `react-native-svg` isn't a core component, so `Svg` is wrapped with `withUniwind`. The active label is `android:font-bold`.

Checked: the tab bar on iOS (bar, shadow, capsule moving to Tasks with its label) and, on Android, a RichText sample with every element plus a month of SubmissionCalendar with all states and the legend.

**What `useTheme().colors` is still for:** values a class can't express: Reanimated colour fades (TaskCard), the editor WebView's `cssVars`, React Navigation's icon colour and the SVG fill (tab bar), theme previews (Settings swatches), and the light/dark `themeVariant` of native pickers.

## Phase 4 and 5 result (25 Oct 2026): done

**Phase 4** needed no separate work: `LiquidTabBar`, `OtpInput`, `SubmissionCalendar`, the `TaskCard` swipe, native `RichText` and the DOM editor all kept their logic and were restyled during phase 3.

**Phase 5, clean-up:**

- Deleted the spike screen (`components/gs/Spike.tsx`). Every copied gluestack component is in use.
- `lib/theme.ts` holds no palettes (they moved to core in phase 1); its unused `Colors` re-export is gone.
- ESLint now rejects `StyleSheet.create` anywhere in `apps/mobile/src` (`no-restricted-syntax` in `eslint.config.mjs`).
- CLAUDE.md: "plain StyleSheet (no NativeWind)" is replaced by the gluestack/Uniwind rules, plus the adopted guidelines: reuse `components/ui.tsx` then `components/gs`, extend through props, copy new components from the Uniwind starter kit, keep accessibility roles and labels.

Checks: typecheck, lint (0 errors) and 63 tests pass; a clean Android export bundles (8.9 MB of bytecode); the app starts on the emulator.

**Next: phase 6** (verify): Android and iOS release builds and APK size against the ~106 MB baseline, TalkBack and VoiceOver, reduced motion, and list scrolling speed on a low-end Android phone.

## Phase 6 result (25 Oct 2026): Android verified; iOS release build not run

**App size (Android release, all four CPU types, same signing as before):**

| Part              | Before    | After     | Change           |
| ----------------- | --------- | --------- | ---------------- |
| APK               | 110.66 MB | 111.21 MB | +0.55 MB (+0.5%) |
| JavaScript bundle | 6.57 MB   | 7.11 MB   | +0.54 MB         |
| Native code       | 96.74 MB  | 96.74 MB  | none             |
| Java/Kotlin (dex) | 6.91 MB   | 6.91 MB   | none             |
| Editor web bundle | 3.52 MB   | 3.53 MB   | none             |

The whole cost is JavaScript (gluestack, react-aria, Uniwind); no native modules were added, so release builds reuse the existing native intermediates (about 50 s incremental).

**Build hygiene, found on the way (not caused by the migration):** the bundle step writes the editor's web bundle into `android/app/build/generated/assets/react/release/www.bundle` without clearing it, so every editor change leaves the previous 3.5 MB bundle inside the next APK. Delete that folder (or run a clean build) before a release build.

**List speed (release build, emulator, 300 History-style cards with rich text and two buttons each, 18 fast flings):** second run 1,148 frames, 0.35% janky, median 17 ms, 99th percentile 22 ms, one slow UI-thread frame; the first run, which includes laying out each card for the first time, was 5.7% janky. Cards were fully drawn mid-fling. This is an emulator, not the low-end phone the plan asked for, and there is no pre-migration measurement of the same list to compare against.

**Screen readers (Android 17 accessibility tree):** every tappable element on sign-in, Settings, task cards and status cards has a label and the right role (radio, switch, button, link) with checked/selected state. Two problems found and fixed:

- gluestack's input forced `aria-label="Input Field"` and marked the focused field `aria-selected`, both after our props, so TalkBack read "Input Field, selected" for every text box. `InputField` now renders a Uniwind `TextInput` itself; fields read "Email", "Password", and focus no longer says "selected".
- React Native announces a busy pressable only as "busy" (old Button included). `Button` and `Link` now pass their text as `accessibilityLabel`, so a busy button reads "Save, busy".

Not covered: the code-entry screen (its caret blink keeps the UI from ever going idle, which the tree dump needs; its accessibility props are unchanged), TalkBack and VoiceOver by ear, and iOS.

**Reduced motion:** with Android's animation scales at 0, both Reanimated's `useReducedMotion` and React Native's `isReduceMotionEnabled` report true, and false again at 1; the tab bar, task cards and code boxes read that hook. The emulator's settings were restored.

**iOS release build (25 Oct 2026): passes.** After freeing about 27 GB (the Yarn, npm and gluestack CLI caches, and this app's Android build output), `xcodebuild -configuration Release -sdk iphonesimulator` succeeded: a 93 MB simulator app (51 MB of it frameworks) with an 8.86 MB JavaScript bundle. Installed on the iPhone 17 Pro simulator it runs from its own bundle without Metro: the saved session, the Warm paper theme through Uniwind, the editor's web bundle, the tab bar and Settings all work. There is no pre-migration iOS release build to compare sizes with, and simulator builds aren't representative of App Store size anyway. The simulator is back on the debug app.
