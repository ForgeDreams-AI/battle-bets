/* Battle Bets — money-math test for the REFINED model.
   Every challenge = TWO independent house bets (at real odds) + ONE
   winner-take-all challenge pot. No-challenge = full stake vs house.
   Loads the REAL engine from index.html with browser stubs and asserts:
   exact balances, house P&L, and the ledger invariant
   (sum(user balances) + houseBalance == credits ever issued). */
const fs = require('fs');
const html = fs.readFileSync('/home/hatch/workspace/battle-bets/index.html', 'utf8');
const src = html.match(/<script>([\s\S]*)<\/script>/)[1];

// ---- browser stubs ----
const mem = {};
global.localStorage = { getItem:k=>mem[k]??null, setItem:(k,v)=>mem[k]=String(v), removeItem:k=>delete mem[k] };
global.sessionStorage = { getItem:k=>mem['s_'+k]??null, setItem:(k,v)=>mem['s_'+k]=String(v), removeItem:k=>delete mem['s_'+k] };
const elStub = () => ({ innerHTML:'', value:'', classList:{add(){},remove(){},toggle(){}},
  querySelector:()=>elStub(), querySelectorAll:()=>[], appendChild(){}, select(){}, focus(){},
  addEventListener(){}, onclick:null, oninput:null, dataset:{}, style:{} });
global.document = { querySelector:()=>elStub(), querySelectorAll:()=>[], createElement:()=>elStub(), execCommand:()=>{} };
global.location = { hash:'#/', origin:'', pathname:'/' };
global.window = { scrollTo(){}, addEventListener(){} };
global.navigator = {};
global.alert = ()=>{};
global.fetch = ()=>Promise.reject(new Error('no net in test'));
global.btoa = s=>Buffer.from(s).toString('base64');
global.atob = s=>Buffer.from(s,'base64').toString();
const _st = global.setTimeout, _si = global.setInterval;
global.setTimeout = ()=>0; global.setInterval = ()=>0;

eval(src + `\n;globalThis.__bb = { gradeSelection, createBet, acceptChallenge, settleBet, voidBet,
  fileDispute, resolveDispute, bettorScore, bettorStats, postLedger, uid, winnings, fmtOdds,
  get DB(){ return DB; } };`);
const { gradeSelection, createBet, acceptChallenge, settleBet, voidBet,
  fileDispute, resolveDispute, bettorScore, winnings } = globalThis.__bb;
const DB = globalThis.__bb.DB;
global.setTimeout = _st; global.setInterval = _si;

let pass=0, fail=0;
function eq(a,b,msg){ const ok = Math.abs(a-b)<0.005;
  if(ok){pass++;} else {fail++; console.log('FAIL:',msg,'expected',b,'got',a);} }
function checkInvariant(msg){
  const uSum = Object.values(DB.users).reduce((a,u)=>a+u.credits,0);
  const grants = DB.ledger.filter(e=>e.type==='grant').reduce((a,e)=>a+e.amount,0);
  eq(uSum + DB.houseBalance, grants, 'INVARIANT '+msg);
}
function mkUser(name, credits){
  const id = globalThis.__bb.uid('u');
  DB.users[id]={id,name,createdAt:new Date().toISOString(),credits:0,settledBets:[],disputesLost:0,winStreak:0,lastSettledAt:null};
  globalThis.__bb.postLedger(id,null,'grant',credits,'test grant');
  return id;
}
const EV = { eventId:'999', league:'nfl', homeAbbr:'KC', awayAbbr:'BUF', homeName:'Chiefs', awayName:'Bills',
  eventDate:new Date().toISOString() };

// ---------- unit: winnings() at American odds ----------
(function(){
  eq(winnings(4,-110),3.64,'winnings $4 @ -110');
  eq(winnings(4,130),5.20,'winnings $4 @ +130');
  eq(winnings(10,-110),9.09,'winnings $10 @ -110');
  eq(winnings(8,-110),7.27,'winnings $8 @ -110');
  eq(winnings(4,-150),2.67,'winnings $4 @ -150');
  eq(winnings(5,-110),4.55,'winnings $5 @ -110');
})();

// ---------- unit: grading ----------
(function(){
  const b={market:'spread',line:-7.5,selection:'home'};
  eq(gradeSelection(b,30,20)==='win'?1:0,1,'spread home cover win');
  eq(gradeSelection({...b,selection:'away'},30,20)==='loss'?1:0,1,'spread away loss');
  eq(gradeSelection({market:'spread',line:-3,selection:'home'},24,21)==='push'?1:0,1,'spread push');
  eq(gradeSelection({market:'total',line:47.5,selection:'over'},30,20)==='win'?1:0,1,'total over win');
  eq(gradeSelection({market:'total',line:50,selection:'under'},30,20)==='push'?1:0,1,'total push');
  eq(gradeSelection({market:'moneyline',selection:'away'},30,31)==='win'?1:0,1,'ML away win');
})();

