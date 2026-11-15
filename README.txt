THE MILEAGE RATE CHECKER — free giveaway from "Build It With AI" (Episode 30)

What it is
----------
A Google Sheet with one extra menu. It reads your own mileage log and your own rate table,
works out what every trip should have been paid at the rate for the DAY IT WAS DRIVEN, compares
that with what was actually paid, and names who was underpaid and who was overpaid, trip by trip.
It pays nothing, sends nothing and talks to nothing outside your spreadsheet.

Why now
-------
- On December 29, 2025 the IRS set the 2026 business standard mileage rate at 72.5 cents a mile
  (IR-2025-128, Notice 2026-10).
- In July 2026 the IRS raised it to 76 cents a mile for miles driven on or after July 1, 2026
  (Announcement 2026-11, Internal Revenue Bulletin 2026-29, July 13, 2026), citing recent increases
  in the price of fuel. The 72.5-cent rate still applies to miles driven before July 1.
- So a July trip submitted in August and a June trip submitted in August are owed different rates.
  A sheet that switches rates on the date a form came in gets both wrong.

How to set it up (about five minutes)
-------------------------------------
1. Make a new Google Sheet with two tabs named exactly:
     Trips    : Date driven | Employee | From | To | Odometer start | Odometer end | Miles |
                Purpose | Amount paid      (optional: Date submitted, Rate paid)
     Settings : From | To | Rate per mile  (one row per date range, your company's own rates)
   Headers on row 1, any column order, extra columns are ignored. Dates as 7/1/2026 or 2026-07-01.
   Leave Settings out and the sheet uses the 2026 IRS business rates and says so on the report.
   To try it first, File > Import the two sample CSVs from the bundle into those tabs.
2. Extensions > Apps Script. Delete what is there, paste in mileage.gs, save.
3. Reload the sheet. A "Mileage" menu appears. Click Check mileage.
   (The first run asks you to authorize the script to read and write THIS spreadsheet.)
4. Read the "Mileage Check" tab it writes.

The rules it follows (SPEC.md has every one)
--------------------------------------------
- The rate is the one whose date range holds the DATE DRIVEN. A date no rate covers is set aside.
- Miles: odometer end minus start when both are there. Typed miles that don't match are refused,
  with both numbers. Only typed miles, no odometer: the typed miles are used.
- No employee, no business purpose, an unreadable date or amount: refused, with row and reason.
- The same person, date, route and odometer twice: the first row is kept, the copy refused.
- One person's odometer readings overlapping: the later trip is refused, naming the row it overlaps.
- Money in whole cents: each trip is miles x rate, rounded to the cent, half a cent up.

If the top line of the report says DO NOT TRUST THESE MILEAGE TOTALS, believe it: a header row was
unreadable, the rate table was unreadable (nothing is priced then), the rows did not add up
(rows in = checked + set aside + refused), the money did not re-add by trip and by person, or more
than 10% of the rows were refused. The reason is printed beside it.

In the bundle (Mileage_Rate_Checker_BUNDLE.zip)
-----------------------------------------------
- mileage.gs                 the tool (paste into Apps Script)
- sample_trips.csv, sample_settings.csv
                             Fernhollow Home Care: a made-up agency, made-up aides, made-up trips.
                             Replace them with your own.
- checker.py                 independent Python checker, written from the rules alone —
                             run: python3 checker.py sample_trips.csv sample_settings.csv
- mileage_v1_FIRST_BUILD_NOT_THE_TOOL.gs   the first build from the episode — WRONG
- mileage_v2_SECOND_BUILD_NOT_THE_TOOL.gs  the second build — closer, still wrong three ways
- PROMPTS.txt                the three prompts, word for word, in the order they were sent
- SPEC.md                    the written rules both the sheet and the checker follow

Honest limits
-------------
Paying the IRS rate is a company choice. The IRS says use of the standard mileage rates is optional,
and federal wage law does not require that rate; some states (California, Illinois and Massachusetts
among them) require employers to reimburse necessary business expenses. This sheet pays every
checked trip at YOUR rate table and nothing else. It does not decide what counts as commuting or
personal driving, it does not know fixed-and-variable-rate plans or other countries' rates, and it
does not do taxes. It is only as good as the log you give it. Sample data is fictional.
Not tax, legal or payroll advice; check anything that matters with your accountant.
