#!/usr/bin/env python3
"""THE REFEREE — an independent check of the Mileage Rate Checker, written from SPEC.md alone (it never
reads the sheet's code). Same inputs, same rules, its own arithmetic (Python Fractions, no floats).
usage: python3 checker.py trips.csv [settings.csv] [--json]"""
import csv, json, re, sys
from datetime import date
from fractions import Fraction

NEED = ["date driven", "employee", "from", "to", "odometer start", "odometer end", "miles", "purpose", "amount paid"]
DEFAULT = [("2026-01-01", "2026-06-30", Fraction(725, 1000)), ("2026-07-01", "2026-12-31", Fraction(76, 100))]
BANNER = "DO NOT TRUST THESE MILEAGE TOTALS"

def load(path):
    if not path: return None
    try:
        with open(path, newline="") as f: return [r for r in csv.reader(f)]
    except FileNotFoundError: return None

def clean(s): return " ".join(str(s if s is not None else "").split())
def low(s): return clean(s).lower()

def a_date(s):
    t = clean(s)
    m = re.fullmatch(r"(\d{4})-(\d{2})-(\d{2})", t)
    if m: y, mo, d = int(m[1]), int(m[2]), int(m[3])
    else:
        m = re.fullmatch(r"(\d{1,2})/(\d{1,2})/(\d{4})", t)
        if not m: return None
        mo, d, y = int(m[1]), int(m[2]), int(m[3])
    try: return date(y, mo, d).isoformat()
    except ValueError: return None

def a_distance(s):                      # Fraction of miles, one decimal max, commas as thousands separators
    t = clean(s)
    if not re.fullmatch(r"(\d{1,3}(,\d{3})+|\d+)(\.\d)?", t): return None
    return Fraction(t.replace(",", ""))

def a_rate(s):
    t = clean(s)
    if t.startswith("$"): t = t[1:]
    if not re.fullmatch(r"\d+(\.\d{1,3})?", t): return None
    v = Fraction(t)
    return v if v > 0 else None

def a_money(s):
    t = clean(s)
    if t.startswith("$"): t = t[1:]
    if not re.fullmatch(r"(\d{1,3}(,\d{3})+|\d+)(\.\d{1,2})?", t): return None
    return int(Fraction(t.replace(",", "")) * 100)

