# Tesla hunt — scheduled run instructions

Goal: find 2019+ Teslas (any model) with a clean title and cosmetic/hail damage,
anywhere in the US, where price + fees + $1,500 delivery + tax lands near $10,000.
Email nickcreed11@gmail.com only when there is something new. Never bid or contact sellers.

Criteria live in `src/car-hunt/criteria.ts`. Scoring and the email live in
`src/car-hunt/evaluate.ts`. Don't restate or override them here.

## Each run

1. `npm ci` (if node_modules is missing).

2. Search for listings. Use WebSearch + WebFetch. Cover at least:
   - Copart: clean-title Teslas with hail / minor dent damage
     (e.g. search `site:copart.com tesla hail clean title`, lot pages at copart.com/lot/<n>)
   - IAAI: same (`site:iaai.com tesla hail`)
   - Other auctions that list public: autobidmaster.com, salvagebid.com, bidcars / autoauctionmall
     (these resell Copart/IAAI lots — dedupe by VIN)
   - Retail: cargurus.com, autotrader.com, cars.com, carsforsale.com, facebook marketplace,
     craigslist — searches like `tesla model 3 2019 hail damage clean title`, `tesla hail sale`,
     `hail damaged tesla for sale`
   - Hail-sale dealers and ex-fleet (Hertz Car Sales, rental hail sales)
   Only keep listings you actually opened and read. Don't invent fields: if mileage, VIN or
   title isn't on the page, leave it out.

3. Write every candidate (even ones you think fail — the CLI decides) to
   `/tmp/car-hunt/listings.json` as a JSON array matching `ListingSchema` in
   `src/car-hunt/listing.ts`. See `car-hunt/examples/listings.sample.json`.

4. Build the "already emailed" list from Gmail: search threads with
   `to:nickcreed11@gmail.com subject:"Tesla hunt" newer_than:90d`, read them, and write every
   `Ref: ...` value (one per line) to `/tmp/car-hunt/seen.txt`.

5. Run:
   `npx tsx src/cli.ts car-hunt /tmp/car-hunt/listings.json --seen /tmp/car-hunt/seen.txt --out /tmp/car-hunt/email.json`

6. If `email.json` has `"send": true`, send it with the Gmail connector: to = `to`,
   subject = `subject`, body = `body` as plain text, unchanged. If `"send": false`, send nothing.

7. Don't commit or push anything. End with one line: how many listings you checked, how many emailed.
