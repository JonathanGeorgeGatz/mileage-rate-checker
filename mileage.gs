/* ============================================================================
   THE MILEAGE RATE CHECKER — Build It With AI, Episode 30 (free giveaway)
   Google Sheets + Apps Script. It reads your own mileage log; it pays, sends and uploads nothing.

   Tabs it reads (row 1 = headers, any order, extra columns ignored):
     Trips    : Date driven | Employee | From | To | Odometer start | Odometer end | Miles | Purpose |
                Amount paid   (optional: Date submitted, Rate paid)
     Settings : From | To | Rate per mile      (your own rate table, one row per date range)
                Leave Settings out and it uses the 2026 IRS business rates: 72.5 cents a mile for
                Jan 1 – June 30, 2026 and 76 cents a mile on or after July 1, 2026
                (IRS Notice 2026-10 as modified by Announcement 2026-11, July 13, 2026).

   The rule it applies: every trip is paid at the rate for the DATE IT WAS DRIVEN — never the date it was
   submitted or paid. Miles come from the odometer when both readings are there; typed miles that disagree
   with the odometer are refused, not guessed. Each trip is rounded to the cent (half a cent rounds up).
   Using the IRS rate is a company choice, not tax or legal advice; check your own state's rules.
   ============================================================================ */

/* EP30 — The Mileage Rate Checker — shipped engine core (pure; no I/O, no network). Follows SPEC.md exactly. */
var MILEAGE = (function () {
  var NEED = ["date driven", "employee", "from", "to", "odometer start", "odometer end", "miles", "purpose", "amount paid"];
  var NEED_SET = ["from", "to", "rate per mile"];
  var BANNER = "DO NOT TRUST THESE MILEAGE TOTALS";
  var DEFAULT_RATES = [{ from: "2026-01-01", to: "2026-06-30", mills: 725 }, { from: "2026-07-01", to: "2026-12-31", mills: 760 }];

  function norm(s) { return String(s == null ? "" : s).replace(/\s+/g, " ").trim(); }
  function fold(s) { return norm(s).toLowerCase(); }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function parseDate(s) {
    var t = norm(s), y, m, d, a;
    if ((a = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t))) { y = +a[1]; m = +a[2]; d = +a[3]; }
    else if ((a = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t))) { m = +a[1]; d = +a[2]; y = +a[3]; }
    else return null;
    if (m < 1 || m > 12 || d < 1) return null;
    var dim = [31, (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
    if (d > dim) return null;
    return y + "-" + pad(m) + "-" + pad(d);
  }
  function tenths(s) {                                   // "48,213.4" -> 482134 ; null if unreadable
    var t = norm(s);
    if (!/^(\d{1,3}(,\d{3})+|\d+)(\.\d)?$/.test(t)) return null;
    t = t.replace(/,/g, "");
    var p = t.split(".");
    return parseInt(p[0], 10) * 10 + (p[1] ? parseInt(p[1], 10) : 0);
  }
  function mills(s) {                                    // "$0.725" -> 725 ; null if unreadable or zero
    var t = norm(s).replace(/^\$/, "");
    if (!/^\d+(\.\d{1,3})?$/.test(t)) return null;
    var p = t.split(".");
    var v = parseInt(p[0], 10) * 1000 + (p[1] ? parseInt((p[1] + "00").slice(0, 3), 10) : 0);
    return v > 0 ? v : null;
  }
  function cents(s) {
    var t = norm(s).replace(/^\$/, "");
    if (!/^(\d{1,3}(,\d{3})+|\d+)(\.\d{1,2})?$/.test(t)) return null;
    t = t.replace(/,/g, "");
    var p = t.split(".");
    return parseInt(p[0], 10) * 100 + (p[1] ? parseInt((p[1] + "0").slice(0, 2), 10) : 0);
  }
  function money(c) {
    var neg = c < 0; c = Math.abs(c);
    var s = Math.floor(c / 100) + "." + pad(c % 100);
    return (neg ? "−" : "") + "$" + s.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }
  function rateStr(m) { return "$" + Math.floor(m / 1000) + "." + ("00" + (m % 1000)).slice(-3); }
  function milesStr(t) { return Math.floor(t / 10) + "." + (t % 10); }
  function owedCents(t, m) { return Math.floor((t * m + 50) / 100); }

  function headerMap(rows, need) {
    if (!rows || !rows.length) return null;
    var h = rows[0].map(fold), m = {};
    for (var i = 0; i < need.length; i++) { var k = h.indexOf(need[i]); if (k < 0) return null; m[need[i]] = k; }
    return m;
  }
  function optCol(rows, name) { return rows && rows.length ? rows[0].map(fold).indexOf(name) : -1; }
  function blank(row, idx) { for (var k in idx) if (norm(row[idx[k]]) !== "") return false; return true; }

  function readRates(setRows) {
    var out = { ranges: [], refusals: [], usedDefault: false, headerBad: false, bad: false };
    var hasData = setRows && setRows.length > 1 && setRows.slice(1).some(function (r) { return r.some(function (c) { return norm(c) !== ""; }); });
    if (!setRows || !hasData) { out.usedDefault = true; out.ranges = DEFAULT_RATES.slice(); return out; }
    var sm = headerMap(setRows, NEED_SET);
    if (!sm) { out.headerBad = true; out.bad = true; return out; }
    for (var i = 1; i < setRows.length; i++) {
      var r = setRows[i]; if (blank(r, sm)) continue;
      var f = parseDate(r[sm["from"]]), t = parseDate(r[sm["to"]]), m = mills(r[sm["rate per mile"]]);
      if (!f || !t) { out.refusals.push({ row: i + 1, reason: "unreadable date" }); continue; }
      if (t < f) { out.refusals.push({ row: i + 1, reason: "To is before From" }); continue; }
      if (m == null) { out.refusals.push({ row: i + 1, reason: "unreadable rate" }); continue; }
      out.ranges.push({ from: f, to: t, mills: m, row: i + 1 });
    }
    if (out.refusals.length) out.bad = true;
    var s = out.ranges.slice().sort(function (a, b) { return a.from < b.from ? -1 : a.from > b.from ? 1 : 0; });
    for (var j = 1; j < s.length; j++) if (s[j].from <= s[j - 1].to) { out.bad = true; out.overlap = true; }
    return out;
  }
  function rateFor(ranges, d) {
    for (var i = 0; i < ranges.length; i++) if (ranges[i].from <= d && d <= ranges[i].to) return ranges[i].mills;
    return null;
  }

  function run(tripRows, setRows) {
    var RT = readRates(setRows);
    var reasons = [];
    if (RT.headerBad) reasons.push("header row unreadable: Settings");
    var tm = headerMap(tripRows, NEED);
    var ratePaidCol = optCol(tripRows, "rate paid");
    var rowsIn = 0, checked = [], excluded = [], refused = [];
    if (!tm) {
      reasons.unshift("header row unreadable: Trips");
      for (var q = 1; q < (tripRows ? tripRows.length : 0); q++) {
        if (tripRows[q].every(function (c) { return norm(c) === ""; })) continue;
        rowsIn++; refused.push({ row: q + 1, employee: "", reason: "Trips header row unreadable" });
      }
    } else {
      var seen = {};
      for (var i = 1; i < tripRows.length; i++) {
        var r = tripRows[i]; if (blank(r, tm)) continue;
        rowsIn++;
        var rn = i + 1, emp = norm(r[tm["employee"]]);
        var date = parseDate(r[tm["date driven"]]);
        if (!date) { refused.push({ row: rn, employee: emp, reason: "unreadable date driven" }); continue; }
        if (!emp) { refused.push({ row: rn, employee: "", reason: "no employee" }); continue; }
        if (!norm(r[tm["purpose"]])) { refused.push({ row: rn, employee: emp, reason: "no business purpose" }); continue; }
        var o1s = norm(r[tm["odometer start"]]), o2s = norm(r[tm["odometer end"]]), ms = norm(r[tm["miles"]]);
        var o1 = null, o2 = null, odoMiles = null, typed = null;
        if ((o1s === "") !== (o2s === "")) { refused.push({ row: rn, employee: emp, reason: "odometer start and end must both be filled" }); continue; }
        if (o1s !== "") {
          o1 = tenths(o1s); o2 = tenths(o2s);
          if (o1 == null || o2 == null) { refused.push({ row: rn, employee: emp, reason: "unreadable odometer" }); continue; }
          if (o2 <= o1) { refused.push({ row: rn, employee: emp, reason: "odometer end is not after start" }); continue; }
          odoMiles = o2 - o1;
        }
        if (ms !== "") {
          typed = tenths(ms);
          if (typed == null || typed === 0) { refused.push({ row: rn, employee: emp, reason: "unreadable miles" }); continue; }
        }
        if (odoMiles != null && typed != null && odoMiles !== typed) {
          refused.push({ row: rn, employee: emp, reason: "miles typed as " + milesStr(typed) + " don't match the odometer (" + milesStr(odoMiles) + ")" }); continue;
        }
        if (odoMiles == null && typed == null) { refused.push({ row: rn, employee: emp, reason: "no miles and no odometer" }); continue; }
        var miles = odoMiles != null ? odoMiles : typed;
        var ps = norm(r[tm["amount paid"]]), paid = ps === "" ? 0 : cents(ps);
        if (paid == null) { refused.push({ row: rn, employee: emp, reason: "unreadable amount paid" }); continue; }
        var key = [fold(emp), date, fold(r[tm["from"]]), fold(r[tm["to"]]), o1, o2, typed].join("|");
        if (seen[key]) { refused.push({ row: rn, employee: emp, reason: "duplicate trip — the first row was kept", paid: paid }); continue; }
        seen[key] = 1;
        var rate = RT.bad ? null : rateFor(RT.ranges, date);
        if (RT.bad) { excluded.push({ row: rn, employee: emp, reason: "rate table unreadable — nothing priced", paid: paid }); continue; }
        if (rate == null) { excluded.push({ row: rn, employee: emp, reason: "no rate in Settings covers " + date, paid: paid }); continue; }
        var rp = ratePaidCol >= 0 ? mills(r[ratePaidCol]) : null;
        checked.push({ row: rn, employee: emp, key: fold(emp), date: date, from: norm(r[tm["from"]]), to: norm(r[tm["to"]]),
                       o1: o1, o2: o2, miles: miles, mills: rate, owed: owedCents(miles, rate), paid: paid, ratePaid: rp });
      }
      // odometer overlap
      var byEmp = {};
      checked.forEach(function (c) { if (c.o1 != null) (byEmp[c.key] = byEmp[c.key] || []).push(c); });
      var drop = {};
      Object.keys(byEmp).forEach(function (k) {
        var list = byEmp[k].slice().sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : (a.o1 - b.o1) || (a.row - b.row); });
        var kept = null;
        list.forEach(function (c) {
          if (kept && c.o1 < kept.o2) { drop[c.row] = "odometer overlaps row " + kept.row + " — the same miles claimed twice"; }
          else kept = c;
        });
      });
      checked = checked.filter(function (c) {
        if (drop[c.row]) { refused.push({ row: c.row, employee: c.employee, reason: drop[c.row], paid: c.paid }); return false; }
        return true;
      });
      refused.sort(function (a, b) { return a.row - b.row; });
    }
    // money
    var emps = [], byKey = {};
    var order = [];
    if (tm) for (var j = 1; j < tripRows.length; j++) {
      var e = norm(tripRows[j][tm["employee"]]); if (!e) continue;
      if (!byKey.hasOwnProperty(fold(e))) { byKey[fold(e)] = null; order.push([fold(e), e]); }
    }
    byKey = {};
    order.forEach(function (o) { var x = { employee: o[1], key: o[0], trips: 0, miles: 0, owed: 0, paid: 0, diff: 0 }; byKey[o[0]] = x; });
    var owedT = 0, paidT = 0, mism = [];
    checked.forEach(function (c) {
      c.diff = c.paid - c.owed; owedT += c.owed; paidT += c.paid;
      var x = byKey[c.key]; x.trips++; x.miles += c.miles; x.owed += c.owed; x.paid += c.paid;
      if (c.diff !== 0) {
        c.note = (c.ratePaid != null && c.ratePaid !== c.mills) ? "paid at " + rateStr(c.ratePaid) + "/mi; the rate for " + c.date + " is " + rateStr(c.mills) + "/mi"
          : "paid " + money(c.paid) + "; owed " + money(c.owed);
        mism.push(c);
      }
    });
    order.forEach(function (o) { var x = byKey[o[0]]; x.diff = x.paid - x.owed; if (x.trips) emps.push(x); });
    var owedE = 0, paidE = 0, over = 0, under = 0;
    emps.forEach(function (x) { owedE += x.owed; paidE += x.paid; if (x.diff > 0) over += x.diff; else under -= x.diff; });
    var notChecked = 0;
    if (tm) refused.concat(excluded).forEach(function (x) {
      var v = norm(tripRows[x.row - 1][tm["amount paid"]]), c = v === "" ? 0 : cents(v);
      if (c != null) notChecked += c;
    });
    var reconOK = rowsIn === checked.length + excluded.length + refused.length;
    var readdOK = owedT === owedE && paidT === paidE && (paidT - owedT) === over - under;
    if (RT.bad && !RT.headerBad) reasons.push("rate table unreadable");
    if (!reconOK) reasons.push("rows do not add up");
    if (!readdOK) reasons.push("money does not re-add");
    if (rowsIn && refused.length / rowsIn > 0.10) reasons.push("more than 10% of rows refused");
    return {
      rates: { ranges: RT.ranges.map(function (x) { return { from: x.from, to: x.to, mills: x.mills }; }), usedDefault: RT.usedDefault, refusals: RT.refusals, bad: RT.bad },
      trips: checked, employees: emps, mismatches: mism,
      excluded: excluded, refused: refused,
      totals: { rowsIn: rowsIn, checked: checked.length, excluded: excluded.length, refused: refused.length,
                miles: checked.reduce(function (s, c) { return s + c.miles; }, 0),
                owed: owedT, paid: paidT, overpaid: over, underpaid: under, paidNotChecked: notChecked, mismatched: mism.length },
      recon: { ok: reconOK, readdOK: readdOK },
      trust: reasons.length ? BANNER : "OK", trustReasons: reasons
    };
  }
  return { run: run, money: money, rateStr: rateStr, milesStr: milesStr, parseDate: parseDate, BANNER: BANNER };
})();