def one_decimal(f): return "%d.%d" % (int(f), int((f * 10) % 10))
def rate_txt(r): return "$%d.%03d" % (int(r), int((r * 1000) % 1000))
def dollars(c):
    sign = "−" if c < 0 else ""
    c = abs(c)
    return "%s$%s.%02d" % (sign, "{:,}".format(c // 100), c % 100)

def rate_table(rows):
    """returns (ranges, used_default, header_bad, bad, refusals)"""
    data = [r for r in (rows or [])[1:] if any(clean(c) for c in r)] if rows else []
    if not rows or not data:
        return DEFAULT, True, False, False, []
    head = [low(c) for c in rows[0]]
    if not all(k in head for k in ("from", "to", "rate per mile")): return [], False, True, True, []
    cf, ct, cr = head.index("from"), head.index("to"), head.index("rate per mile")
    ranges, refusals = [], []
    for n, r in enumerate(rows[1:], start=2):
        cell = lambda k: r[k] if k < len(r) else ""
        if all(clean(cell(k)) == "" for k in (cf, ct, cr)): continue
        f, t, rt = a_date(cell(cf)), a_date(cell(ct)), a_rate(cell(cr))
        if not f or not t: refusals.append({"row": n, "reason": "unreadable date"}); continue
        if t < f: refusals.append({"row": n, "reason": "To is before From"}); continue
        if rt is None: refusals.append({"row": n, "reason": "unreadable rate"}); continue
        ranges.append((f, t, rt))
    bad = bool(refusals)
    srt = sorted(ranges)
    for a, b in zip(srt, srt[1:]):
        if b[0] <= a[1]: bad = True
    return ranges, False, False, bad, refusals

def check(trips, settings):
    ranges, used_default, set_head_bad, rates_bad, rate_refusals = rate_table(settings)
    reasons = []
    if set_head_bad: reasons.append("header row unreadable: Settings")
    head = [low(c) for c in trips[0]] if trips else []
    ok_head = bool(trips) and all(k in head for k in NEED)
    col = {k: head.index(k) for k in NEED} if ok_head else {}
    rate_paid_col = head.index("rate paid") if "rate paid" in head else -1
    get = lambda r, k: (r[col[k]] if col[k] < len(r) else "")
    rows_in, kept, aside, refused = 0, [], [], []
    if not ok_head:
        reasons.insert(0, "header row unreadable: Trips")
        for n, r in enumerate((trips or [])[1:], start=2):
            if all(clean(c) == "" for c in r): continue
            rows_in += 1; refused.append({"row": n, "employee": "", "reason": "Trips header row unreadable"})
    else:
        seen = set()
        for n, r in enumerate(trips[1:], start=2):
            if all(clean(get(r, k)) == "" for k in NEED): continue
            rows_in += 1
            emp = clean(get(r, "employee"))
            def no(why): refused.append({"row": n, "employee": emp, "reason": why})
            d = a_date(get(r, "date driven"))
            if not d: no("unreadable date driven"); continue
            if not emp: no("no employee"); continue
            if not clean(get(r, "purpose")): no("no business purpose"); continue
            s1, s2, sm = clean(get(r, "odometer start")), clean(get(r, "odometer end")), clean(get(r, "miles"))
            if bool(s1) != bool(s2): no("odometer start and end must both be filled"); continue
            o1 = o2 = odo = typed = None
            if s1:
                o1, o2 = a_distance(s1), a_distance(s2)
                if o1 is None or o2 is None: no("unreadable odometer"); continue
                if not o2 > o1: no("odometer end is not after start"); continue
                odo = o2 - o1
            if sm:
                typed = a_distance(sm)
                if typed is None or typed == 0: no("unreadable miles"); continue
            if odo is not None and typed is not None and odo != typed:
                no("miles typed as %s don't match the odometer (%s)" % (one_decimal(typed), one_decimal(odo))); continue
            if odo is None and typed is None: no("no miles and no odometer"); continue
            miles = odo if odo is not None else typed
            ps = clean(get(r, "amount paid"))
            paid = 0 if ps == "" else a_money(ps)
            if paid is None: no("unreadable amount paid"); continue
            ident = (emp.lower(), d, low(get(r, "from")), low(get(r, "to")), o1, o2, typed)
            if ident in seen: no("duplicate trip — the first row was kept"); continue
            seen.add(ident)
            if rates_bad:
                aside.append({"row": n, "employee": emp, "reason": "rate table unreadable — nothing priced"}); continue
            rate = next((x[2] for x in ranges if x[0] <= d <= x[1]), None)
            if rate is None:
                aside.append({"row": n, "employee": emp, "reason": "no rate in Settings covers " + d}); continue
            rp = a_rate(r[rate_paid_col]) if 0 <= rate_paid_col < len(r) else None
            exact = miles * rate * 100                                   # exact cents
            owed = int(exact) + (1 if exact - int(exact) >= Fraction(1, 2) else 0)
            kept.append({"row": n, "employee": emp, "who": emp.lower(), "date": d, "o1": o1, "o2": o2, "miles": miles,
                         "rate": rate, "owed": owed, "paid": paid, "rate_paid": rp})
        # odometer overlap, per employee
        dropped = {}
        groups = {}
        for t in kept:
            if t["o1"] is not None: groups.setdefault(t["who"], []).append(t)
        for who, lst in groups.items():
            last = None
            for t in sorted(lst, key=lambda x: (x["date"], x["o1"], x["row"])):
                if last is not None and t["o1"] < last["o2"]:
                    dropped[t["row"]] = "odometer overlaps row %d — the same miles claimed twice" % last["row"]
                else:
                    last = t
        for t in [t for t in kept if t["row"] in dropped]:
            refused.append({"row": t["row"], "employee": t["employee"], "reason": dropped[t["row"]]})
        kept = [t for t in kept if t["row"] not in dropped]
        refused.sort(key=lambda x: x["row"])
    # employees in order of first appearance in the Trips tab
    order, first = [], {}
    if ok_head:
        for r in trips[1:]:
            e = clean(get(r, "employee"))
            if e and e.lower() not in first: first[e.lower()] = e; order.append(e.lower())
    emp = {w: {"employee": first[w], "trips": 0, "miles": Fraction(0), "owed": 0, "paid": 0} for w in order}
    mism = []
    for t in kept:
        x = emp[t["who"]]; x["trips"] += 1; x["miles"] += t["miles"]; x["owed"] += t["owed"]; x["paid"] += t["paid"]
        t["diff"] = t["paid"] - t["owed"]
        if t["diff"]:
            if t["rate_paid"] is not None and t["rate_paid"] != t["rate"]:
                t["note"] = "paid at %s/mi; the rate for %s is %s/mi" % (rate_txt(t["rate_paid"]), t["date"], rate_txt(t["rate"]))
            else:
                t["note"] = "paid %s; owed %s" % (dollars(t["paid"]), dollars(t["owed"]))
            mism.append(t)
    people = [emp[w] for w in order if emp[w]["trips"]]
    over = under = 0
    for p in people:
        p["diff"] = p["paid"] - p["owed"]
        if p["diff"] > 0: over += p["diff"]
        else: under += -p["diff"]
    owed_t, paid_t = sum(t["owed"] for t in kept), sum(t["paid"] for t in kept)
    owed_p, paid_p = sum(p["owed"] for p in people), sum(p["paid"] for p in people)
    not_checked = 0
    if ok_head:
        for x in refused + aside:
            r = trips[x["row"] - 1]; v = clean(get(r, "amount paid"))
            c = 0 if v == "" else a_money(v)
            if c is not None: not_checked += c
    recon = rows_in == len(kept) + len(aside) + len(refused)
    readd = owed_t == owed_p and paid_t == paid_p and (paid_t - owed_t) == over - under
    if rates_bad and not set_head_bad: reasons.append("rate table unreadable")
    if not recon: reasons.append("rows do not add up")
    if not readd: reasons.append("money does not re-add")
    if rows_in and Fraction(len(refused), rows_in) > Fraction(1, 10): reasons.append("more than 10% of rows refused")
    tenths = lambda f: int(f * 10)
    return {
        "trust": BANNER if reasons else "OK", "trustReasons": reasons,
        "totals": {"rowsIn": rows_in, "checked": len(kept), "excluded": len(aside), "refused": len(refused),
                   "miles": tenths(sum((t["miles"] for t in kept), Fraction(0))), "owed": owed_t, "paid": paid_t,
                   "overpaid": over, "underpaid": under, "paidNotChecked": not_checked, "mismatched": len(mism)},
        "recon": {"ok": recon, "readdOK": readd},
        "rates": {"usedDefault": used_default, "bad": rates_bad, "refusals": rate_refusals,
                  "ranges": [[a, b, int(r * 1000)] for a, b, r in ranges]},
        "employees": [[p["employee"], p["trips"], tenths(p["miles"]), p["owed"], p["paid"], p["diff"]] for p in people],
        "trips": [[t["row"], t["employee"], t["date"], tenths(t["miles"]), int(t["rate"] * 1000), t["owed"], t["paid"]] for t in kept],
        "mismatches": [[t["row"], t["note"]] for t in mism],
        "refused": [[x["row"], x["employee"], x["reason"]] for x in refused],
        "excluded": [[x["row"], x["employee"], x["reason"]] for x in aside],
    }

if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    R = check(load(args[0]), load(args[1]) if len(args) > 1 else None)
    if "--json" in sys.argv: print(json.dumps(R)); sys.exit(0)
    t = R["totals"]
    print(R["trust"], "·", " · ".join(R["trustReasons"]) or "every count re-adds")
    print("rows in %d = checked %d + set aside %d + refused %d" % (t["rowsIn"], t["checked"], t["excluded"], t["refused"]))
    print("owed %s · paid %s · overpaid %s · underpaid %s" % (dollars(t["owed"]), dollars(t["paid"]), dollars(t["overpaid"]), dollars(t["underpaid"])))
    for e in R["employees"]:
        print("  %-16s %2d trips %7s mi  owed %s  paid %s  %s" % (e[0], e[1], one_decimal(Fraction(e[2], 10)), dollars(e[3]), dollars(e[4]), dollars(e[5])))
    for x in R["refused"]: print("  refused row %d: %s" % (x[0], x[2]))
    for x in R["excluded"]: print("  set aside row %d: %s" % (x[0], x[2]))
