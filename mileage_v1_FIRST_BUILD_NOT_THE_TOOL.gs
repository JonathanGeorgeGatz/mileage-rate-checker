/* FIRST DRAFT from the episode (the answer to prompt 1). NOT THE TOOL — kept so you can see what was wrong. */
/* FIRST DRAFT — the answer to prompt 1, kept for the episode. NOT THE TOOL.
   Real faults: one flat rate all year (the rate the prompt gave it), the Miles column taken on trust (odometers
   never read), every row counted (a duplicate twice, last December's trip, a trip with no purpose), money in
   floating point rounded only at the end. */
var MILEAGE_V1 = (function () {
  function run(rows) {
    var h = rows[0].map(function (x) { return String(x).trim().toLowerCase(); });
    var iE = h.indexOf("employee"), iM = h.indexOf("miles"), iP = h.indexOf("amount paid");
    var RATE = 0.725, by = {}, order = [];
    for (var i = 1; i < rows.length; i++) {
      var e = String(rows[i][iE]).trim(); if (!e) continue;
      var miles = parseFloat(String(rows[i][iM]).replace(/,/g, "")) || 0;
      var paid = parseFloat(String(rows[i][iP]).replace(/[$,]/g, "")) || 0;
      if (!by[e]) { by[e] = { employee: e, trips: 0, miles: 0, owed: 0, paid: 0 }; order.push(e); }
      by[e].trips++; by[e].miles += miles; by[e].owed += miles * RATE; by[e].paid += paid;
    }
    var emps = order.map(function (e) { var x = by[e]; x.diff = x.paid - x.owed; return x; });
    var owed = 0, paid = 0, miles = 0, trips = 0;
    emps.forEach(function (x) { owed += x.owed; paid += x.paid; miles += x.miles; trips += x.trips; });
    return { employees: emps, totals: { trips: trips, miles: miles, owed: Math.round(owed * 100) / 100, paid: Math.round(paid * 100) / 100,
             diff: Math.round((paid - owed) * 100) / 100 } };
  }
  return { run: run };
})();

/* the Sheets side of the FIRST DRAFT — NOT THE TOOL */
function onOpen() { SpreadsheetApp.getUi().createMenu("Mileage").addItem("Check mileage", "checkMileage").addToUi(); }
function checkMileage() {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), R = MILEAGE_V1.run(ss.getSheetByName("Trips").getDataRange().getDisplayValues());
  var out = [["Employee", "Trips", "Miles", "Owed", "Paid", "Difference"]];
  R.employees.forEach(function (e) { out.push([e.employee, e.trips, e.miles.toFixed(1), "$" + e.owed.toFixed(2), "$" + e.paid.toFixed(2), (e.diff >= 0 ? "OVERPAID $" : "UNDERPAID $") + Math.abs(e.diff).toFixed(2)]); });
  out.push(["TOTAL", R.totals.trips, R.totals.miles.toFixed(1), "$" + R.totals.owed.toFixed(2), "$" + R.totals.paid.toFixed(2), (R.totals.diff >= 0 ? "OVERPAID $" : "UNDERPAID $") + Math.abs(R.totals.diff).toFixed(2)]);
  var sh = ss.getSheetByName("Mileage Check") || ss.insertSheet("Mileage Check"); sh.clearContents(); sh.getRange(1, 1, out.length, 6).setValues(out);
}
