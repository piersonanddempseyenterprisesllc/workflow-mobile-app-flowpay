
# Plan: Make Workflow effortless, expensive, and actually work

Three streams, shipped together: **FlowPay (real money)**, **Ombre theme system**, **Navigation overhaul**.

---

## 1. FlowPay — make it actually work

Good news: the database is already set up (`wallets`, `wallet_topups`, `transactions`, `payment_requests`, `send_money`, `approve_payment_request`, `credit_wallet_from_topup`), Stripe sandbox is connected, and the webhook route exists. Missing pieces:

- **Webhook → wallet credit**: extend `src/routes/api/public/payments/webhook.ts` to handle `checkout.session.completed` for `kind: "wallet_topup"` and call the existing `credit_wallet_from_topup` RPC. Today the webhook only handles subscriptions, so top-ups never credit.
- **Top-up UI**: polish `wallet.tsx` so "Add money" opens a sheet with quick amounts ($10 / $25 / $50 / $100 / custom) → embedded Stripe Checkout → returns to `/wallet/return` and auto-refreshes balance.
- **Send / Request flows**: friend picker (existing `friends` table) + amount + note. Wire to `send_money` RPC and `payment_requests` insert.
- **Activity feed**: unified list of transactions + topups + requests, with status pills.
- **Test-mode banner**: keep at the top of `/wallet`.

When all green, FlowPay actually moves real money (sandbox now, live after Stripe go-live).

## 2. Ombre theme system — pick your gradient

Six curated presets, applied app-wide (background, primary, buttons, FAB, cards, wordmark, BottomNav active state):

1. **Canva Lux** — Purple → Magenta → Pink *(default)*
2. **Midnight Indigo** — Indigo → Violet
3. **Sunset** — Coral → Magenta → Amber
4. **Ocean** — Blue → Teal → Mint
5. **Rose Gold** — Rose → Champagne
6. **Noir Gold** — Black → Charcoal → Gold

How it works:
- Each preset is a set of CSS variables (`--gradient-brand`, `--primary`, `--accent`, surfaces) under `[data-theme="canva-lux"]`, `[data-theme="midnight"]`, etc.
- A `ThemeProvider` reads `user_calendar_prefs.theme_id` (column already exists) and sets `data-theme` on `<html>`. No new table.
- **Theme picker** in Profile → "Appearance": 6 gradient cards, tap to apply, persists to `user_calendar_prefs`.
- Everything currently hardcoded (BottomNav FAB, auth ambient blurs, wordmark) switches to `var(--gradient-brand)`.

## 3. Navigation — easy for any professional

- **First-run onboarding**: 3-slide intro on first login — "Track shifts", "Get paid with FlowPay", "Share with coworkers". Dismissal stored in `user_calendar_prefs`.
- **Long-press FAB**: tap `+` = Add Shift (today); long-press opens quick actions (Add Shift, Send Money, Request Money, Find Coworker).
- **Clearer labels**: `Schedule`, `Pay`, `Me`. Active-tab gradient underline.
- **Real Home** (`/_authed/home`): "Next shift", "Wallet balance", "Today's earnings" cards so anyone gets it instantly.
- **Friendly empty states** on every list with a one-tap primary action.

---

## Technical details

**Migration**: none — `user_calendar_prefs.theme_id` already exists; `wallet_topups` already supports the flow.

**New files**:
- `src/lib/theme-context.tsx`, `src/lib/themes.ts`, `src/components/ThemePicker.tsx`
- `src/components/Onboarding.tsx`
- `src/components/wallet/{TopupSheet,SendMoneySheet,RequestMoneySheet,ActivityList}.tsx`
- `src/routes/_authed/home.tsx`
- `src/lib/wallet.functions.ts` (wraps `send_money` / `approve_payment_request` RPCs)

**Edits**:
- `src/styles.css` — 6 `[data-theme]` blocks + `--gradient-brand`
- `src/routes/api/public/payments/webhook.ts` — handle wallet top-up sessions
- `src/routes/_authed/wallet.tsx` — rebuild
- `src/components/BottomNav.tsx` — relabel, long-press menu, gradient driven by theme
- `src/routes/_authed/profile.tsx` — Appearance section
- `src/routes/_authed/route.tsx` — mount ThemeProvider + Onboarding gate
- `src/routes/auth.tsx` — ambient blurs use theme gradient

**Stripe**: sandbox works now. For real cards after publish, you'll need to complete Stripe go-live — I'll surface that in the Wallet UI if production keys aren't set.

---

## Out of scope (ask if you want these)

- Custom two-color picker (you picked presets-only)
- Bank payouts (Stripe Connect)
- Push notifications for payment requests
- KYC for high-volume live payments

Approve to build, or tell me what to drop/add.
