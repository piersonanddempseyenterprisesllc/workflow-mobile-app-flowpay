
# Workflow — App Store Readiness Plan

A lot landed in your last reply, so I'm splitting it into phases. Each phase is shippable on its own. Approve this plan and I'll start at Phase 1; we can re-scope between phases.

---

## Phase 1 — Cleanup & navigation foundation

Goal: nothing broken, nothing leftover, everything obvious.

- Land users on **Calendar** after sign-in (already does; also make `/` redirect to `/calendar`).
- **BottomNav** (5 tabs, correct icons + labels):
  1. Calendar
  2. Compare (renamed from Colleagues)
  3. Messages (new — DMs)
  4. Wallet (FlowPay-style)
  5. Profile
- Remove the FlowPay card from `/home` and retire the `/home` route (its dashboard role is absorbed by Calendar + Wallet).
- Add a **global back button** in a top app bar on every non-root screen (uses `router.history.back()`).
- Confirm scroll works on every screen (calendar already does; audit Profile / Compare / Wallet / Messages).
- Empty states everywhere with one-tap "what to do next".

## Phase 2 — Calendar restructure (NurseGrid feel)

- Move category tabs to the **top of Calendar**, in this fixed order: **Work, Vacation, Events, Appointments**.
- Add a **"+ Add tab"** affordance at the **bottom** of the tab strip that creates a custom category (stored per user).
- Tap a day → bottom sheet with **time + location + notes + workplace** (already most of this; surface location prominently).
- Keep month-scroll, multi-select, themes — all working.

## Phase 3 — Sharing & "Compare" (replaces Colleagues)

- Rename screen to **Compare**. Top section: friends' upcoming schedules side-by-side with yours so you see who's on/off.
- Sharing flow:
  - "**Send my calendar**" button on Calendar with options: **Entire year**, **This month**, or **Pick dates**, and which categories to include (Work / Vacation / Events / Appointments / All).
  - Recipient gets an in-app request → must **Accept** to view.
  - On accept, both users become friends automatically (already in your `share_schedule_with` RPC — extend to require acceptance).
  - Owner can **Revoke** access or **Block** a viewer (already supported; surface in Compare).
- New **Invite** tab inside Compare: "Invite colleague" via shareable link / SMS / email (uses native share sheet on iOS).

Schema changes:
- New `share_requests` table (owner, viewer, scope_type, start_date, end_date, categories[], status).
- Update `share_schedule_with` to create a pending request instead of immediate access.

## Phase 4 — Direct Messages

- New `/messages` route + `messages` and `conversations` tables.
- 1:1 DMs between friends only (enforced by RLS).
- Realtime via Supabase Realtime; unread badge on BottomNav.
- Tap a friend in Compare → "Message".

## Phase 5 — Wallet (Cash App / Venmo style)

- Bring back a **Wallet** tab (not called FlowPay) with:
  - Balance, Add money, Send, Request, History.
  - **Send to friend** uses the existing `send_money` RPC.
  - **Request money** uses the existing `payment_requests` table.
  - Fee model: up to **3%** on sends (configurable; default 0% friends, 3% if flagged).
- Real bank/card top-ups require Stripe — flagged here but **deferred** until you confirm you want to do the Stripe setup again. Until then the wallet is closed-loop (money only moves between users in-app).

## Phase 6 — Onboarding

3-step first-run flow after signup:
1. Pick **profession** (or add a new one — already supported).
2. Pick **workplace** (or add).
3. Set **hourly rate** + optional avatar.
Then land on Calendar.

## Phase 7 — App Store packaging (Lovable → Codemagic → App Store)

- Add **Capacitor** with `@capacitor/ios`, configure `capacitor.config.ts` with your bundle id, app name, splash, and icon.
- Add `safe-area-inset` padding to top bar + BottomNav.
- Generate icons + splash from your logo (1024×1024 source).
- I'll produce a short README with the exact Codemagic workflow YAML (clone → npm install → vite build → cap sync ios → xcode-build → upload to App Store Connect).
- You'll handle: Apple Developer account ($99/yr), App Store Connect listing (screenshots, privacy policy URL, app description), and signing certs in Codemagic.

---

## Technical details

- All schema changes go through migrations (share_requests, conversations, messages, custom_categories).
- RLS on every new table; messages restricted to participants; share_requests restricted to owner + viewer.
- Realtime publication added for `messages`.
- Back-button uses TanStack Router's `useRouter().history.back()`.
- Capacitor build target: iOS 15+.

## What I'll do first if you approve

Phase 1 + Phase 2 in one pass (cleanup + calendar tabs reorder + add-tab + top app bar with back button). That alone makes the app feel dramatically more polished and is a clean stopping point if you want to test before going further.

## Open questions before I start

1. **Wallet for v1 App Store**: closed-loop (in-app only, no real bank top-ups) is fine for launch — confirm or say "skip wallet entirely for v1".
2. **DMs**: text-only OK, or do you also want photo attachments?
3. **App name & bundle id** for Capacitor (e.g. `com.yourname.workflow`).