/* ---------------- the Sheets side: menu, read the tabs, write the report ---------------- */
function onOpen() {
  SpreadsheetApp.getUi().createMenu("Mileage").addItem("Check mileage", "checkMileage").addToUi();
}

function tabValues_(ss, name) {
  var sh = ss.getSheetByName(name);
  if (!sh) return null;
  return sh.getDataRange().getDisplayValues();
}

function checkMileage() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var R = MILEAGE.run(tabValues_(ss, "Trips"), tabValues_(ss, "Settings"));
  var M = MILEAGE.money, T = R.totals, W = 6, out = [];
  function row(a) { while (a.length < W) a.push(""); return a; }
  out.push([R.trust, R.trust === "OK" ? "every count below re-adds" : R.trustReasons.join(" · ")]);
  out.push(["Every trip is paid at the rate for the date it was DRIVEN; miles come from the odometer when both readings are there"]);
  out.push(["Rates used: " + R.rates.ranges.map(function (x) { return x.from + " → " + x.to + " at " + MILEAGE.rateStr(x.mills) + "/mi"; }).join(" · ") +
            (R.rates.usedDefault ? " (no Settings tab: the 2026 IRS business rates)" : "")]);
  out.push([""]);
  out.push(["MILEAGE", T.checked + " trips checked", MILEAGE.milesStr(T.miles) + " miles", "owed " + M(T.owed), "paid " + M(T.paid),
            T.paid >= T.owed ? "overpaid overall " + M(T.paid - T.owed) : "underpaid overall " + M(T.owed - T.paid)]);
  out.push(["BY PERSON", "underpaid " + M(T.underpaid), "overpaid " + M(T.overpaid), T.mismatched + " trips paid the wrong amount",
            "paid on rows not checked " + M(T.paidNotChecked), ""]);
  out.push([""]);
  out.push(["Employee", "Trips", "Miles", "Owed", "Paid", "Paid − owed"]);
  R.employees.forEach(function (e) {
    out.push([e.employee, e.trips, MILEAGE.milesStr(e.miles), M(e.owed), M(e.paid), (e.diff > 0 ? "+" : "") + M(e.diff) + (e.diff > 0 ? " overpaid" : e.diff < 0 ? " underpaid" : "")]);
  });
  out.push([""]);
  out.push(["TRIPS PAID THE WRONG AMOUNT", "Employee", "Date driven", "Miles", "Owed → paid", "Why"]);
  R.mismatches.forEach(function (c) {
    out.push(["row " + c.row, c.employee, c.date, MILEAGE.milesStr(c.miles), M(c.owed) + " → " + M(c.paid), c.note]);
  });
  out.push([""]);
  out.push(["COUNT IN PUBLIC", "rows in " + T.rowsIn, "checked " + T.checked, "set aside " + T.excluded, "refused " + T.refused,
            R.recon.ok ? "adds up" : "DOES NOT ADD UP"]);
  R.excluded.forEach(function (e) { out.push(["row " + e.row, e.employee, "set aside: " + e.reason]); });
  R.refused.forEach(function (e) { out.push(["row " + e.row, e.employee, "refused: " + e.reason]); });
  R.rates.refusals.forEach(function (e) { out.push(["Settings row " + e.row, "", "refused: " + e.reason]); });
  var rep = ss.getSheetByName("Mileage Check") || ss.insertSheet("Mileage Check");
  out = out.map(row);
  rep.clearContents();
  rep.getRange(1, 1, out.length, W).setValues(out);
  rep.getRange(1, 1, 1, W).setFontWeight("bold").setBackground(R.trust === "OK" ? "#e6f2ea" : "#b3261e").setFontColor(R.trust === "OK" ? "#1d4d2b" : "#ffffff");
  return R;
}
