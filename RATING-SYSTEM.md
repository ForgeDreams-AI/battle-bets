# Battle Bets — The Bet Rating System (one-pager)

## 0. The money model (refined)
Every challenge = **two separate bets**, not one split bet:
- **Leg 1 — the house bet (80%):** each battler's 80% is a *standard bet vs the house at the real odds* for the side they took. The two legs grade independently: win → paid at odds (stake + winnings); lose → house keeps the stake; push → stake returned.
- **Leg 2 — the challenge pot (20%):** both battlers' 20% shares go into one head-to-head pot. Whoever's side hits takes the whole pot. Push → each gets their 20% back. **The house takes 0% of the pot.**
- **No-challenge mode:** the full stake is a normal house bet at odds — no split at all.
- **Example** ($5 each, over/under @ -110, over hits): A's $4 wins → $7.64 payout; B's $4 loses → house keeps $4; A takes the $2 pot. A nets +$4.64, B loses $5, house nets the standard vig (~$0.36).
- **House edge ≈ normal vig (~4.5% at -110) on the 80% legs, 0% on the player-vs-player pot.** In challenge mode the house carries almost no outcome risk — it's an exchange with a built-in margin, not a book taking positions.

## 1. The Bet Slip Standard
Every bet is a structured, immutable record. Once created, the core terms can never be edited:
- **ID, creator, taker** (taker fills in when a challenge is accepted)
- **Event**: league, teams, start time
- **Market**: spread / total (over-under) / moneyline
- **Locked line**: the exact line the bet was placed at — shown on the slip forever
- **Odds per leg**: creator's American odds + taker's American odds (opposite side), locked at creation
- **Side per party**: who took which side
- **Stake + the two legs**: e.g. $5 challenge = leg 1: $4 house bet @ -110 + leg 2: $1 challenge pot
- **Data source** for the line (ESPN / The Odds API / demo)
- **Status**: open → matched → live → graded → settled (or disputed / void)
- **Timestamps** for every transition

## 2. The Grading Engine (automatic, from real scores)
- At the final whistle, the app pulls the **final score from ESPN** and grades every open bet on that game. No human enters a score; no one can fudge a result.
- **The two house legs grade independently** at their locked odds: win → payout = stake + winnings at the locked American odds; loss → house keeps the stake; push → stake returned.
- **The challenge pot grades separately** on the same outcome: the side that hit takes the whole pot; push → each battler's 20% returned.
- **Void** (postponed/cancelled, or no result 26 hours after start): all stakes returned in full.
- Every grade writes an **immutable audit entry**: what the score was, which source reported it, each leg's result and payout, and which rule fired. The audit log cannot be edited or deleted — not even by the admin.

## 3. Line Score (was the line fair?)
- Each slip stores the **consensus line at creation** next to the locked line.
- If you set a custom line for a friendly challenge, the slip shows a **line score**: how many points of value the locked line gives each side vs consensus (e.g. "+3.5 pts favors you").
- If the real market line **moves significantly** before your friend accepts (1.5+ pts on spreads, 2+ on totals), they get a "LINE MOVED" warning before they lock in. No one gets ambushed by a stale line.

## 4. Bettor Score (trust rating)
- Built from **settled real-stake battles only**. Practice/demo games don't count, so it can't be farmed.
- New battlers show **"Unrated"** until they've settled **5 battles**.
- Formula: `1000 + 400×(win rate − 50%) + 10×battles (capped at 50) − 75 per lost dispute + 25×win streak (capped at 4)`, clamped 100–2000, decaying 2% per 30 idle days.
- Tiers: Elite (1400+) · Sharp (1200+) · Solid (1000+) · Casual (800+) · Cold (below 800).
- The leaderboard ranks battlers by this score — it's a reputation you earn, not a number you buy.

## 5. Disputes (24-hour window)
- After grading, either side has **24 hours** to dispute with a reason + evidence.
- Anthony (admin) decides: uphold the grade, or overturn to win / loss / push / void.
- Overturns **reverse the original settlement** with offsetting ledger entries (the history is never deleted) and re-settle correctly.
- **Losing a dispute costs 75 rating points** — filing a bogus dispute hurts more than losing a bet.

## 6. The Money Ledger (demo credits today, real money later)
- Every credit movement — stake, house-bet payout, pot win, pot refund, house take, grant, reversal — is a ledger entry with a running balance. Entry types distinguish the legs: `housebet_payout`, `housebet_refund_push`, `pot_win`, `pot_refund_push`.
- The books always balance: **all user balances + house balance = credits ever issued**. The admin panel checks this live and now breaks house P&L down by leg type (legs staked vs legs paid vs pots paid out).
- v1 runs on **demo credits** ($100 free on signup). The ledger is built exactly like a real-money ledger, so a payment processor plugs into the same entries later. Real money needs gambling licensing — that's deliberately v2.
