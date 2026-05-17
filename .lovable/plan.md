Your message includes ~15 changes spanning calendar UI, sharing flow, messaging, payments, and profile. I'll ship it in 3 phases so you can react after each one. Confirm and I'll start Phase 1.

## Phase 1 — Calendar redesign (matches your screenshot)

Rewrite `/calendar` to look like the reference:
- Top bar: avatar (initials) on left, "Calendar" title, `+` button on right
- Pill tabs under header: **Work**, **Vacation**, **Events**, **Appointments** (Work selected by default, dark pill style)
- Month label ("May 2026") with icons on the right (legend, settings, bell)
- Clean weekday grid (Su–Sa), large numbers, faded days outside current week
- Shifts render as a soft-tinted full-cell block with a small icon (sun/moon/etc.) under the date — matching the pink-block style in your screenshot
- Continuously scrollable months (May → June → July…) instead of paged nav
- Bottom nav updated to 5 tabs: **Calendar, Colleagues, Find Jobs, Learn, Inbox**
- Back button in header on all sub-screens
- Route `/` and `/auth` already redirect to `/calendar` ✓

## Phase 2 — Sharing, colleagues & messaging

- Rename "Friends" → **Colleagues**; new screen layout:
  - "Invite Colleague" CTA at top (share link / email)
  - Pending requests list (accept/decline) — accepting auto-creates friendship + schedule access
  - Colleagues list with **Compare** action → shows their work/off days against yours
  - Owner can **Remove** or **Block** any colleague
- "Share my calendar" button on calendar screen with options: entire year / current month / specific date range
- Tap a day (e.g. May 1) → detail sheet showing time + location + notes
- New **Inbox** tab with 1:1 direct messages between colleagues (new `messages` table with RLS)
- Make `workplaces` free-form (any profession, not healthcare-specific) — already broad in schema, just update UI copy and remove healthcare-only presets

## Phase 3 — FlowPay (Venmo/CashApp-style) & Profile

- FlowPay redesign: send / request money to colleagues, transaction feed, balance card, optional 3% fee toggle on send
- Profile: upload **profile photo** (Supabase Storage bucket `avatars`), edit name, profession, workplace, hourly rate
- Avatars shown throughout (colleagues list, calendar header, messages, transactions)

## Technical notes
- New tables needed in Phase 2: `messages` (sender_id, receiver_id, body, read_at) with RLS
- New storage bucket in Phase 3: `avatars` (public read, owner write)
- All visual work uses existing design tokens in `src/styles.css`; tabs/pills follow the soft luxury palette already defined

## Question
Want me to start with **Phase 1 only** (just the visual redesign to match the screenshot), or run all three phases back-to-back?
