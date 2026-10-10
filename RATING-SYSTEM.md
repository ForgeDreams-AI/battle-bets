# Battle Bets — The Bet Rating System (one-pager)

## 1. The Bet Slip Standard
Every bet is a structured, immutable record. Once created, the core terms can never be edited:
- **ID, creator, taker** (taker fills in when a challenge is accepted)
- **Event**: league, teams, start time
- **Market**: spread / total (over-under) / moneyline
- **Locked line**: the exact line the bet was placed at — shown on the slip forever
- **Side per party**: who took which side
- **Stake + 80/20 split**: e.g. $5 = $4 the bet + $1 the pot
- **Data source** for the line (ESPN / The Odds API / demo)
- **Status**: open → matched → live → graded → settled (or disputed / void)
- **Timestamps** for every transition

## 2. The Grading Engine (automatic, from real scores)
- At the final whistle, the app pulls the **final score from ESPN** and grades every open bet on that game. No human enters a score; no one can fudge a result.
- **Push** (e.g. total lands exactly on the line): both stakes returned in full.
- **Void** (postponed/cancelled, or no result 26 hours after start): both stakes returned in full.
- Every grade writes an **immutable audit entry**: what the score was, which source reported it, and which rule fired. The audit log cannot be edited or deleted — not even by the admin.

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
- Every credit movement — stake, payout, pot win, house take, refund, grant, reversal — is a ledger entry with a running balance.
- The books always balance: **all user balances + house balance = credits ever issued**. The admin panel checks this live.
- v1 runs on **demo credits** ($100 free on signup). The ledger is built exactly like a real-money ledger, so a payment processor plugs into the same entries later. Real money needs gambling licensing — that's deliberately v2.
