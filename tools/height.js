// R89 — HOW TALL IS THIS SCREEN AFTER A HUNDRED AND EIGHTY DAYS?
//
// Every height this project has quoted at scale — R44's 10,470 px for nine
// chimeras, R46's Ranch, R89's own 12,554 — was measured by hand, once, and
// then went stale while the screen kept growing. The Pens card has gained a
// stance row, a tier chip, a "why" and a "lever" since that number was
// written, and nothing noticed: measured here at 380 px on the day-180 save,
// it is 16,657 px for NINE chimeras, worse than the audit's figure for ten.
//
// So the budget is a gate rather than a note. It runs the same seeded
// 180-day walk the balance harness runs, opens the game on the save that
// walk ends with, and measures.
//
// TALLEST REACHABLE, NOT "EXPANDED". "Expanded" stops being a well-defined
// number the moment a screen only lets one card open at a time — which is
// exactly the fix R89 proposes, so a gate written against "expanded" would
// have to be rewritten by the change it exists to verify. Instead: open each
// fold in turn and keep the largest height seen. That is the honest question
// either way — how tall can a player make this screen — and it is stable
// across both designs.
import { mkdtemp, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { sleep, serve, findChrome, connect } from './cdp.js';
import { walkedSave } from './fixtures.js';
// R159 — the verdict decision, in its own file so both of its branches can
// be unit-tested without a browser. See the note at the top of settling.js.
import { foldVerdict } from './settling.js';
// R150 — the agenda's own row list, so the rule can reach the rows R143's
// three-row cap keeps off the screen. Node-side only; the page is untouched.
import { agenda as agendaRows } from '../ranch/agenda.js';
import { loadSimContent } from './sim.js';
// R154 — `penMaxCapacity`, for the Pens budgets below. Same tuning
// `tools/vault.js` already reads to bound the herd.
import { TUNING } from '../ranch/ranch.js';

const VIEWPORT = 380;
const REPORT = process.argv.includes('--report');

// The two the milestone promises, and a ratchet on everything else so a
// screen R89 does not touch cannot quietly grow into the space R89 frees.
// Ratchets sit just above today's measurement — the R81/R121 rule: a ceiling
// resting on the number means creep fails rather than accumulating.
// R92 — how many rows the Vault can ever hold, read from the Extractor
// track's top grant rather than typed. The screen lists one line per part
// and one per vial, so this is the shape of the tallest Vault a save can
// reach (R61: derive the number, never re-type it).
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const FACILITY = JSON.parse(readFileSync(join(root, 'data', 'facility.json'), 'utf8'));
const VAULT_CAP = FACILITY
  .tracks.find((t) => t.id === 'extractor').levels
  .reduce((m, l) => ({
    parts: Math.max(m.parts, l.grants.vaultParts ?? 0),
    vials: Math.max(m.vials, l.grants.vaultVials ?? 0),
  }), { parts: 0, vials: 0 });
const VAULT_ROWS = VAULT_CAP.parts + VAULT_CAP.vials;

// R154 — AND HOW MANY CHIMERAS THE PENS CAN EVER HOLD, for the same reason
// and out of the same file. The Theater's top grant plus a stall for every
// `pensPerStall` pens past the paddock you start with: the whole stable a
// save can buy. `tools/vault.js` derives its `chimeras` bound from exactly
// this arithmetic — if the two ever disagree, one of them is typed.
const STABLE_CAP = FACILITY.tracks.find((t) => t.id === 'theater').levels
    .reduce((n, l) => Math.max(n, l.grants?.stable ?? 0), 0)
  + Math.floor((TUNING.penMaxCapacity - (FACILITY.stalls?.freePens ?? 0))
               / (FACILITY.stalls?.pensPerStall || Infinity));

// What one folded pen card costs, and what the screen costs before the first
// one. MEASURED ON TWO TREES rather than fitted to one: the same day-180 walk
// with `pensPerStall` off (stable 12, roster 11) and on (stable 16, roster 16)
// — 1,494px/242 words at eleven cards, 1,923px/318 words at sixteen. That is
// 85.8px and 15.2 words a card, 550px and 74.8 words of chrome, on both. The
// numbers below round each up, so the budgets carry ~4% the way R141 left it
// on `dex:combos` and R152 on the Vault's shelf.
//
// The open card is a FLAT allowance, not a per-card one: the Pens keep one
// card open at a time (R89's exclusive folds), and that card measured 723px
// and 749px, 86 words and 86 words, across a roster that changed by five.
const PEN_CARD = { px: 90, words: 16 };
const PEN_CHROME = { px: 560, words: 78 };
const PEN_OPEN_WORDS = 90;

const BUDGET = {
  // R91 RE-RATCHETS: 12500 -> 12700, measured at 12623. Not a regression in
  // the card — the walk simply keeps SEVENTEEN animals now where it kept
  // sixteen, and this screen is one card per animal at ~742px each. Capping
  // the vault changed what a campaign does with its pens, so the number
  // moved by exactly one animal. The Ranch is still one card per animal and
  // still 16 phone screens; that is R46's shape and nobody has fixed it.
  //
  // R95 RE-RATCHETS AGAIN, AND THIS TIME BOTH HALVES: 3400 -> 3650 shut,
  // measured at 3572, and 12700 -> 14800 open, measured at 14537. Same cause
  // as R91's and larger: a campaign that is still collecting keeps TWENTY
  // animals where it kept seventeen, because a pen for a species you have
  // never held is worth buying and the Dex is not finished until day 180.
  // Three more animals is three more cards open and three more folded rows
  // shut, which is exactly the arithmetic above and nothing else.
  //
  // The shut number is the one that should worry somebody: 3,572px is 4.6
  // phone screens before the player opens anything, and it grows with the
  // herd because the folded card is per-animal. That is R46's shape, it has
  // been the tallest screen in the game since R89 measured it, and paginating
  // the Ranch is the fix nobody has written. Ratcheting is not fixing it —
  // it is refusing to let it creep any further while it waits.
  //
  // R128 COLLECTS WHAT R98 EARNED: 14800 -> 4450 open, measured at 4264.
  // R98 gave this screen the Pens' one-at-a-time rule and never brought the
  // ceiling down behind it — twenty animals that could all be open at once
  // became twenty that cannot, and 10,536px of budget went on standing
  // there permitting a screen the code no longer builds. A ceiling nothing
  // can reach is not a ratchet; it is a number waiting to excuse the next
  // regression. The shut half is untouched at 3,650 (measured 3,485) and is
  // still the one that should worry somebody: pagination is still unwritten.
  // R131 SETS THE CEILING RATHER THAN FOLLOWING IT: 3650 -> 2500 shut,
  // measured at 2,453 with a page of eight. Every ratchet above is the same
  // admission — the folded row is per ANIMAL, so the screen is a
  // multiplication and folding only divided the constant. 3,269px at four,
  // 7,438 at twelve, 11,607 at twenty before R98; 3,499 at twenty after it.
  //
  // THE NUMBER IS NOW ARITHMETIC ANYBODY CAN CHECK, which is the point:
  // 1,756px of Ranch chrome (the Path, Right Now, the facility card, the
  // Breeding Pen, the Incubator) plus eight rows at 87px. It does not move
  // when the herd grows, and the only things that can move it are a taller
  // row or a bigger page — both deliberate, both visible in a diff.
  //
  // I set this to 1,950 before measuring the chrome and it was a guess: the
  // chrome alone is 2.3 phone screens, so no page size could have met it.
  // The chrome is R47's territory and has not been re-measured since; that
  // is the next thing worth doing to this screen, not a smaller page.
  // R130 RE-RATES IT AGAINST A CLOCK THAT HOLDS STILL: 2500 -> 2450 shut,
  // measured at 2,368. R131 set 2,500 from a reading of 2,453 and the same
  // commit measured 2,540 the next day — see the PINNED_NOW note below.
  // Every number in this table was drifting with the calendar; they mean
  // something now, and this one is tightened to prove it.
  //
  // R133 ADDS THE CHROME NUMBER: how much of this screen the player gets
  // through before the first animal. A single total hides the trade — trim
  // two rows off the roster and a fatter agenda is paid for out of the
  // saving, with the gate none the wiser.
  //
  // I WROTE 900 FIRST, as a target, before doing the work, and it was a
  // guess: the measurement is 984 and the last 84px are not there to find.
  // Of that 984, the agenda is 697 and EVERYTHING else on the screen — the
  // money card, the facility, the Breeding Pen, the incubator line and the
  // gaps between them — is 287. The agenda is what the screen is for, so
  // the budget sits above the measurement like every other number in this
  // table rather than below it like a wish.
  //
  // The headroom is one open row, not slack: the agenda is 53px per thing
  // you can do right now and the fixture happens to have ten. A save with a
  // raid and a captive on the clock is legitimately taller.
  //
  // WHAT THE BATTERY CANNOT PROVE ABOUT THIS NUMBER, said out loud. Breaks
  // 204 and 205 grow the chrome and this rule fires — but so does the total
  // above them, so neither break shows the chrome budget doing anything the
  // total was not already doing. The case it exists for is a TRADE: a
  // milestone that shortens the roster and spends the saving on a taller
  // agenda, where the total never moves and only this number notices. That
  // is a two-place change and a break is one anchor, so it is not reachable
  // from the battery. The rule is still worth having — R131 shipped against
  // a total that hid exactly this — and this comment is here so nobody reads
  // two green breaks as proof of more than they are.
  //
  // The total comes down with it — 2450 -> 1900, measured 1,831. That is
  // 2.3 phone screens, past the 2.5 R131 aimed at and could not reach with a
  // page size, because a page only ever shortened the half of this screen
  // that was never the problem.
  ranch:          { folded: 1900,  tallest: 4450, opens: 20, chrome: 1050 },
  // R154 — THE PENS' SHUT HEIGHT IS DERIVED TOO, for R92's reason and
  // R131's cause. This screen is the multiplication R131 named — one folded
  // card per chimera — and, alone among the screens R131 paged, it never got
  // a page (`ui/pager.js` is imported by `ranch/ui.js` and by nothing in
  // `splice/pens-ui.js`). That cost nothing for sixty milestones because the
  // stable held twelve whatever the player bought. R154 sells stable room by
  // the pen, so this screen's card count moved for the first time — eleven to
  // sixteen on the same walk — and a flat ratchet would now want a bump every
  // time somebody sells another stall. That is "a number being dragged along
  // behind the thing it was supposed to hold", which is R92's whole complaint.
  //
  // So the budget is the screen at a FULL stable rather than at this walk's
  // roster: 2,180px against 1,923 measured. It moves when somebody sells more
  // stable room — a decision visible in facility.json — and it fails if a
  // card gets taller, which is the thing worth catching. A flat 2,000 would
  // have gone red at eighteen chimeras with nothing wrong, which is the trap
  // this replaces rather than a failure it would have caught.
  //
  // `tallest` stays a flat 4,000 and is NOT derived: that one is R89's
  // criterion — "the day-180 save's expanded Pens under 4,000px" — and it
  // budgets the single open card, not the multiplication.
  pens:           { folded: PEN_CHROME.px + PEN_CARD.px * STABLE_CAP,
                    tallest: 4000, opens: 20 },   // `tallest` is R89's criterion
  // R128: 1900 -> 2080 open, measured at 1998. The shut half does not move
  // (1,827 against 1,900) — what moved is that this screen HAS an open half
  // now. Its two numbers were equal because the Theater had no fold at all,
  // and a `tallest` that equals `folded` does not budget a fold, it forbids
  // one. The Surgery Theater's own upgrade card is the fold, which is the
  // entire milestone: the machine is bought on the screen it runs.
  theater:        { folded: 1900,  tallest: 2080, opens: 1 },
  // R92 — THE VAULT'S HEIGHT IS DERIVED, NOT RATCHETED.
  //
  // R89 left this `null` because there was nothing honest to ratchet
  // against: the screen listed 9,451 tokens and would list a hundred
  // thousand if the campaign ran long enough. R91 capped the vault and gave
  // it 29,000; R92's fuller walk pushed it to 31,992 and I was about to type
  // 32,500. A ratchet that moves every milestone is not a ratchet, it is a
  // number being dragged along behind the thing it was supposed to hold.
  //
  // The screen is one row per holding and the holdings are capped now, so
  // the budget is a STATEMENT ABOUT THE SHAPE: rows times the height of a
  // row. It only moves when somebody deliberately sells more shelf space,
  // which is a design decision rather than drift — and if a row gets taller,
  // this fails, which is the thing worth catching.
  //
  // 68px per row measured on the day-180 save (31,992px across 473 rows),
  // with a tenth for the chrome the species bays put around them.
  // R95: 1900 -> 2400 shut, measured at 2346. The shut Vault summarises what
  // is on the shelf, and a campaign that reaches 233 of 244 parts has more
  // kinds of thing to summarise than one that reached 118. The open height
  // is derived and did not move.
  // R128: 2400 -> 2560 shut, measured at 2456. The Extractor's card. Two of
  // that track's three grants are vault capacity, and this is the screen
  // where a player watches them run out — 56px of card header is what it
  // costs to be bought where it is felt. The derived open height is
  // untouched, because a fold adds nothing to a screen already 29,798px tall.
  // R131 — AND THE OPEN HALF STOPS BEING DERIVED FROM THE WHOLE SHELF.
  // `VAULT_ROWS * 68 * 1.1` was an honest description of a screen that could
  // put all 457 rows on at once: 41 bays of raw `<details>`, none of them
  // exclusive, 29,708px measured. A budget that tracks the shelf is a budget
  // that grows with the save, which is the thing this milestone exists to
  // stop. The bays are one-at-a-time on the project's own fold machinery
  // now and a bay shows a page, so the number is the shut shelf plus ONE
  // open page. Measured at 4,009 with pages of eight; 4,100 sits just above
  // it, and like the Ranch's it is arithmetic rather than a ratchet — the
  // shut shelf plus sixteen rows, whatever the shelf holds.
  // R143: 4100 -> 4120, measured at 4110, and it is the same arithmetic R95
  // applied — the shut shelf summarises what KINDS of thing are on it, and a
  // tighter economy walks a different campaign. Identical part count (334
  // both), different spread across the species bays, one more line of summary
  // to draw. The open page is untouched.
  //
  // The bay this exists for is the shark bay, and it is worth writing the
  // numbers down: on a day-180 save it holds 101 of the 337 parts AND 116
  // of the 120 vials. One summary line, 217 rows behind it. The first
  // version of this milestone paged the parts and left the vials, and the
  // gate measured that bay at 16,821px — the fix is not a smaller page, it
  // is that a list is a list.
  // R152: 4120 -> 4140, measured at 4122, and it is R143's cause again in
  // the same place. The hoard did not grow — seed 2026 ends on 333 parts
  // where it held 338 before, and one FEWER chimera. What moved is the
  // SPREAD: a garrison that bills the whole map walks a poorer campaign into
  // a different set of species bays, and the shut shelf summarises what kinds
  // of thing are on it, so a bay more or less is a summary line more or less.
  // This is the second economy milestone to move it by that mechanism, which
  // is worth saying out loud: this number tracks the fixture's species spread
  // and will move again the next time anybody touches prices. It is arithmetic
  // over a fixture, not a ratchet against growth — the growth guard is R91's
  // 260-part cap, and that is what actually bounds this screen.
  // R180: 4140 -> 4200, measured at 4159, and it is the SAME mechanism a
  // third time, which the note above predicted in as many words. The hoard
  // shrank — 351 parts on `60f5941` against 325 here — and the screen grew
  // anyway, because the species SPREAD widened from 40 bays to 41 and the
  // shut shelf summarises what kinds of thing are on it. One bay is 81px of
  // summary line and fold. The growth guard is still R91's part cap, not
  // this number.
  vault:          { folded: 2560,  tallest: 4200, opens: 20 },
  'dex:roster':   { folded: 3100,  tallest: 3100 },
  // R117 — 1100 -> 1150, and `dex:genes` below by the same 50, which is the
  // SHARED CHROME rather than the tab: the Dex's six-tab bar goes to two
  // rows of three under 430px, because `1fr` is `minmax(auto, 1fr)` and the
  // widest label needed 80px in a 52px cell, so the strip ran 7px off the
  // right of a 380px phone on all six tabs. A second row is 44px of button
  // and 6px of gap; nine px of uppercase was the alternative. Every other
  // Dex tab absorbed the same 50 inside the headroom it already had — these
  // two are the ones that did not, and they keep the headroom they had
  // (variants 48, genes 18) rather than gaining any.
  'dex:variants': { folded: 1150,  tallest: 1150 },

  // R136 FOLDS IT, which R95 first said was owed and R135 ratcheted around
  // one more time. This is the LAST tab in the game with no fold at all, and
  // it had grown to 2,403px of three flat lists — 12 pairs you already own,
  // 13 you have found, 2 still rumoured — on a screen the player looks
  // things up in rather than reads.
  //
  // 800 was the target, written before the work so the gate went red first.
  // SHIPPED: 550 shut, measured at 497 — 2,403 -> 497, and 529 words -> 78.
  //
  // The open number is 2,606 against the 2,403 it used to be flat, and that
  // 203px is the fold's own chrome: three heads and three summaries. It is
  // the same price R89 paid on the Foes tab and for the same reason — it is
  // only paid by a reader who deliberately opened all three, and the ratchet
  // stops it growing further.
  //
  // R141 — 2,700 -> 2,950, measured 2,825, AND THE CAUSE IS NOT THE TAB.
  //
  // R136 set 2,700 against 2,606 on a day-180 save holding 197 parts. The
  // same seed now ends on 228, because the walker churns less once it can
  // pick a frame instead of taking the first that validates. Twenty-seven
  // rows either way — what grew is the ROW: an undiscovered pairing's hint
  // names the halves you are holding, so a fuller vault writes a longer
  // sentence, and the count of rows that have something to say went up with
  // it. That is R95's content reach arriving on a screen, not a regression.
  //
  // The bound is real and it is not this budget: R91 caps the vault at 260
  // parts, so the longest this tab can ever get is 27 rows of "you hold both
  // halves". 2,950 is the same ~4% headroom over the measurement that 2,700
  // was over 2,606 — if a later milestone finds it at 2,900, the answer is
  // to page the tab the way R131 paged the Vault, not to move this again.
  // R116 — `opens` 3 -> 2, AND IT IS THE FIXTURE THAT CHANGED, not the tab.
  // `combosView` renders a band only when its list is non-empty, and the
  // three are found / both-halves-in-hand / still-to-find. Measured on this
  // gate's own day-180 save after R116's buy fix: found 16, ready 11,
  // rumoured ZERO — because `dex.parts` reads 244 of 244. A campaign that
  // has collected the whole game has nothing left to find, so the third band
  // does not exist to be opened and the declaration was asking for a fold
  // that cannot be there. `foldVerdict` treats `opens` as a MINIMUM, so a
  // mid-campaign save that still has rumoured pairings opens three and
  // passes unchanged.
  // R179 — 2950 -> 3100 open, measured at 3036. The twenty-eighth combo:
  // the open half of this tab is one row per combo, so it is a
  // multiplication and a content milestone moves it by exactly one row.
  // The SHUT half is untouched at 550 — the folds are what keep this tab
  // flat against a list that grows, and they still do.
  // R180: 3100 -> 3250 open and 600 -> 630 words, measured at 3131 and 607,
  // and this raise is a DIFFERENT SHAPE from R179's above — which matters,
  // because R136 left a standing instruction to page this tab rather than
  // move the number again, and R179 spent it once already on a real new row.
  //
  // There is no new row here. The tab is 28 rows on both trees, one per
  // combo, exactly as R136 said. What moved is which BAND each row sits in:
  // the fixture holds both halves of 20 combos where the base tree held 16.
  // The obvious reading — a "ready" row is taller, so the ceiling is all 28
  // ready — was measured and is FALSE: a fixture with every combo ready
  // reads 3116px and 600 words, BELOW the 3131 this tree reads at twenty.
  //
  // So the driver is not the band split. It is WHICH PARTS the campaign
  // happens to be holding, because a row is a part name and a long name
  // wraps to a second line. Three fixtures, three readings: 3036 / 3116 /
  // 3131, a 95px spread with no new content behind any of it. A budget set
  // 2% over one of those is a budget that reads the fixture rather than the
  // screen, and it will go red on the next milestone that touches prices
  // for reasons that have nothing to do with this tab.
  //
  // 3250 is R136's own ~4% convention applied to the TOP of the measured
  // spread rather than to a single reading. R136's instruction stands and
  // is now the stated answer: if a fixture ever pushes past this band, page
  // the tab the way R131 paged the Vault. The SHUT half is untouched at 550
  // and reads 491, which is what a player actually arrives at.
  'dex:combos':   { folded: 550,   tallest: 3250, opens: 2 },
  // R129 FOLDS IT, WHICH BRINGS THE SHUT HALF DOWN AND BUDGETS THE FOLD:
  // 1100/1100 -> 400 shut (measured 291) and 1250 open (measured 1185).
  // Twelve genes could only be learned by breeding for them, so this tab
  // spent the game mostly unsequenced and its full shape was never measured
  // — the release hands the player genes through the Wing, a day-180 walk
  // now knows all twelve, and 219 words arrived on a screen with no fold.
  // Same answer R89 gave the Foes tab and for the same reason: the field
  // guide is looked things up in, not read, so the shut number is the one
  // that matters and the open one is a ratchet a reader pays deliberately.
  'dex:genes':    { folded: 400,   tallest: 1300, opens: 1 },   // R117: +50, the second tab row
  // R89's criterion names 2,500 for the Foes tab, and that is a budget on
  // how it PRESENTS: 4,113px shut was five and a half screens of reference
  // material nobody had asked for. Folded it is 664.
  //
  // Its fully-open height is a ratchet rather than the same 2,500, and the
  // reason is not that 2,500 was inconvenient. The field guide is a gallery
  // you look things up in — four class bands you may well want open together
  // to compare — so the one-card-at-a-time rule that makes the Pens' tallest
  // meaningful would make this tab worse to use. Folding it added chrome and
  // pushed the everything-open height from 4,113 to 5,702; that is the price
  // of the fold, it is paid only by a player who deliberately opened all
  // four, and the ceiling below stops it growing further.
  // R97: 6000 -> 6100 open, measured at 6042. The tab gained a section that
  // did not exist when R89 set this — one fold listing what each rival lab
  // has fielded against you. Written as a LIST rather than the gallery the
  // rest of the tab uses, because a lab's specimen is a different creature
  // every duel and there is no portrait to draw: five cells measured 858px,
  // five lines 200px, and the 42px that remain are the fold's own header.
  //
  // The number this milestone is judged on is the OTHER one. R97's criterion
  // is "Foes under two screens folded"; it is 764px shut, against 1,560.
  // R113 - 6100 -> 6150, measured at 6115. THE TYPE FLOOR HAS TO LAND
  // SOMEWHERE, and this is the only one of the nine screens it pushed over.
  // Flooring 78 declarations at 12px was measured against every budget in this
  // table before it was applied: eight screens absorbed it, including
  // `dex:roster` and `dex:variants`, which run at exactly their budget and did
  // not move because what they draw is portraits rather than small print. This
  // tab is the opposite - it is the longest list of fine print in the game,
  // 42 units and 5 rivals, so it is where 0.5px per line adds up to 15.
  //
  // 35px of slack over the measurement, which is the smallest number that is
  // not the measurement itself. The shut number, which is what R97's criterion
  // is actually judged on, did not move: 764px against 2,500.
  'dex:foes':     { folded: 2500,  tallest: 6200, opens: 4 },   // R117: +50, the second tab row
  // R185 — THE SIXTH TAB, measured for the first time since R112 shipped it.
  //
  // Day-180 save at 380px: 919px shut, 1454px open, 4 of 5 folds walked. The
  // fold count is not luck and not a flake — `yearbookView` renders one
  // collapsible card per section with the FIRST one open on arrival (R133's
  // rule for a screen of cards), so the walk opens the other four every time.
  //
  // AND ITS HEADROOM IS FOR CONTENT, NOT FOR A CAMPAIGN. Every other tab here
  // grows with the save — more species seen, more foes met, more combos
  // found. `yearbook()` maps `content.yearbook.sections` unconditionally and
  // filters nothing, so this tab is 5 sections and 22 rows on a fresh save and
  // on a day-180 one; what changes is the numbers inside, not how many. So the
  // budget is sized against a SIXTH SECTION being authored rather than against
  // a longer campaign: 1000/1600 is ~9% over shut and ~10% over open, which is
  // the band `dex:genes` and `dex:combos` carry, and a new section would be
  // about 180px of card — it would fail this, which is the point.
  // R179 — 1000 -> 1050 shut, measured at 1002. One more counter on the
  // Yearbook's War section, which is R112's rule working: a tally that is
  // not on this page is a tally nobody can see, so a new verb arrives with
  // a row and the row has a height. Fifty pixels is a row and its
  // subtitle, which is what the next one will cost too.
  'dex:yearbook': { folded: 1050,  tallest: 1600, opens: 4 },
};

// R98 — AND WHAT IT SAYS, not only how tall it is.
//
// The two are the same question asked twice. A screen is expensive because
// it puts more in front of the player than they asked for, and height is
// only the part you can see from across the room — the Ranch is 14,450px
// open AND 1,686 words, for the one reason: twenty full dossiers stacked
// vertically with nothing closing the one you were not reading.
//
// Measured on the same day-180 save, at the same moment, in the same browser
// this gate has already started. A second tool would mean a second Chromium
// and forty seconds on a suite that has six to spare.
//
// `open` is what a player can have on screen at once — which is NOT the sum
// of every card, on a screen that keeps one card open at a time. That
// distinction is the whole finding: the Pens has ten folds and allows one,
// so opening everything you can reach costs 291 words; the Ranch has
// twenty-three and allows all of them.
const WORDS = {
  // 900 was a GUESS, written before the first run, and this milestone caught
  // itself making it twice (see the Combos tab below). Measured after the
  // one-at-a-time rule: 935, down from 1,686. The ratchet sits just above
  // the measurement, which is the R89/R91 convention and the only honest
  // thing to do with a number I invented — creep fails, and the screen
  // cannot drift back toward the wall it was.
  //
  // The Ranch is allowed more than the Pens for a reason that is not
  // slack: it is where the money, the catalogue, breeding, the incubator and
  // the whole facility tree live. R128 will take most of the facility off it.
  // R154 STRIKES THE REST OF THAT SENTENCE. It used to read "it holds twenty
  // animals against the Pens' ten", and the herd is the one thing it is NOT:
  // R131 paged this screen at eight and left the Pens unpaged, so the Ranch's
  // words are a constant and the Pens' are a multiplication. Measured across
  // a change that took the stable from twelve to sixteen: the Ranch moved 262
  // words to 261 and held twelve folds, while the Pens moved 242 to 318 and
  // eleven folds to sixteen. The relationship the sentence claimed is the
  // reverse of the one the screens have.
  // R128 collects here too: 950 -> 810 open, measured at 768. Same cause as
  // the pixel ceiling above — R98's one-at-a-time rule made the 950 word
  // budget unreachable, and an unreachable budget measures nothing.
  // R133: 700/810 -> 400/550, measured 287 and 475. The agenda stopped
  // teaching what its own `ready` predicate says the player is already
  // doing, and the money card and the Breeding Pen stopped arriving open —
  // so the screen says 104 fewer words before you touch it. A budget left
  // at 700 against a 287-word screen is the ceiling nothing can reach that
  // R131 warned about: it measures nothing and excuses the next regression.
  ranch:          { folded: 400,  open: 550 },
  // R154 — the same arithmetic as the Pens' height, out of the same two
  // measurements; see the note in BUDGET above for why it is derived at all.
  // 78 words of chrome plus 16 a card says 366 at a full stable, against 318
  // measured. The open half is that plus ONE card, because this screen keeps
  // one open at a time — and the card cost exactly 86 words on both trees.
  pens:           { folded: PEN_CHROME.words + PEN_CARD.words * STABLE_CAP,
                    open:   PEN_CHROME.words + PEN_CARD.words * STABLE_CAP + PEN_OPEN_WORDS },
  // R128: 300 -> 340 open, measured at 320. The upgrade card's twenty words
  // are the Tier II blurb and the grants line under it — what the gantry
  // costs and what it buys. The shut budget is unchanged at 300 (measured
  // 260), so the screen still has to summarise it in one line.
  theater:        { folded: 300,  open: 340 },
  // The Vault is a list of what you own, and R91 capped what that can be —
  // 400 parts and 120 vials, each a line. Its words are inventory rather
  // than prose, and the fold work it is owed is a height problem; a ratchet
  // keeps it from growing further meanwhile.
  // R152: 350 -> 375, measured at 359. Same cause as the height above and
  // the same ~4% headroom R141 left on `dex:combos` — the shut shelf names
  // the KINDS on it, so a different species spread writes a different number
  // of summary lines. 333 parts against 338, so nothing the player holds grew.
  vault:          { folded: 375,  open: 5000 },
  'dex:roster':   { folded: 400,  open: 400 },
  'dex:variants': { folded: 200,  open: 200 },
  // R136: 550/550 -> 150 shut (measured 78) and 600 open (measured 532).
  // R95 left the shut budget at 550 against a 527-word screen because the
  // tab had no fold to hide behind; it has three now, so the shut number is
  // the one that matters and it is a fourteenth of what it was. The open
  // half grew by the three summary lines the folds carry.
  // R180: 600 -> 630 open, measured at 607, and the SHUT half is untouched
  // at 150 against 66 measured — which is the point. The open words are
  // inventory rather than prose: one line per combo naming the two parts,
  // so the count tracks which parts the fixture is holding and not what
  // anybody wrote. Three fixtures read 582 / 600 / 607, including one that
  // holds both halves of every combo, and none of them adds a sentence.
  // See the height budget above for the full derivation and for R136's
  // standing instruction, which this honours rather than spends.
  'dex:combos':   { folded: 150,  open: 630 },
  // R129: 200/200 -> 100 shut (measured 50) and 250 open (measured 221).
  // See the height note above — the words are the twelve descriptions, and
  // they are now behind the fold that holds them.
  'dex:genes':    { folded: 100,  open: 250 },
  'dex:foes':     { folded: 150,  open: 900 },
  // R185 — measured at 139 shut and 253 open on the day-180 save. The same
  // content-not-campaign argument as the heights above: 22 authored rows and
  // five blurbs, so the slack is for a row somebody writes, not for a ranch
  // that grows.
  'dex:yearbook': { folded: 150,  open: 300 },
};

// R90 — one walked-save recipe, in tools/fixtures.js, and cached on disk.
// The walk costs about fifteen seconds and is deterministic from its seed;
// the battery runs this gate once per break aimed at it, and was paying for
// the same fifteen seconds every time. The guides-dismissed rule lives there
// too, because a fixture that forgets it measures the guide DIALOG.
const save = await walkedSave();
// R130 — THE CLOCK IS PINNED TO THE WALK, and every number in the budget
// table above depended on it not being, which nobody knew until one of them
// broke. `campaignWalk` runs from a FIXED epoch (`Date.UTC(2026, 0, 1)`), so
// a day-180 save's last tick is 2026-06-30 — and the browser renders it at
// whatever today is. This line used to say `save.lastTickAt = Date.now()`,
// which stops the world replaying the gap as upkeep but does nothing about
// `birthAt`: every animal's AGE is a fixed birth measured against a moving
// now, so creatures cross stage boundaries as the calendar advances, bands
// re-sort, badges appear, and the screen changes height.
//
// Measured: the Ranch was 2,453px when R131 set its 2,500 budget and 2,540px
// the next day, on the same commit. R131 merged green against a number that
// was only ever true on the day it was taken — this project's oldest
// recurring mistake, reaching a gate this time instead of a comment.
//
// So the page believes it is the moment the walk stopped. A height measured
// today is then the same height next year, which is the only way a ratchet
// means anything.
const PINNED_NOW = save.lastTickAt;
const simContent = loadSimContent();

const { server, port } = await serve();
const chrome = findChrome();
if (!chrome) {
  console.log('height —  no Chromium on this machine, skipping');
  server.close();
  process.exit(0);
}
const profile = await mkdtemp(join(tmpdir(), 'sw-height-'));
// R132 — `SW_CDP_PORT` so a parallel battery can hand each worker its own
// debugging port. A pid modulo can collide between concurrent runs, and two
// browsers on one port is a flake nobody would ever reproduce on purpose.
const cdpPort = Number(process.env.SW_CDP_PORT) || 9100 + (process.pid % 200);
const proc = spawn(chrome, ['--headless=new', `--remote-debugging-port=${cdpPort}`,
  `--user-data-dir=${profile}`, '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', 'about:blank'], { stdio: 'ignore' });

const problems = [];
const rows = [];
// R159 — which screens never went quiet. Declared out here with `rows`,
// because the rules that read it run after the browser is gone.
const stalls = new Map();
const stalled = (id, why) => stalls.set(id, [...(stalls.get(id) ?? []), why]);
try {
  const { send, evaluate } = await connect(cdpPort);
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Network.enable');
  await send('Network.setBypassServiceWorker', { bypass: true });
  await send('Emulation.setDeviceMetricsOverride', { width: VIEWPORT, height: 780, deviceScaleFactor: 1, mobile: true });
  // Injected before any of the app's own code runs, so the shell's first
  // `Date.now()` already sees the pinned moment.
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => {
      const FIXED = ${PINNED_NOW};
      const Real = Date;
      function Pinned(...args) {
        if (!(this instanceof Pinned)) return new Real(FIXED).toString();
        return args.length ? new Real(...args) : new Real(FIXED);
      }
      Pinned.prototype = Real.prototype;
      Pinned.now = () => FIXED;
      Pinned.parse = Real.parse;
      Pinned.UTC = Real.UTC;
      globalThis.Date = Pinned;
    })();`,
  });
  const url = `http://127.0.0.1:${port}/index.html`;
  await send('Page.navigate', { url });
  await sleep(1000);
  await evaluate(`localStorage.setItem('spliceworld_save', ${JSON.stringify(JSON.stringify(save))})`);
  await send('Page.navigate', { url });
  // R159 — a floor, not the wait. The real one is the settle below, once the
  // helpers it needs exist: this used to be a flat 5000ms, and a cold
  // Chromium on a fresh container does not have the game on screen by then.
  await sleep(800);

  const heightOf = async (sel) => Number(await evaluate(`Math.round(document.querySelector('${sel}')?.scrollHeight ?? 0)`));

  // R159 — WAIT FOR THE PAGE, NOT FOR THE CLOCK.
  //
  // Every wait in this gate used to be a fixed sleep — 5000ms for the load,
  // 2000 to show a screen, 1700 for a Dex tab, 320 for an inner tab, 240
  // after each fold. On a box that renders slower than the number somebody
  // typed, the walk measures a page that is not finished: `openOne` finds no
  // closed fold because the screen has not painted one yet, returns 0, and
  // the walk stops. `opened` then comes back at 4 or 1, and R131's rule —
  // which is right, and load-bearing — reports "a screen nobody can open".
  //
  // REPRODUCED WITH NO LOAD AT ALL, which is what R159's entry got wrong.
  // The entry blamed `npm test` running alongside. Twice in a row on an idle
  // box, same tree, same commit, a container three minutes old:
  //
  //   run 1   RED    ranch 4, pens 1, vault 1, combos 1 folds; theater 2157
  //                  against its 2080 budget                    40.5s
  //   run 2   GREEN  130 folds walked, every screen inside budget  1m51.7s
  //
  // The first run was FASTER because it gave up on every screen early. A
  // cold Chromium — no code cache, no font cache, a profile being created —
  // is enough on its own, and every fresh container starts cold. Note the
  // theater line: an unsettled page corrupts the HEIGHTS too, not just the
  // counts, so the budget rules have to answer this as well.
  //
  // So: poll a cheap signature of the screen until it stops changing, with a
  // deadline instead of a duration. The common case is FASTER than the sleep
  // it replaces — 240ms of guessing becomes ~150ms of knowing — and a slow
  // box gets the time it actually needs rather than the time a fast box
  // needed once.
  // AND READINESS IS PART OF IT, which the first version of this got wrong
  // in the most instructive way. A screen is `hidden` and EMPTY until its
  // module lazy-loads, and an empty element has a perfectly stable
  // signature — so settling on stability alone returned true instantly, on
  // nothing, and the walk measured a blank screen even faster than the sleep
  // had. Under eight burners it reported `ranch ... got into 0`, which is
  // the very sentence this milestone exists to stop printing.
  //
  // So a reading taken before the screen is up is not a quiet reading, it is
  // no reading: it returns '' and resets the count.
  // AND READINESS IS PART OF IT, which the first version of this got wrong
  // in the most instructive way. A screen is `hidden` and EMPTY until its
  // module lazy-loads, and an empty element has a perfectly STABLE
  // signature — so settling on stability alone returned true instantly, on
  // nothing, and the walk measured a blank screen faster than the sleep had.
  // Under eight burners it reported `ranch ... got into 0`, which is the
  // exact sentence this milestone exists to stop printing. A reading taken
  // before the screen is up is not a quiet reading, it is NO reading: it
  // comes back empty and resets the count.
  const READY = '!el.hidden && el.children.length > 0 && el.scrollHeight > 0';
  const signature = async (sel, ready) => await evaluate('(() => {'
    + `  const el = document.querySelector('${sel}');`
    + '  if (!el) return "";'
    + (ready ? `  if (!(${ready})) return "";` : '')
    + '  return [Math.round(el.scrollHeight), el.querySelectorAll("*").length,'
    + '    el.querySelectorAll("[data-fold]").length,'
    + '    el.querySelectorAll("button[data-fold][aria-expanded=\'false\']").length,'
    + '    el.querySelectorAll("details:not([open])").length,'
    + '    document.readyState].join("/");'
    + '})()');

  // THREE QUIET POLLS, not one. A screen that lazy-imports its module paints
  // in two phases, and a single equal pair can land in the gap between them
  // — which would be this gate's own bug one level down: a wait that returns
  // early measures the same unfinished page the sleep did.
  const settle = async (sel, { deadline = 4000, gap = 50, quiet = 3, id = null, ready = READY } = {}) => {
    const t0 = Date.now();
    let last = null;
    let runs = 0;
    while (Date.now() - t0 < deadline) {
      const sig = await signature(sel, ready);
      if (sig && sig === last) {
        if (++runs >= quiet) return { settled: true, waited: Date.now() - t0 };
      } else { runs = 0; last = sig; }
      await sleep(gap);
    }
    if (id) stalled(id, `${sel} was still changing, or still not painted, after ${deadline}ms`);
    return { settled: false, waited: Date.now() - t0 };
  };

  // The boot, answered by the page rather than by a number. The game opens
  // on the Ranch, so that screen going quiet IS the app being up — and the
  // readiness half of the check does the real work here, because every
  // screen div exists in `index.html` from the first byte, empty and hidden.
  if (!(await settle('#screen-ranch', { deadline: 20000 })).settled) {
    stalled('boot', 'the Ranch never painted and went quiet within 20s of loading');
  }
  // R98 — `innerText`, so it is what the player READS: hidden folds and
  // display:none contribute nothing, which is exactly the difference a fold
  // is there to make.
  const wordsOf = async (sel) => Number(await evaluate(
    `(document.querySelector('${sel}')?.innerText ?? '').split(/\\s+/).filter(Boolean).length`));

  // Open one closed thing, anywhere in the screen; report whether it found
  // one. A fold click rerenders, so this is a loop and not a forEach.
  const openOne = async (sel) => Number(await evaluate(`(() => {
    const b = document.querySelector('${sel} button[data-fold][aria-expanded="false"]');
    if (b) { b.click(); return 1; }
    const d = document.querySelector('${sel} details:not([open])');
    if (d) { d.open = true; return 1; }
    return 0;
  })()`));

  // R89 — AND THE TABS INSIDE, or this measures the wrong maximum. The first
  // version opened every fold and stopped, which on the new Pens card meant
  // it only ever saw the Overview tab: 1,742px, while Moves is 1,919. A gate
  // that reports the shortest of four faces as "the tallest" is a gate that
  // would let the tall one grow.
  //
  // The screen's OWN sub-tab bar is excluded — that is the outer loop's job,
  // and cycling it here would measure the Dex's five tabs five times each.
  const innerTabs = async (sel) => JSON.parse(await evaluate(`JSON.stringify(
    [...document.querySelectorAll('${sel} nav.subtabs')]
      .filter((n) => n.id !== 'dex-subtabs')
      .flatMap((n) => [...n.querySelectorAll('button')].map((b) => b.getAttribute(b.getAttributeNames().find((a) => a.startsWith('data-')) ?? 'x')))
      .filter(Boolean))`));

  const acrossTabs = async (sel, id = null) => {
    let tallest = await heightOf(sel);
    const tabs = await innerTabs(sel);
    for (const t of tabs) {
      const clicked = await evaluate(`(() => { const b = document.querySelector('${sel} nav.subtabs:not(#dex-subtabs) button[data-pen-tab="${t}"]'); if (b) { b.click(); return 1; } return 0; })()`);
      if (!Number(clicked)) continue;
      await settle(sel, { deadline: 3000, id });
      tallest = Math.max(tallest, await heightOf(sel));
    }
    return tallest;
  };

  // R131 — AND HOW MANY THINGS IT MANAGED TO OPEN, which this returned
  // nothing about for two years. A height gate only ever fails UPWARDS: a
  // screen that grows is caught, and a screen the walk can no longer open
  // reports a small number and passes. That is not hypothetical — R131's
  // first draft moved the Vault's rows behind the save while leaving the
  // bays as raw `<details>`, so `openOne` set `.open = true` on forty-one
  // empty shells and the gate reported 2,527px for a screen it could not
  // open at all. The break that replays it (198) went MISSED against the
  // budgets alone, which is how this rule got written.
  let opened = 0;
  // R159 — and whether the screen was still repainting when the walk came up
  // short, which is the whole of what tells a slow box from a broken screen.
  let stillMoving = false;
    // R131 — how many folds the screen paints BEFORE the walk touches it.
    // A screen that paints folds must declare how many the walk should get
    // into: that is what makes "the bays lost their `data-fold`" a failure
    // rather than a shorter screen.
    const foldsCount = async (sel) => Number(await evaluate(
      `document.querySelectorAll('${sel} button[data-fold]').length`));

  // R133 — HOW MUCH OF THIS SCREEN IS NOT THE THING IT IS FOR.
  //
  // R131 gave the Ranch a page ceiling and its own entry named what that
  // could not reach: the roster was 686px of a 2,368px screen, and the other
  // 1,682 was chrome. A single total hides that completely — trim two rows
  // off the roster and a fatter agenda is paid for out of the savings, with
  // the gate none the wiser. So the chrome is its OWN number: the distance
  // from the top of the screen to the top of the first roster element, which
  // is every card above it plus the gaps between them and nothing else.
  //
  // Measured against the roster rather than by naming the chrome cards, so a
  // card added above the herd tomorrow is inside the number automatically.
  const chromeOf = async (sel) => Number(await evaluate(`(() => {
    const scr = document.querySelector('${sel}');
    if (!scr) return 0;
    const first = scr.querySelector('.list-group, .pen-fold');
    if (!first) return Math.round(scr.scrollHeight);
    return Math.round(first.getBoundingClientRect().top - scr.getBoundingClientRect().top);
  })()`));

  // R133 — AND EVERY ROW IS ONE LINE.
  //
  // The first version of this rule compared a row against a `spend` chip and
  // that was the wrong bound: a chip is a pill carrying a label and a short
  // number, a row is a label over a sentence, and holding them equal would
  // have deleted the sentence R120 built rather than shortening it.
  //
  // The bound that says what I actually mean is the SHORTEST ROW ON THE
  // SCREEN. Every label is one line, so a row that does not wrap is exactly
  // as tall as every other row that does not wrap; a row that wraps is
  // taller than all of them. Nothing is typed, so a change to the type scale
  // or the padding moves the rule with it (R61), and the chrome budget above
  // covers the case this cannot see — every row wrapping equally.
  // R150 — AND EVERY ROW MEANS EVERY ROW, NOT THE THREE THAT FIT.
  //
  // R143 capped the agenda at three rows per kind, for good reasons of its
  // own. What nobody noticed is that this rule can only see what RENDERS: on
  // the day-180 save the vat row is fifth of five in `work`, so the break
  // aimed at it — 206, "an agenda row teaches a lesson the field guide
  // already gives" — patched a string the browser never received, and went
  // MISSED in the first full battery since R141. The rule was intact the
  // whole time; its only live target had walked off the screen.
  //
  // So the hidden hints are measured too, in the same browser and the same
  // stylesheet: each one is written into a CLONE of a real row and read back.
  // A clone rather than a re-render, because what is being asked is a
  // question about type and width, and the clone inherits both from the row
  // the player actually sees. `spend` is excluded because it renders as
  // chips and puts its hint in a `title` — a tooltip has no width to wrap.
  const probeHints = async (sel, hints) => JSON.parse(await evaluate(`JSON.stringify((() => {
    const row = document.querySelector('${sel} .agenda-row');
    if (!row) return null;
    const fine = row.querySelector('.fine-print');
    if (!fine) return null;
    const clone = row.cloneNode(true);
    row.parentNode.appendChild(clone);
    const slot = clone.querySelector('.fine-print');
    const out = [];
    for (const h of ${JSON.stringify(hints)}) {
      slot.textContent = h.hint;
      out.push({ id: h.id, h: Math.round(clone.getBoundingClientRect().height), t: h.hint });
    }
    clone.remove();
    return out;
  })())`));

  const agendaShape = async (sel) => JSON.parse(await evaluate(`JSON.stringify((() => {
    const rows = [...document.querySelectorAll('${sel} .agenda-row')]
      .map((e) => ({ h: Math.round(e.getBoundingClientRect().height),
        t: (e.innerText || '').split(String.fromCharCode(10)).pop() }));
    if (!rows.length) return { rows: 0 };
    const tallest = rows.reduce((a, b) => (b.h > a.h ? b : a));
    return { rows: rows.length, tallest: tallest.h, shortest: Math.min(...rows.map((r) => r.h)),
      worst: tallest.t };
  })())`));
  // R159 — THE DISCRIMINATOR, and the whole point of the milestone.
  //
  // "The walk found nothing to open" has two causes that look identical from
  // here: the screen is FINISHED and has nothing left, or it has not finished
  // ARRIVING. Settling cannot separate them — under 40 burners the Pens
  // painted its card shell, went quiet for the three polls, and had no roster
  // yet, so the walk reported `got into 0` exactly as before.
  //
  // What separates them is whether the screen is still MOVING. Wait for the
  // thing to turn up and watch the signature while waiting: if it changes,
  // this screen was still being painted and the run is starved; if it sits
  // perfectly still for fifteen seconds and the thing never comes, the screen
  // really is finished and really has nothing — which is precisely the defect
  // R131 wrote `opens` for, and it still gets said.
  const waitForIt = async (sel, testExpr, { deadline = 15000, gap = 100 } = {}) => {
    const first = await signature(sel, READY);
    let moved = false;
    const t0 = Date.now();
    while (Date.now() - t0 < deadline) {
      if (Number(await evaluate(testExpr))) return { got: true, moved };
      const sig = await signature(sel, READY);
      if (sig !== first) moved = true;
      await sleep(gap);
    }
    return { got: false, moved };
  };

  const closedFoldIn = (sel) => `(() => { const el = document.querySelector('${sel}');`
    + ' return el && (el.querySelector(\'button[data-fold][aria-expanded="false"]\')'
    + ' || el.querySelector("details:not([open])")) ? 1 : 0; })()';

  const tallestOf = async (sel, cap = 40, id = null, want = 0) => {
    let tallest = await acrossTabs(sel, id);
    opened = 0;
    stillMoving = false;
    for (let i = 0; i < cap; i++) {
      if (!await openOne(sel)) {
        // Nothing left to open. Finished, or not yet arrived?
        if (!want || opened >= want) break;
        const { got, moved } = await waitForIt(sel, closedFoldIn(sel));
        if (got) continue;
        stillMoving = moved;
        break;
      }
      opened += 1;
      // A fold click rerenders, and the rerender is what the next `openOne`
      // reads. Give it a deadline rather than 240ms of hope.
      if (!(await settle(sel, { deadline: 3000, id })).settled) break;
      tallest = Math.max(tallest, await acrossTabs(sel, id));
    }
    return tallest;
  };

  // R159 — AND THE RETRY THE CRITERION ASKS FOR. A screen that does not go
  // quiet is shown again with twice the patience before anything is measured
  // off it, because the cheapest fix for a slow box is to wait longer, and
  // the second attempt costs nothing on a box that never needed it.
  const show = async (screen, { id = screen } = {}) => {
    const sel = `#screen-${screen}`;
    for (const deadline of [4000, 8000, 16000]) {
      await evaluate(`document.querySelector('[data-screen="${screen}"]')?.click()`);
      const r = await settle(sel, { deadline });
      if (r.settled) return r;
    }
    stalled(id, `it would not go quiet in 4s, 8s or 16s`);
    return { settled: false };
  };

  // R128b — HOW FAR DOWN IS THE UPGRADE? Reported from play, on a build
  // whose four gates were all green: "I don't see the upgrades anywhere."
  // R128 moved each facility track to the screen its data names and
  // APPENDED it there, which put it last on every screen it reached —
  // 12th of 12 on the Pens, 2nd of 2 on the Vault, 4th of 4 on the Splice,
  // 10th of 10 in the War Room, between 1.9 and 3.2 phone screens down.
  // The Ranch card it replaced was 3rd of 25.
  //
  // Every assertion R128 wrote asked whether the card EXISTS. None asked
  // where, so a milestone about findability shipped the thing further from
  // the player than it found it. Two rules, because either alone has a hole:
  // pixels miss a short screen whose card is still dead last (the Pens
  // measured 1.9 screens down at 12 of 12), and position misses a screen
  // with two enormous cards above one small one.
  //
  // R99 CORRECTS THE POSITION HALF. It was `at * 2 > of` — "in the bottom
  // half" — and that is a KNIFE EDGE on the one screen whose card count moves
  // on its own: the War Room shows a raid card, a contest card and a captive
  // card only when the world has one, and `height.js` stamps the fixture with
  // `Date.now()`, so how many are up depends on how long since the walk. It
  // measured 5 of 10 when it was written and 6 of 11 on the next run, which
  // flipped a passing gate red for a reason that had nothing to do with
  // layout. A gate that depends on world state is a gate that fails at random.
  //
  // NEVER LAST is the rule that was actually meant, and it is not a knife
  // edge: it catches every appended card (12 of 12, 2 of 2, 4 of 4, 10 of 10)
  // and cannot be flipped by an alert card arriving above it. The pixel
  // budget covers the other case — not last, but still miles down.
  const facilityPlace = async (screen) => await evaluate(`(() => {
    const scr = document.querySelector('#screen-${screen}');
    const head = scr?.querySelector('[data-fold="facility-${screen}"]');
    if (!head) return 'null';
    const card = head.closest('.card');
    const cards = [...scr.querySelectorAll(':scope > .card, :scope > section')];
    return JSON.stringify({ at: cards.indexOf(card) + 1, of: cards.length,
      top: Math.round(card.getBoundingClientRect().top + window.scrollY) });
  })()`);
  const FACILITY_TOP = 780 * 2;  // two phone screens, and not one more

  for (const screen of ['ranch', 'pens', 'theater', 'vault']) {
    await show(screen);
    const sel = `#screen-${screen}`;
    const folded = await heightOf(sel);
    const foldsPainted = await foldsCount(sel);
    const wordsShut = await wordsOf(sel);
    // Measured SHUT and before `tallestOf` opens anything, which is the
    // state a player actually arrives in.
    const place = JSON.parse(await facilityPlace(screen));
    if (place) {
      if (place.of > 1 && place.at === place.of) {
        problems.push(`${screen} buries its facility card last of ${place.of} cards`
          + ' — an upgrade under everything else on the screen is one nobody scrolls to');
      }
      if (place.top > FACILITY_TOP) {
        problems.push(`${screen}'s facility card is ${place.top}px down (${(place.top / 780).toFixed(1)} phone`
          + ` screens), over the ${FACILITY_TOP}px it is allowed`);
      }
    }
    // Both R133 numbers are taken SHUT, before `tallestOf` opens anything —
    // the state a player arrives in, which is the whole complaint.
    const chrome = await chromeOf(sel);
    const agenda = await agendaShape(sel);
    // R150 — the rows R143's cap keeps off the screen, measured anyway.
    // Derived from the same save at the same pinned instant the page is
    // rendering, so these are the sentences the player WOULD see the moment
    // one of the three above it closes.
    if (screen === 'ranch' && agenda?.rows > 0) {
      const all = agendaRows(save, simContent, PINNED_NOW)
        .filter((i) => i.kind !== 'spend')
        .map((i) => ({ id: i.id, hint: String(i.hint ?? '') }));
      const probed = await probeHints(sel, all);
      // AND THE PROBE IS COUNTED. `filter` over nothing is an empty list and
      // an empty list of problems is a pass — which is the exact shape of
      // failure this milestone exists to remove. If the clone never lands,
      // or the row list comes back empty, that is a broken rule, not a
      // clean one, and it has to say so in the same voice as a real miss.
      agenda.probed = probed?.length ?? 0;
      agenda.expected = all.length;
      if (probed) agenda.hidden = probed.filter((r) => r.h > agenda.shortest);
    }
    const tallest = BUDGET[screen]?.tallest === null ? null : await tallestOf(sel, 40, screen, BUDGET[screen]?.opens ?? 0);
    // After `tallestOf`, which has opened everything the screen will allow.
    rows.push({ id: screen, folded, tallest, opened, moved: stillMoving, foldsPainted, wordsShut, chrome, agenda,
      wordsOpen: await wordsOf(sel),
      facilityAt: place && `${place.at}/${place.of} @ ${place.top}px` });
  }
  // The War Room is not in the height table (its map is a canvas the budget
  // has never covered), but it draws a track, so it answers this rule too.
  {
    await show('battle');
    // R159 — same question as the fold walk, same discriminator. Under load
    // the War Room painted its shell and not its cards, and this line called
    // that "draws no facility card at all".
    let place = JSON.parse(await facilityPlace('battle'));
    if (!place) {
      const { got, moved } = await waitForIt('#screen-battle',
        '(document.querySelector(\'#screen-battle [data-fold="facility-battle"]\') ? 1 : 0)');
      if (got) place = JSON.parse(await facilityPlace('battle'));
      else if (moved) stalled('battle', 'its facility card never arrived and the screen was still repainting');
      else problems.push('the War Room draws no facility card at all');
    }
    else if (place.of > 1 && place.at === place.of) {
      problems.push(`battle buries its facility card last of ${place.of} cards`);
    }
    if (place && place.top > FACILITY_TOP) {
      problems.push(`battle's facility card is ${place.top}px down, over the ${FACILITY_TOP}px it is allowed`);
    }
  }
  await show('dex');
  // R185 — THE LIST COMES OFF THE BAR, NOT OUT OF THIS FILE.
  //
  // It was `['roster', 'variants', 'combos', 'genes', 'foes']` and the Dex has
  // shipped SIX tabs since R112: the Yearbook had no folded budget, no tallest
  // budget and no word budget, and R89's whole argument — a screen that
  // outgrows a phone is a screen nobody reads — had never once been applied to
  // it. That is R39's finding ("the gate that checked five of six screens")
  // one level down, and it is not R117's doing; R117 only made it visible by
  // adding 50px of shared chrome to a tab nothing was watching.
  //
  // A literal list is a second place to remember, and the second place is
  // always the one that goes stale. `tools/wide.js` reads its widths off the
  // page for the same reason, and `innerTabs` above has read the OTHER bars
  // off the page since R154 — the Dex's own bar was the one exclusion.
  const dexTabs = JSON.parse(await evaluate(`JSON.stringify(
    [...document.querySelectorAll('#screen-dex nav.subtabs#dex-subtabs button[data-dex-tab]')]
      .map((b) => b.dataset.dexTab).filter(Boolean))`));
  // AND THE READ HAS TO HAVE FOUND SOMETHING. A selector that stops matching
  // returns [], the loop below walks nothing, and the gate goes GREEN having
  // measured no tab at all — which is the exact failure this rule exists to
  // end, reintroduced one level further up. Two is the floor because a bar
  // with one tab is not a bar; the real check is the union after the loop.
  if (dexTabs.length < 2) {
    problems.push(`the Dex tab bar reads ${dexTabs.length} tabs off the page — the walk found no bar`
      + ' to cycle, so every Dex budget below is unmeasured rather than met');
  }
  for (const tab of dexTabs) {
    await evaluate(`document.querySelector('#screen-dex [data-dex-tab="${tab}"]')?.click()`);
    // R159 — the Dex tabs rebuild the whole panel, so this was the longest
    // fixed sleep in the file and still the one most likely to be short.
    if (!(await settle('#screen-dex', { deadline: 6000 })).settled) {
      await settle('#screen-dex', { deadline: 12000, id: `dex:${tab}` });
    }
    const folded = await heightOf('#screen-dex');
    const foldsPainted = await foldsCount('#screen-dex');
    const wordsShut = await wordsOf('#screen-dex');
    const tallest = await tallestOf('#screen-dex', 40, `dex:${tab}`, BUDGET[`dex:${tab}`]?.opens ?? 0);
    rows.push({ id: `dex:${tab}`, folded, tallest, opened, moved: stillMoving, foldsPainted, wordsShut, wordsOpen: await wordsOf('#screen-dex') });
  }
  // THE UNION, WHICH IS WHAT MAKES THE DOM READ SAFE. Reading the list off the
  // page catches a tab the table does not name (the `!b` rule below). This
  // catches the other direction: a declared budget that nothing walked,
  // because the selector went blind or a tab quietly left the bar. Neither
  // side is a literal, and a rule that can only ever pass is the shape R90's
  // shard union was written against.
  const walked = new Set(dexTabs.map((t) => `dex:${t}`));
  for (const id of Object.keys(BUDGET).filter((k) => k.startsWith('dex:'))) {
    if (!walked.has(id)) {
      problems.push(`${id} declares a height budget and the walk never reached it`
        + ` — the bar offered ${[...walked].join(', ') || 'nothing'}`);
    }
  }
} finally {
  proc.kill();
  server.close();
  await sleep(300);
  try { await rm(profile, { recursive: true, force: true }); } catch { /* the OS will get it */ }
}