// ---------- scenario A: Anthony's exact example ----------
// Alice & Bob stake $5 each on over/under @ -110. Over hits (30-20=50 > 47.5).
// Alice: $4 leg wins → $7.64; takes $2 pot. Bob: $4 leg loses → house keeps $4.
// Alice 100-5+7.64+2 = 104.64. Bob 95. House -3.64+4 = +0.36 (the vig).
(function(){
  const a=mkUser('Alice',100), b=mkUser('Bob',100);
  const hBefore=DB.houseBalance;
  localStorage.setItem('bb_me',a);
  const bet=createBet({...EV,mode:'challenge',market:'total',selection:'over',line:47.5,odds:-110,oppOdds:-110,consensusLine:47.5,lineSource:'espn',stake:5});
  localStorage.setItem('bb_me',b); acceptChallenge(bet.id);
  settleBet(bet,30,20,'ESPN final');
  eq(DB.users[a].credits,104.64,'A: Alice nets +4.64');
  eq(DB.users[b].credits,95,'A: Bob loses $5');
  eq(DB.houseBalance-(hBefore),0.36,'A: house nets the vig +0.36');
  eq(bet._legs.creator.payout,7.64,'A: creator leg payout $7.64');
  eq(bet._legs.taker.payout,0,'A: taker leg payout $0');
  eq(bet._potPaid,2,'A: pot paid $2');
  checkInvariant('A');
})();

// ---------- scenario B: house bet WIN $10 @ -110 ----------
// payout 10+9.09 = 19.09 → 109.09. House -9.09.
(function(){
  const a=mkUser('Cid',100);
  const hBefore=DB.houseBalance;
  localStorage.setItem('bb_me',a);
  const bet=createBet({...EV,mode:'house',market:'spread',selection:'home',line:-7.5,odds:-110,consensusLine:-7.5,lineSource:'espn',stake:10});
  settleBet(bet,30,20,'ESPN final');
  eq(DB.users[a].credits,109.09,'B: Cid 100-10+19.09');
  eq(DB.houseBalance-hBefore,-9.09,'B: house -9.09');
  eq(bet.wager,10,'B: full stake is the house bet (no split)');
  checkInvariant('B');
})();

// ---------- scenario C: house bet LOSS $25 ML @ +130 ----------
// user 75; house +25.
(function(){
  const a=mkUser('Dan',100);
  const hBefore=DB.houseBalance;
  localStorage.setItem('bb_me',a);
  const bet=createBet({...EV,mode:'house',market:'moneyline',selection:'away',line:130,odds:130,lineSource:'espn',stake:25});
  settleBet(bet,30,20,'ESPN final'); // home wins → away loses
  eq(DB.users[a].credits,75,'C: Dan 100-25');
  eq(DB.houseBalance-hBefore,25,'C: house +25');
  checkInvariant('C');
})();

// ---------- scenario D: challenge PUSH → full refunds ----------
// total = 50 = line → both legs push, pot shares refunded. Everyone 100.
(function(){
  const a=mkUser('Eve',100), b=mkUser('Fred',100);
  const hBefore=DB.houseBalance;
  localStorage.setItem('bb_me',a);
  const bet=createBet({...EV,mode:'challenge',market:'total',selection:'over',line:50,odds:-110,oppOdds:-110,consensusLine:50,lineSource:'espn',stake:5});
  localStorage.setItem('bb_me',b); acceptChallenge(bet.id);
  settleBet(bet,30,20,'ESPN final');
  eq(DB.users[a].credits,100,'D: Eve refunded');
  eq(DB.users[b].credits,100,'D: Fred refunded');
  eq(DB.houseBalance,hBefore,'D: house untouched');
  checkInvariant('D');
})();

// ---------- scenario E: VOID (postponed) ----------
(function(){
  const a=mkUser('Gus',100);
  const hBefore=DB.houseBalance;
  localStorage.setItem('bb_me',a);
  const bet=createBet({...EV,mode:'house',market:'spread',selection:'home',line:-3,odds:-110,consensusLine:-3,lineSource:'espn',stake:10});
  voidBet(bet,'Event postponed');
  eq(DB.users[a].credits,100,'E: Gus refunded');
  eq(DB.houseBalance,hBefore,'E: house untouched');
  checkInvariant('E');
})();

