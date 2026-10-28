# Stackd

**One place for students to find opportunities, save them, and track their applications.**

Students hear about summer programs, scholarships, competitions, and internships from a dozen places: school announcements, group chats, club officers, and random websites. Stackd brings them into one feed. You save what you want to apply to into your personal **Stack** and track each application from *interested* to *submitted* to *decided*.

🏆 Won a **$1,000 startup competition award**.

> **Status:** early prototype. This repo holds the app scaffold (Expo Router + Supabase client). The opportunity feed, Stack, and application tracker are being built here next. See the [roadmap](#roadmap).

## Planned features

- **Discover:** browse and filter opportunities by type, deadline, grade level, cost, and location
- **Stack:** save opportunities to a personal list
- **Track:** move each application through stages, with deadline reminders
- **Shared catalog:** opportunity data lives in Supabase, so every user sees the same up-to-date listings

## Tech stack

| Layer | Choice |
|---|---|
| App | React Native + Expo (SDK 57), TypeScript |
| Navigation | Expo Router (file-based routing) |
| Backend / data | Supabase (Postgres, auth) |
| Platforms | iOS, Android, web from one codebase |

## Getting started

```bash
npm install
# create .env with your Supabase URL and anon key (see below)
npx expo start
```

Then open it in Expo Go, an iOS simulator, an Android emulator, or the browser (`w`).

Supabase keys go in `.env` as `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`. Never commit `.env`.

## Roadmap

- [x] Project scaffold: Expo Router, TypeScript, Supabase client
- [ ] Supabase schema: `opportunities`, `stacks`, `applications`, with row-level security
- [ ] Discover feed with search and filters
- [ ] Save to Stack and track application stages
- [ ] Deadline push notifications
- [ ] Pilot with students at Marvin Ridge High School, then publish on TestFlight

## Author

Built by [Arnav Kanderi](https://arnavkanderi.com).