// R159 — THE BOOT, BEFORE ANY SCREEN IS JUDGED. If the app never arrived,
// every row below it is a measurement of an empty shell.
if (stalls.has('boot')) {
  problems.push('THE PAGE DID NOT SETTLE: the app never went quiet in 20s, so nothing was measured'
    + ' on a finished render — this is a starved run, not a broken game. Re-run the gate alone.');
}

for (const r of rows) {
  const b = BUDGET[r.id];
  if (!b) { problems.push(`${r.id} has no height budget — a new screen has to declare one`); continue; }
  // R159 — AND THE VERDICT THIS MILESTONE EXISTS FOR. Every rule below reads
  // a number off the page; if the page never stopped changing, the number is
  // about a render that had not finished, not about the game. R131's `opens`
  // rule in particular then says "a screen nobody can open" — the single most
  // misleading sentence this gate can print, because the screen is fine and
  // the box was slow. So a stalled screen gets its OWN verdict and none of
  // the others: it still fails, because a rule that goes quiet on a page it
  // could not read is the false green R131 exists to prevent, but it fails
  // saying the true thing.
  if (stalls.has(r.id)) {
    problems.push(`${r.id} — THE PAGE DID NOT SETTLE (${stalls.get(r.id).join('; ')}).`
      + ' Its budgets and its fold count are NOT reported: they would be measurements of an'
      + ' unfinished render. This is a starved or cold run, not a screen nobody can open —'
      + ' re-run the gate on an idle box before believing anything about this screen.');
    continue;
  }
  if (r.folded > b.folded) {
    problems.push(`${r.id} is ${r.folded}px shut, over its ${b.folded}px budget (${(r.folded / 780).toFixed(1)} phone screens before anything is opened)`);
  }
  if (b.tallest !== null && r.tallest > b.tallest) {
    problems.push(`${r.id} reaches ${r.tallest}px when opened, over its ${b.tallest}px budget (${(r.tallest / 780).toFixed(1)} phone screens)`);
  }
  // R131 — AND THE SCREEN HAS TO STILL OPEN. Every rule above fails UPWARDS
  // only, so a screen the walk can no longer get into reports a comfortable
  // number and passes. `opens` is a declaration like the budgets, and it is
  // a COUNT rather than a flag for a reason I got wrong first: the flag
  // version was satisfied by the facility card alone, so the break that
  // takes the Vault's forty-one bays off `data-fold` still passed with one
  // fold walked. Measured (opened/painted): ranch 40/11, pens 40/11, vault
  // 40/42, foes 5/5, theater and genes 1/1 — the exclusive screens saturate
  // the walk's cap of 40 because each open shuts the last. The declared
  // numbers sit well under those and well over what a broken screen gives.
  if (r.foldsPainted > 0 && b.opens == null) {
    problems.push(`${r.id} paints ${r.foldsPainted} folds and declares no \`opens\` count`
      + ' — a screen with folds has to say how many the walk should get into');
  }
  if (b.opens != null) {
    // R159 — ONE READER, AND IT IS THE ONE SMOKE TESTS. The sentence this used
    // to print was the false red the whole milestone is about, so the choice
    // between "did not settle" and "nobody can open" is made in
    // `tools/settling.js` and asserted in both directions by smoke.
    const verdict = foldVerdict({ id: r.id, opened: r.opened, want: b.opens, moved: r.moved });
    if (verdict) {
      problems.push(verdict.msg);
    } else if (r.tallest <= r.folded) {
      problems.push(`${r.id} opened ${r.opened} thing${r.opened === 1 ? '' : 's'} and did not grow`
        + ` (${r.folded}px shut, ${r.tallest}px open) — the walk is opening empty containers`);
    }
  }
  // R133 — the chrome budget, for the screens that declare one. It is opt-in
  // rather than universal because the number only means something where the
  // screen has a body the chrome sits above: the Dex tabs ARE the content,
  // and a chrome number for them would be the whole tab.
  if (b.chrome != null && r.chrome > b.chrome) {
    problems.push(`${r.id} spends ${r.chrome}px before the first ${r.id === 'ranch' ? 'animal' : 'row'},`
      + ` over its ${b.chrome}px chrome budget — that is ${(r.chrome / 780).toFixed(1)} phone screens`
      + ' of preamble, and it is not what the screen is for');
  }
  // R150 — the probe reached every row it was given, or the rule below is
  // measuring an empty list and reporting nothing.
  if (r.id === 'ranch' && r.agenda?.rows > 0
    && (!r.agenda.expected || r.agenda.probed !== r.agenda.expected)) {
    problems.push(`ranch's agenda rule measured ${r.agenda.probed} of ${
      r.agenda.expected} rows — a rule that reaches nothing passes, so this is a broken gate`);
  }
  // R150 — a row that is off the screen today is a row the player sees
  // tomorrow, so it answers the same rule. Reported separately from the
  // rendered ones so the message says WHICH kind of miss it is.
  for (const h of r.agenda?.hidden ?? []) {
    problems.push(`${r.id}'s "${h.id}" agenda row is ${h.h}px against a ${
      r.agenda.shortest}px row that fits — "${h.t}" wraps. It is past R143's `
      + 'three-row cap today, which is not the same as being short enough');
  }
  if (r.agenda?.rows > 1 && r.agenda.tallest > r.agenda.shortest) {
    problems.push(`${r.id}'s tallest agenda row is ${r.agenda.tallest}px against a ${
      r.agenda.shortest}px row that fits — "${r.agenda.worst}" wraps, and a row that wraps`
      + ' is a row carrying something other than what is true right now');
  }
  const w = WORDS[r.id];
  if (!w) { problems.push(`${r.id} has no word budget — a new screen has to declare one`); continue; }
  // R154 — AND A BUDGET HAS TO BE A NUMBER. The Pens' four budgets are read
  // out of facility.json now rather than typed, and a derivation can go NaN
  // where a literal cannot: `undefined - freePens` is NaN, `1923 > NaN` is
  // false, and every comparison in this block would pass in silence. That is
  // the shape of every miss this project has had — a rule with nothing to
  // look at passes — so a budget says it is a real number before it is used.
  for (const [k, v] of [['folded', b.folded], ['tallest', b.tallest], ['chrome', b.chrome],
                        ['folded-words', w.folded], ['open-words', w.open]]) {
    if (v != null && !Number.isFinite(v)) {
      problems.push(`${r.id}'s ${k} budget is ${v} rather than a number — a derived budget that`
        + ' goes NaN or Infinity does not fail, it stops asking');
    }
  }
  if (r.wordsShut > w.folded) {
    problems.push(`${r.id} says ${r.wordsShut} words shut, over its ${w.folded}-word budget`
      + ' — that is what the player is handed before they ask for anything');
  }
  if (r.wordsOpen > w.open) {
    problems.push(`${r.id} says ${r.wordsOpen} words with everything it will let you open open,`
      + ` over its ${w.open}-word budget`);
  }
}
if (REPORT) {
  console.log(`  screen          shut     tallest   budget          words shut/open   budget    upgrade at`);
  for (const r of rows) {
    const b = BUDGET[r.id] ?? {};
    const w = WORDS[r.id] ?? {};
    console.log(`  ${r.id.padEnd(14)} ${String(r.folded).padStart(5)}   ${String(r.tallest ?? '—').padStart(9)}   ${
      `${b.folded ?? '?'} / ${b.tallest ?? '—'}`.padEnd(14)}  ${
      `${r.wordsShut} / ${r.wordsOpen}`.padStart(11)}   ${
      `${w.folded ?? '?'} / ${w.open ?? '?'}`.padEnd(9)}  ${
      `${r.opened}/${r.foldsPainted} folds`.padEnd(13)}  ${r.facilityAt ?? ''}`);
  }
  console.log('');
}
// R159 — AND NO STALL GOES UNREPORTED. The rules above read `stalls` per
// ROW, and not everything this gate walks is a row: the War Room has no
// height budget, so a stall recorded against it would have been collected
// and silently dropped. A gate that records a problem and then loses it is
// worse than one that never looked.
for (const [id, why] of stalls) {
  if (id === 'boot' || rows.some((r) => r.id === id)) continue;
  problems.push(`${id} — THE PAGE DID NOT SETTLE (${why.join('; ')}). Nothing about this screen`
    + ' is reported: it is a starved or cold run rather than a broken screen.');
}
if (problems.length) {
  console.error(`height \u2717  ${problems.length} problem${problems.length === 1 ? '' : 's'} on the day-180 save`
    + (stalls.size
      ? ` \u2014 ${stalls.size} of them a page that never settled, which is a slow box rather than a broken screen`
      : ''));
  for (const p of problems) console.error(`  \u00b7 ${p}`);
  process.exit(1);
}
const opensRows = rows.filter((r) => BUDGET[r.id]?.opens);
console.log(`height ✓  ${rows.length} screens on the day-180 save at ${VIEWPORT}px, every one inside its budget`
  + ` · ${opensRows.length} of them still open, ${opensRows.reduce((n, r) => n + r.opened, 0)} folds walked`
  + ` · Pens ${rows.find((r) => r.id === 'pens')?.tallest}px at its tallest, Foes ${rows.find((r) => r.id === 'dex:foes')?.folded}px shut`
  + ' · every screen settled before it was measured');
