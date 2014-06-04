/* JavaScript base class for cothreaded procedures.  */

/* Create a new Cothread object.

   A Cothread object is an object that contains the procedures and
   contextual data necessary for implementing a single cothread of
   execution.

   The three main run control functions that a cothreading controller
   should call are start(), continueCT(), and loop().  Note that none
   of these functions take any arguments and all of them return a
   CothreadStatus object.

   For function call-like semantics, use the `args' member to pass in
   arguments and the `retVal' member to retrieve the return value.

   Parameters:

   startExec -- The internal function to execute at initialization of
   a new Cothread run context.  See the startExec() member documentation
   for details.

   contExec -- The internal function to execute when continuing a
   preempted cothread.  See the contExec() member documentation for
   details.
*/
Cothread = function(startExec, contExec) {
  this.startExec = startExec;
  this.contExec = contExec;
  this.timeout = 0;
  this.status = new CothreadStatus(CothreadStatus.FINISHED, 0, 1000);
  this.args = [];
  this.retVal = null;
};

/* this.timeout -- Target preemption timeout in milliseconds.  If this
   is zero, then the the cothread is not preemptable.  Exactly how
   close this timeout is met is up to the cothread implementation.  */

/* this.startExec -- Initialization code for a new cothread run.

   This function is primarily intended to reset the cothread context
   to an initial state.  This function is not preemptable, so no tasks
   that are expensive in terms of wall clock time should be executed
   in this function.

   Parameters: none
   Return value: ignored
 */

/* this.contExec -- Execution code for preemptable body of a cothread.

   Parameters: none
   Return value: cothread status object

   Note that the internal status object should be changed and merely a
   pointer to the internal object is returned.

 */

/* this.status -- CothreadStatus object associated with this
   cothread.  */

/* Begin execution of a new cothread.

   If there was any existing context from a preempted cothread, it
   will be reset to an initial state for the new cothread run.

   Parameters: none
   Return value: cothread status object
 */
Cothread.prototype.start = function() {
  this.startExec();
  return this.contExec();
};

/* Continue execution of a preempted cothread, if any.

   If this cothread has reached the FINISHED state, then this function
   returns immediately with the current status of the cothread.

   Parameters: none
   Return value: cothread status object
 */
Cothread.prototype.continueCT = function() {
  if (this.status.returnType == CothreadStatus.FINISHED)
    return this.status;
  return this.contExec();
};

/* Continue execution of a preempted cothread or start a new cothread.

   If this cothread has reached the FINISHED state, a new cothread is
   started and runs until preemption.

   Parameters: none
   Return value: cothread status object
 */
Cothread.prototype.loop = function() {
  if (this.status.returnType == CothreadStatus.FINISHED)
    this.startExec();
  return this.contExec();
};

/*  CothreadStatus -- Used to indicate the return status of a
    Cothread.

    Fields:

    returnType -- One of the following values:
      CothreadStatus.FINISHED: 0 -- Cothread completed its task.
      CothreadStatus.PREEMPTED: 1 -- Cothread was interrupted.

    preemptCode -- Application-specific, see documentation of derived objects
      for details.

    percent -- Integer from 0 to CothreadStatus.MAX_PERCENT indicating
      progress completed on the cothread.

*/
CothreadStatus = function(returnType, preemptCode, percent) {
  this.returnType = returnType;
  this.preemptCode = preemptCode;
  this.percent = percent;
};

// CothreadStatus Constants
CothreadStatus.FINISHED = 0;
CothreadStatus.PREEMPTED = 1;
CothreadStatus.MAX_PERCENT = 32767;

/* Example definition of a Cothread object.

/\* Compute the sum of squares from zero up to N^2.

   Parameters:

   "n" (args[0]) -- The maximum number squared to sum.

   Return value: the sum of squares from zero to N^2.
*\/

var computeSumOfSquares = (function() {
  "use strict";

  function startExec() {
    this.n = args[0];

    this.sum = 0;
    this.i = 1;
  }

  // TODO: Check the actual performance benefits of this local variable
  // copying.  It might just bog down the garbage collector.
  function contExec() {
    var n = this.n;
    var sum = this.sum;
    var i = this.i;

    var lastTime = Date.now;
    var timeout = this.timeout;
    while (Date.now - lastTime < timeout && i <= n) {
      sum += i * i;
      i++;
      lastTime = Date.now;
    }

    if (i <= n)
      this.status.returnType = CothreadStatus.PREEMPTED;
    else
      this.status.returnType = CothreadStatus.FINISHED;
    this.status.preemptCode = 0; // Not useful for such a simple function.
    this.status.percent = (n - (i - 1)) * CothreadStatus.MAX_PERCENT / n;

    this.sum = sum;
    this.i = i;
    return this.status;
  }

  return new Cothread(startExec, contExec);
})();

 */

/*

Fast and efficient way to get the current time in milliseconds:

if (!Date.now) {
  Date.now = function now() {
    return new Date.getTime();
  };
}

Date.now;

https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/now

 */

/* TODO use parseInt()... */

/* But JavaScript always stores numbers internally as floating point.
   Too bad, support or integer arithmetic would be a great
   benefit.  */