// ---------- scenario F: dispute overturn reverses cleanly (new model) ----------
// Hank (creator, home -7.5 @ -110) vs Ida, $10 challenge. Hank wins:
// leg: 8+7.27=15.27; Ida leg loses → house +8; pot $4 → Hank.
// Hank 100-10+15.27+4 = 109.27; Ida 90. Overturn → Ida 109.27, Hank 90. House net unchanged.
(function(){
  const a=mkUser('Hank',100), b=mkUser('Ida',100);
  localStorage.setItem('bb_me',a);
  const bet=createBet({...EV,mode:'challenge',market:'spread',selection:'home',line:-7.5,odds:-110,oppOdds:-110,consensusLine:-7.5,lineSource:'espn',stake:10});
  localStorage.setItem('bb_me',b); acceptChallenge(bet.id);
  settleBet(bet,30,20,'ESPN final');
  eq(DB.users[a].credits,109.27,'F1: Hank 109.27');
  eq(DB.users[b].credits,90,'F1: Ida 90');
  const hBefore=DB.houseBalance;
  localStorage.setItem('bb_me',b);
  const d=fileDispute(bet.id,'Score was wrong','Official scoring change: 27-20');
  resolveDispute(d.id,'overturn_loss','scoring change confirmed');
  eq(DB.users[b].credits,109.27,'F2: Ida now 109.27 after overturn');
  eq(DB.users[a].credits,90,'F2: Hank now 90 after overturn');
  eq(DB.houseBalance,hBefore,'F2: house net unchanged by overturn');
  eq(DB.users[a].disputesLost,1,'F2: Hank dinged for lost dispute');
  checkInvariant('F');
})();

// ---------- scenario G: expired unmatched challenge -> void ----------
(function(){
  const a=mkUser('Jay',100);
  localStorage.setItem('bb_me',a);
  const bet=createBet({...EV,mode:'challenge',market:'moneyline',selection:'home',line:-150,odds:-150,oppOdds:130,consensusLine:null,lineSource:'espn',stake:5});
  voidBet(bet,'Challenge expired unmatched.');
  eq(DB.users[a].credits,100,'G: Jay refunded');
  checkInvariant('G');
})();

// ---------- scenario H: moneyline challenge, asymmetric odds ----------
// Ken (home @ -150) vs Leo (away @ +130), $5. Home wins 30-20.
// Ken leg: 4+2.67=6.67; Leo leg loses → house +4; pot $2 → Ken.
// Ken 100-5+6.67+2 = 103.67; Leo 95; house -2.67+4 = +1.33.
(function(){
  const a=mkUser('Ken',100), b=mkUser('Leo',100);
  const hBefore=DB.houseBalance;
  localStorage.setItem('bb_me',a);
  const bet=createBet({...EV,mode:'challenge',market:'moneyline',selection:'home',line:-150,odds:-150,oppOdds:130,consensusLine:null,lineSource:'espn',stake:5});
  eq(bet.takerOdds,null,'H: takerOdds null before accept');
  localStorage.setItem('bb_me',b); acceptChallenge(bet.id);
  eq(bet.takerOdds,130,'H: takerOdds = oppOdds after accept');
  settleBet(bet,30,20,'ESPN final');
  eq(DB.users[a].credits,103.67,'H: Ken 103.67');
  eq(DB.users[b].credits,95,'H: Leo 95');
  eq(DB.houseBalance-hBefore,1.33,'H: house +1.33');
  eq(bet._legs.creator.payout,6.67,'H: creator leg payout 6.67');
  checkInvariant('H');
})();

// ---------- scenario I: house-mode push refunds full stake ----------
(function(){
  const a=mkUser('Mia',100);
  const hBefore=DB.houseBalance;
  localStorage.setItem('bb_me',a);
  const bet=createBet({...EV,mode:'house',market:'total',selection:'over',line:50,odds:-110,consensusLine:50,lineSource:'espn',stake:10});
  settleBet(bet,30,20,'ESPN final'); // total 50 = push
  eq(DB.users[a].credits,100,'I: Mia refunded in full');
  eq(DB.houseBalance,hBefore,'I: house untouched');
  checkInvariant('I');
})();

// ---------- ratings sanity ----------
(function(){
  const u=DB.users[Object.keys(DB.users)[0]];
  const s=bettorScore(u.id);
  console.log('sample bettorScore:', JSON.stringify(s));
})();

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
