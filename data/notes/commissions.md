# data/commissions.json

R212: the commissions board. Shady clients ask for a creature built a particular way, by its anatomy; showing one a chimera that fits pays and closes the commission, and the creature stays home. Read by `campaign/commissions.js` (lazy, with the War Room and the walker) and, for its clock alone, by `commissionWindows` in `campaign/mission.js`, which is eager because the Ranch's agenda counts the board on the first frame. This file rides the second round (`BOARD` in data/loader.js): nothing on the first frame asks what a client wants, and until it lands the agenda counts nothing.

NOTHING ABOUT A COMMISSION IS STORED UNTIL IT IS FILLED. The board at any instant is a pure function of the save's seed, the clock and `campaign.commissionsDone`, so a deadline is a timestamp that settles on load by being read: a week away is a week of clients who came and went, with no tick work and nothing to migrate. `commissionsDone` holds only the ids of windows still open (a fill drops the lapsed ones), and `commissionCount` counts every fill, for the field guide.

EVERY REQUEST IS SATISFIABLE BY CONSTRUCTION. A commission starts as a witness: a body put together from parts of species the catalogue sells (`mailOrderPrice`), on a frame, in the bays the LOWEST Theater tier that builds that frame opens. The request is then read off what that body turned out to be, through the same `analyze` and `movesFromTokens` the battle reads. So new species, parts, tags and frames make new commissions without anybody writing one, and smoke's census proves the witness of every commission it generates splices on that tier and answers its own request.

## board

The clock. Window k is posted at the save's own phase (a hash of the seed, so two saves do not share a shift change) plus k times `everyHours`, and lapses `lastsHours` later; one commission per window, so `lastsHours / everyHours` are open at once. `tries` is how many witnesses a kind gets before the next kind is tried; `skip` is the chance each non-head bay is left empty on a witness, so requests do not all describe a fully loaded body; `massStep` rounds a frame request's mass ceiling up to the next multiple, strictly above the witness's own mass.

## kinds

What a client may ask about, drawn uniformly from this list (repeat a kind to weight it). `anatomy`: two parts by slot and tag ("wings and a venom organ"). `class`: the creature's class and a move tag it carries, never the tag that names the class itself. `frame`: a chassis and a mass ceiling. `species`: how many species in one body, and one of them by name. Every kind but `frame` builds its witness on a frame the first Theater tier grants, so a new lab can answer it; a `frame` request may name any chassis, and is a reason to buy the tier that builds it.

## pay

Multiplies a cash reward by the kind of request, because a mass ceiling on a named chassis is harder to answer than two parts.

## rewards

Weighted. `funds` pays a cash amount in the range (times `pay`, rounded to ten); `notoriety` raises the meter by an amount in the range; `part` gives one token of a part the catalogue sells, at `grade`, through the Vault's door for a yield that cannot be refused (a full shelf renders it and pays for it).

## clients

Who is asking. One is drawn per commission from the same seeded stream.

## slots

How a part is described by its slot and tag when `nouns` has nothing better: `{a}` is the article for the tag, `{tag}` the tag in lower case. A slot this map does not name falls back to the copy line `commission.noun`.

## nouns

Flavour for particular slot-and-tag pairs ("wings" for Airborne forelimbs). Keyed `slot:tag`; anything not here uses `slots`.
