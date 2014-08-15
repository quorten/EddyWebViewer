import "../src/oevns";
import "../src/cothread";

/**
 * Cothreaded function to compute the sum of squares from zero up to
 * N^2.
 *
 * Parameters:
 *
 * "n" (args[0]) -- The maximum number to square and to sum.
 *
 * Return value: the sum of squares from zero to N^2.
 */
var computeSumOfSquares = (function() {
  "use strict";

  function startExec() {
    this.n = this.args[0];
    /* Loop progress multiplier: Add one since the loop body
       terminates on `>=' rather than `>'.  */
    this.lpMult = 1 / (this.n + 1);

    this.sum = 0;
    this.i = 1;

    this.status.returnType = CothreadStatus.PREEMPTED;
    this.status.preemptCode = 0;
    this.status.percent = 0;
  }

  function contExec() {
    var n = this.n;
    var lpMult = this.lpMult;
    var sum = this.sum;
    var i = this.i;
    var ctnow = Cothread.now;

    var startTime = ctnow();
    var timeout = this.timeout;
    /* NOTE: In real code, you should avoid calling Cothread.now() in
       tight and fast loop iterations.  Otherwise, the function call
       overhead will subtract a significant amount of computational
       time from the loop body.  */
    while (ctnow() - startTime < timeout && i <= n) {
      sum += i * i;
      i++;
    }

    this.setExitStatus(i <= n);
    if (i > n)
      this.retVal = sum;
    this.status.preemptCode = 0; // Not useful for such a simple function.
    this.status.percent = i * CothreadStatus.MAX_PERCENT * lpMult;

    this.sum = sum;
    this.i = i;
    return this.status;
  }

  return new Cothread(startExec, contExec);
})();

OEV.computeSumOfSquares = computeSumOfSquares;

// We need to close the OEV namespace.
import "../src/oevnsend";

// Test the cothreaded computation unit.

/* Play around with different values for the timeouts and the constant
   `N' and see how your browser responds.  */

function execTime() {
  var status = OEV.computeSumOfSquares.continueCT();
  document.getElementById("progElmt").innerHTML =
    (status.percent * 100 / OEV.CothreadStatus.MAX_PERCENT).toFixed(2) + "%";

  if (status.returnType == OEV.CothreadStatus.FINISHED) {
    var resultElmt = document.createElement("p");
    resultElmt.id = "resultElmt";
    resultElmt.innerHTML = "Result: " + OEV.computeSumOfSquares.retVal;
    document.documentElement.children[1].appendChild(resultElmt);
    return;
  }
  return browserTime();
}

function browserTime() {
  /* Note: If a cothread should use all available processing time yet
     still let the browser stay responsive,
     `window.requestAnimationFrame()' should be used instead.
     Otherwise, any value larger than zero can be used to throttle a
     task to use only a fraction of available processing time.  */
  return window.setTimeout(execTime, 80);
}

function setup() {
  /* Append a progress counter element to the document body, assuming
     that the <body> element is the second child of the
     documentElement.  */
  var progElmt = document.createElement("p");
  progElmt.id = "progElmt";
  progElmt.innerHTML = "Please wait...";
  document.documentElement.children[1].appendChild(progElmt);

  OEV.computeSumOfSquares.timeout = 15;
  OEV.computeSumOfSquares.args.push(65536 * 20); // N
  OEV.computeSumOfSquares.start();
  return browserTime();
}
