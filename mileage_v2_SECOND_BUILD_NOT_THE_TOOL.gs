/* SECOND DRAFT from the episode (the answer to prompt 2). NOT THE TOOL — kept so you can see what was wrong. */
/* SECOND DRAFT — the answer to prompt 2, kept for the episode. NOT THE TOOL.
   Given the rule, it still splits from the referee three ways:
   (1) the rate switch is written "after July 1", so trips driven ON July 1 get the old 72.5 cents;
   (2) when a row has both odometer readings and typed miles, it trusts the typed miles;
   (3) it drops fractions of a cent (rounds every trip DOWN) instead of rounding half a cent up. */
var MILEAGE_V2 = (function () {
  function norm(s) { return String(s == null ? "" : s).trim(); }
  function iso(s) {
    var a = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(norm(s)), b = /^(\d{4})-(\d{2})-(\d{2})$/.exec(norm(s));
    if (a) return a[3] + "-" + ("0" + a[1]).slice(-2) + "-" + ("0" + a[2]).slice(-2);
    if (b) return norm(s);
    return null;
  }
  function num(s) { var t = norm(s).replace(/[$,]/g, ""); return t === "" || isNaN(+t) ? null : +t; }
  function run(rows) {
    var h = rows[0].map(function (x) { return norm(x).toLowerCase(); });
    var c = {}; ["date driven", "employee", "from", "to", "odometer start", "odometer end", "miles", "purpose", "amount paid"].forEach(function (k) { c[k] = h.indexOf(k); });
    var trips = [], refused = [], seen = {}, by = {}, order = [];
    for (var i = 1; i < rows.length; i++) {
      var r = rows[i], e = norm(r[c["employee"]]);
      if (!e && !norm(r[c["date driven"]])) continue;
      var d = iso(r[c["date driven"]]);
      if (!d) { refused.push({ row: i + 1, reason: "unreadable date" }); continue; }
      if (!e) { refused.push({ row: i + 1, reason: "no employee" }); continue; }
      if (!norm(r[c["purpose"]])) { refused.push({ row: i + 1, reason: "no purpose" }); continue; }
      var typed = num(r[c["miles"]]), o1 = num(r[c["odometer start"]]), o2 = num(r[c["odometer end"]]);
      var miles = typed != null ? typed : (o1 != null && o2 != null ? o2 - o1 : null);           // (2) typed miles win
      if (miles == null || miles <= 0) { refused.push({ row: i + 1, reason: "no miles" }); continue; }
      var key = [e.toLowerCase(), d, norm(r[c["from"]]).toLowerCase(), norm(r[c["to"]]).toLowerCase(), norm(r[c["odometer start"]]), norm(r[c["odometer end"]]), norm(r[c["miles"]])].join("|");
      if (seen[key]) { refused.push({ row: i + 1, reason: "duplicate" }); continue; }
      seen[key] = 1;
      if (d < "2026-01-01" || d > "2026-12-31") { refused.push({ row: i + 1, reason: "no rate for this date" }); continue; }
      var rate = d > "2026-07-01" ? 0.76 : 0.725;                                                 // (1) "after", not "on or after"
      var owedC = Math.floor(Math.round(miles * 10) * Math.round(rate * 1000) / 100);              // (3) fractions of a cent dropped
      var paidC = Math.round((num(r[c["amount paid"]]) || 0) * 100);
      trips.push({ row: i + 1, employee: e, date: d, miles: Math.round(miles * 10), rate: rate, owed: owedC, paid: paidC });
      if (!by[e.toLowerCase()]) { by[e.toLowerCase()] = { employee: e, trips: 0, miles: 0, owed: 0, paid: 0 }; order.push(e.toLowerCase()); }
      var x = by[e.toLowerCase()]; x.trips++; x.miles += Math.round(miles * 10); x.owed += owedC; x.paid += paidC;
    }
    var emps = order.map(function (k) { var x = by[k]; x.diff = x.paid - x.owed; return x; });
    var over = 0, under = 0, owed = 0, paid = 0;
    emps.forEach(function (x) { owed += x.owed; paid += x.paid; if (x.diff > 0) over += x.diff; else under -= x.diff; });
    return { trips: trips, refused: refused, employees: emps, totals: { checked: trips.length, refused: refused.length, owed: owed, paid: paid, overpaid: over, underpaid: under } };
  }
  return { run: run };
})();

/* the Sheets side of the SECOND DRAFT — NOT THE TOOL */
function onOpen() { SpreadsheetApp.getUi().createMenu("Mileage").addItem("Check mileage", "checkMileage").addToUi(); }
function checkMileage() {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), R = MILEAGE_V2.run(ss.getSheetByName("Trips").getDataRange().getDisplayValues());
  var m = function (c) { return (c < 0 ? "-" : "") + "$" + (Math.abs(c) / 100).toFixed(2); };
  var out = [["Employee", "Trips", "Miles", "Owed", "Paid", "Paid - owed"]];
  R.employees.forEach(function (e) { out.push([e.employee, e.trips, (e.miles / 10).toFixed(1), m(e.owed), m(e.paid), m(e.diff)]); });
  out.push(["Checked " + R.totals.checked, "Refused " + R.totals.refused, "", m(R.totals.owed), m(R.totals.paid), "under " + m(R.totals.underpaid) + " / over " + m(R.totals.overpaid)]);
  R.refused.forEach(function (x) { out.push(["row " + x.row, x.reason, "", "", "", ""]); });
  var sh = ss.getSheetByName("Mileage Check") || ss.insertSheet("Mileage Check"); sh.clearContents(); sh.getRange(1, 1, out.length, 6).setValues(out);
}
