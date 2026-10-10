/* Battle Bets v1 — money-math test. Loads the REAL engine from index.html
   with browser stubs, runs win/loss/push/void/dispute scenarios and
   asserts the ledger invariant: sum(user balances) + house == issued. */
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

eval(src + `
;globalThis.__bb = { gradeSelection, createBet, acceptChallenge, settleBet, voidBet,
  fileDispute, resolveDispute, bettorScore, bettorStats, postLedger, uid,
  get DB(){ return DB; } };`);
const { gradeSelection, createBet, acceptChallenge, settleBet, voidBet,
  fileDispute, resolveDispute, bettorScore, bettorStats, postLedger, uid } = globalThis.__bb;
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
  const id = uid('u');
  DB.users[id]={id,name,createdAt:new Date().toISOString(),credits:0,settledBets:[],disputesLost:0,winStreak:0,lastSettledAt:null};
  postLedger(id,null,'grant',credits,'test grant');
  return id;
}
const EV = { eventId:'999', league:'nfl', homeAbbr:'KC', awayAbbr:'BUF', homeName:'Chiefs', awayName:'Bills',
  eventDate:new Date().toISOString() };

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
// Alice & Bob stake $5 each on over/under. Alice (over) wins: total 30-20=50 > 47.5
(function(){
  const a=mkUser('Alice',100), b=mkUser('Bob',100);
  localStorage.setItem('bb_me',a);
  const bet=createBet({...EV,mode:'challenge',market:'total',selection:'over',line:47.5,consensusLine:47.5,lineSource:'espn',stake:5});
  localStorage.setItem('bb_me',b); acceptChallenge(bet.id);
  settleBet(bet,30,20,'ESPN final'); // Alice over wins
  eq(DB.users[a].credits,101,'A: Alice $100-$5+$4+$2 = $101');
  eq(DB.users[b].credits,95,'A: Bob $100-$5 = $95');
  eq(DB.houseBalance,4,'A: house keeps loser wager $4');
  checkInvariant('A');
})();

// ---------- scenario B: house bet WIN $10 on spread ----------
(function(){
  const a=mkUser('Cid',100);
  localStorage.setItem('bb_me',a);
  const bet=createBet({...EV,mode:'house',market:'spread',selection:'home',line:-7.5,consensusLine:-7.5,lineSource:'espn',stake:10});
  settleBet(bet,30,20,'ESPN final'); // KC -7.5 covers
  eq(DB.users[a].credits,108,'B: $100-$10+$16+$2 = $108');
  eq(DB.houseBalance,4-8,'B: house 4-8 = -4');
  checkInvariant('B');
})();

// ---------- scenario C: house bet LOSS $25 on moneyline ----------
(function(){
  const a=mkUser('Dan',100);
  localStorage.setItem('bb_me',a);
  const bet=createBet({...EV,mode:'house',market:'moneyline',selection:'away',line:130,consensusLine:null,lineSource:'espn',stake:25});
  settleBet(bet,30,20,'ESPN final'); // home wins, away loses
  eq(DB.users[a].credits,75,'C: $100-$25 = $75');
  eq(DB.houseBalance,-4+25,'C: house -4+25 = 21');
  checkInvariant('C');
})();

// ---------- scenario D: challenge PUSH -> full refunds ----------
(function(){
  const a=mkUser('Eve',100), b=mkUser('Fred',100);
  localStorage.setItem('bb_me',a);
  const bet=createBet({...EV,mode:'challenge',market:'total',selection:'over',line:50,consensusLine:50,lineSource:'espn',stake:5});
  localStorage.setItem('bb_me',b); acceptChallenge(bet.id);
  const hBefore=DB.houseBalance;
  settleBet(bet,30,20,'ESPN final'); // total = 50 = push
  eq(DB.users[a].credits,100,'D: Eve refunded');
  eq(DB.users[b].credits,100,'D: Fred refunded');
  eq(DB.houseBalance,hBefore,'D: house untouched');
  checkInvariant('D');
})();

// ---------- scenario E: VOID (postponed) ----------
(function(){
  const a=mkUser('Gus',100);
  localStorage.setItem('bb_me',a);
  const hBefore=DB.houseBalance;
  const bet=createBet({...EV,mode:'house',market:'spread',selection:'home',line:-3,consensusLine:-3,lineSource:'espn',stake:10});
  voidBet(bet,'Event postponed');
  eq(DB.users[a].credits,100,'E: Gus refunded');
  eq(DB.houseBalance,hBefore,'E: house untouched');
  checkInvariant('E');
})();

// ---------- scenario F: dispute overturn reverses cleanly ----------
// Hank (creator, home -7.5) beats Ida; Ida disputes with evidence; admin overturns -> taker wins.
(function(){
  const a=mkUser('Hank',100), b=mkUser('Ida',100);
  localStorage.setItem('bb_me',a);
  const bet=createBet({...EV,mode:'challenge',market:'spread',selection:'home',line:-7.5,consensusLine:-7.5,lineSource:'espn',stake:10});
  localStorage.setItem('bb_me',b); acceptChallenge(bet.id);
  settleBet(bet,30,20,'ESPN final'); // Hank wins: +8 wager back +4 pot
  eq(DB.users[a].credits,102,'F1: Hank 100-10+8+4=102');
  eq(DB.users[b].credits,90,'F1: Ida 100-10=90');
  const hBefore=DB.houseBalance;
  // Ida files dispute within window
  localStorage.setItem('bb_me',b);
  const d=fileDispute(bet.id,'Score was wrong','Official scoring change: 27-20');
  // admin overturns -> taker (Ida) wins
  resolveDispute(d.id,'overturn_loss','scoring change confirmed');
  eq(DB.users[b].credits,102,'F2: Ida now 102 after overturn');
  eq(DB.users[a].credits,90,'F2: Hank now 90 after overturn');
  eq(DB.houseBalance,hBefore,'F2: house net unchanged by overturn');
  eq(DB.users[a].disputesLost,1,'F2: Hank dinged for lost dispute');
  checkInvariant('F');
})();

// ---------- scenario G: expired unmatched challenge -> void ----------
(function(){
  const a=mkUser('Jay',100);
  localStorage.setItem('bb_me',a);
  const bet=createBet({...EV,mode:'challenge',market:'moneyline',selection:'home',line:-150,consensusLine:null,lineSource:'espn',stake:5});
  voidBet(bet,'Challenge expired unmatched.');
  eq(DB.users[a].credits,100,'G: Jay refunded');
  checkInvariant('G');
})();

// ---------- ratings sanity ----------
(function(){
  const u=DB.users[Object.keys(DB.users)[0]];
  const s=bettorScore(u.id);
  console.log('sample bettorScore:', JSON.stringify(s));
})();

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
