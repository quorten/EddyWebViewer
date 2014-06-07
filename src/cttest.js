import "cothread";

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
    this.n = args[0];
    this.inv_n = 1 / n;

    this.sum = 0;
    this.i = 1;
  }

  /* TODO: Check the actual performance benefits of this local variable
     copying.  This might just bog down the garbage collector.  */
  function contExec() {
    var n = this.n;
    var inv_n = this.inv_n;
    var sum = this.sum;
    var i = this.i;

    var lastTime = Date.now;
    var timeout = this.timeout;
    while (Date.now - lastTime < timeout && i <= n) {
      sum += i * i;
      i++;
      lastTime = Date.now;
    }

    this.setExitStatus(i <= n);
    if (i > n)
      this.retVal = sum;
    this.status.preemptCode = 0; // Not useful for such a simple function.
    this.status.percent = (n - (i - 1)) * CothreadStatus.MAX_PERCENT * inv_n;

    this.sum = sum;
    this.i = i;
    return this.status;
  }

  return new Cothread(startExec, contExec);
})();
