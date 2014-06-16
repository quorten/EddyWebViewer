import "../src/cothread";

/**
 * Compute the sum of squares from zero up to N^2.
 *
 * Parameters:
 *
 * "n" (args[0]) -- The maximum number squared to sum.
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
  }

  function contExec() {
    var n = this.n;
    var lpMult = this.lpMult;
    var sum = this.sum;
    var i = this.i;
    var lDate_now = Date.now;

    var lastTime = lDate_now();
    var timeout = this.timeout;
    while (lDate_now() - lastTime < timeout && i <= n) {
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

// Test the cothreaded computation unit.

/* Play around with different values for the timeouts and the constant
   `N' and see how your browser responds.  */

function execTime() {
  var status = computeSumOfSquares.continueCT();
  document.getElementById("progElmt").innerHTML =
    (status.percent * 100 / CothreadStatus.MAX_PERCENT).toFixed(2) + "%";

  if (status.returnType == CothreadStatus.FINISHED) {
    var resultElmt = document.createElement("p");
    resultElmt.id = "resultElmt";
    resultElmt.innerHTML = "Result: " + computeSumOfSquares.retVal;
    document.documentElement.children[1].appendChild(resultElmt);
    return;
  }
  return browserTime();
}

function browserTime() {
  /* Note: If a cothread should use all available processing time yet
     still let the browser stay responsive, this timeout should be set
     to zero.  Otherwise, any value larger than zero can be used to
     throttle a task to use only a fraction of available processing
     time.  */
  return setTimeout(execTime, 80);
}

function setup() {
  /* Append a progress counter element to the document body, assuming
     that the <body> element is the second child of the
     documentElement.  */
  var progElmt = document.createElement("p");
  progElmt.id = "progElmt";
  progElmt.innerHTML = "Please wait...";
  document.documentElement.children[1].appendChild(progElmt);

  computeSumOfSquares.timeout = 20;
  computeSumOfSquares.args.push(65536 * 20); // N
  computeSumOfSquares.start();
  return browserTime();
}
