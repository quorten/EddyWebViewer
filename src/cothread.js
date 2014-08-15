/* JavaScript base class for cothreaded procedures, along with basic
   sequencer implementations.  */

import "oevns";

/**
 * Creates a new Cothread object.
 *
 * A Cothread object is an object that contains the procedures and
 * contextual data necessary for implementing a single cothread of
 * execution.
 *
 * The three main run control functions that a cothreading controller
 * should call are {@linkcode Cothread#start}, {@linkcode Cothread#continueCT},
 * and {@linkcode Cothread#loop}.  Note that none of these functions
 * take any arguments and all of them return a
 * {@linkcode CothreadStatus} object.
 *
 * For function call-like semantics, use the `args` member to pass in
 * arguments and the `retVal` member to retrieve the return value.
 * Another alternative for passing in arguments is to set member
 * fields directly.
 *
 * See the [Cothread tutorial]{@tutorial cothread} for an example on
 * how to use the {@linkcode Cothread} class.
 *
 * @constructor
 *
 * @param {function} initCtx - The internal function to execute at
 * initialization of a new Cothread run context.  See the
 * {@linkcode Cothread#initCtx} member documentation for details.
 *
 * @param {function} contExec - The internal function to execute when
 * continuing a preempted cothread.  See the
 * {@linkcode Cothread#contExec} member documentation for details.
 */
var Cothread = function(initCtx, contExec) {
  "use strict";

  /**
   * Target preemption timeout in milliseconds.
   *
   * If this field is set to zero, then the the cothread is not
   * preemptable.  Exactly how close this timeout is met is up to the
   * cothread implementation.
   *
   * @type integer
   */
  this.timeout = 0;

  /**
   * Initialization code for a new cothread run.
   *
   * This function is primarily intended to reset the cothread context
   * to an initial state.  This function is not preemptable, so no
   * tasks that are expensive in terms of wall clock time should be
   * executed in this function.  This function must reset the
   * {@linkcode CothreadStatus} to an initial value.
   *
   * @function
   * @returns Nothing
   */
  this.initCtx = initCtx;

  /**
   * Execution code for preemptable body of a cothread.
   *
   * @function
   * @protected
   * @returns {@linkcode CothreadStatus} object
   */
  this.contExec = contExec;

  /**
   * {@linkcode CothreadStatus} object associated with this
   * cothread.
   * @type CothreadStatus
   * @readonly
   */
  this.status = new CothreadStatus(CothreadStatus.FINISHED, 0, 1000);

  /** Argument list to pass to cothread function.  */
  this.args = [];

  /**
   * Return value from finished cothread function.
   * @readonly
   */
  this.retVal = null;
};

OEV.Cothread = Cothread;

/**
 * Abstract function for timing cothread preemption intervals.
 * Feature detection should assign a reasonable implementation to this
 * variable, such as `Date.now` or `performance.now`.
 * @type Number
 * @returns Time in milliseconds from an arbitrary reference point.
 * The values are only used for elapsed time calculations.
 */
Cothread.now = function() {
  throw_new_Error("No cothread timing function defined.");
};

/* Default feature detects that are reasonable for browsers.  If these
   feature detects aren't good enough, the user of this class can
   perform additional feature detects and assign Cothread.now to an
   even better alternative.  */
if (Global.performance && performance.now)
  Cothread.now = function() { return performance.now(); };
else if (Global.Date && Date.now)
  Cothread.now = Date.now;
else if (Global.Date)
  Cothread.now = function() { return new Date().getTime(); };

/**
 * Set the exit status of a cothread based off of a condition.
 *
 * @param {boolean} condition - If `false`, then the exit status is
 * set to {@linkcode CothreadStatus#FINISHED}.  Otherwise, it is
 * set to {@linkcode CothreadStatus#PREEMPTED}.
 *
 * @returns Nothing
 */
Cothread.prototype.setExitStatus = function(condition) {
  "use strict";
  if (condition)
    this.status.returnType = CothreadStatus.PREEMPTED;
  else this.status.returnType = CothreadStatus.FINISHED;
};

/**
 * Begin execution of a new cothread within the given
 * {@linkcode Cothread} context and attempt to finish the task
 * before the preemption timeout.
 *
 * If there was any existing context from a preempted cothread, it
 * will be reset to an initial state for the new cothread run.
 *
 * @returns {@linkcode CothreadStatus} object
 */
Cothread.prototype.start = function() {
  "use strict";
  this.initCtx();
  return this.contExec();
};

/**
 * Continue execution of a preempted cothread, if any.
 *
 * If this cothread has reached the {@linkcode CothreadStatus#FINISHED}
 * state, then this function returns immediately with the current
 * status of the cothread.
 *
 * @returns {@linkcode CothreadStatus} object
 */
Cothread.prototype.continueCT = function() {
  "use strict";
  if (this.status.returnType == CothreadStatus.FINISHED)
    return this.status;
  return this.contExec();
};

/**
 * Continue execution of a preempted cothread or start a new cothread.
 *
 * If this cothread has reached the {@linkcode CothreadStatus.FINISHED}
 * state, a new cothread is started and runs until preemption.
 *
 * @returns {@linkcode CothreadStatus} object
 */
Cothread.prototype.loop = function() {
  "use strict";
  if (this.status.returnType == CothreadStatus.FINISHED)
    this.initCtx();
  return this.contExec();
};

/**
 * Used to indicate the return status of a {@linkcode Cothread}.
 *
 * The parameters to this constructor initialize the values of the
 * fields of the same name.
 *
 * @constructor
 * @param {integer} returnType - See {@linkcode CothreadStatus#returnType}
 * @param {integer} preemptCode - See {@linkcode CothreadStatus#preemptCode}
 * @param {integer} percent - See {@linkcode CothreadStatus#percent}
 */
var CothreadStatus = function(returnType, preemptCode, percent) {
  "use strict";

  /**
   * The type of the cothread return status.
   *
   * This should be one of the following values:
   *
   * * {@linkcode CothreadStatus.FINISHED} -- Cothread completed its
   *   task.
   *
   * * {@linkcode CothreadStatus.PREEMPTED} -- Cothread was
   *   interrupted.
   *
   * @type enumerant
   */
  this.returnType = returnType;

  /**
   * Application-specific, see documentation of derived objects for
   * details.  The following values have common meanings in all
   * derived objects:
   *
   * * Zero (0) -- Not applicable
   *   (i.e. `(returnType == CothreadStatus.FINISHED)`).
   *
   * * {@linkcode CothreadStatus.IOWAIT} (1) -- Cothread is waiting
   *   for I/O.
   *
   * * {@linkcode CothreadStatus.PROC_DATA} (2) -- Cothread was
   *   preempted while processing data.
   *
   * @type integer
   */
  this.preemptCode = preemptCode;

  /**
   * Integer from 0 to {@linkcode CothreadStatus.MAX_PERCENT}
   * indicating progress completed on the cothread.
   * @type integer
   */
  this.percent = percent;
};

OEV.CothreadStatus = CothreadStatus;

/** Enumerant indicating that a cothread has finished.  */
CothreadStatus.FINISHED = 0;

/** Enumerant indicating that a cothread has been preempted.  */
CothreadStatus.PREEMPTED = 1;

/** Enumerant indicating that a cothread is waiting for I/O.  */
CothreadStatus.IOWAIT = 1;

/** Enumerant indicating that a cothread was preempted while
 * processing data.  */
CothreadStatus.PROC_DATA = 2;

/**
 * Maximum value that {@linkcode CothreadStatus#percent} may be.
 * Corresponds to 100%.
 */
CothreadStatus.MAX_PERCENT = 32767;

/********************************************************************/

/**
 * Cothreaded series cothread controller.  Schedules cothreaded jobs
 * to be executed in series.  If any of the jobs set their `retVal` to
 * `SeriesCTCtl.QUIT` (to signify a terminal error condition), then
 * the cothread controller will finish without executing the rest of
 * the sequence.  Normal functions can also be provided.  Note that
 * the timeouts of each job must be set manually by the user of this
 * function.
 *
 * If the preemptCode of a job's return status is
 * `CothreadStatus.IOWAIT`, then the cothread controller returns
 * immediately with the same preemptCode, with the expectation that
 * the controller will be resumed once I/O is available.
 *
 * Basic usage:
 *
 * ~~~
 * var job1 = new Cothread(j1StartExec, j1ContExec);
 * var job2 = new Cothread(j2StartExec, j2ContExec);
 * var jobSeries = new SeriesCTCtl([ job1, job2 ]);
 * jobSeries.timeout = 15;
 * jobSeries.start();
 * // Execute main loop until the series completes...
 * var status = jobSeries.continueCT();
 * if (status.returnType == CothreadStatus.PREEMPTED)
 *   return window.setTimeout(mainLoop, 15);
 * ~~~
 *
 * Parameters:
 *
 * "jobList" (this.jobList) -- The list of cothreaded jobs to execute.
 *
 * Return value: The return value of the last job on success,
 * `SeriesCTCtl.QUIT` on early exit.
 *
 * @param {Array} jobList - The list of cothreaded jobs to execute.
 *
 * @constructor
 */
var SeriesCTCtl = function(jobList) {
  /* Note: We must be careful to make sure that the base cothread
     initializations take place.  */
  Cothread.call(this, this.initCtx, this.contExec);

  this.jobList = jobList;
};

OEV.SeriesCTCtl = SeriesCTCtl;
SeriesCTCtl.prototype = new Cothread();
SeriesCTCtl.prototype.constructor = SeriesCTCtl;
/** Enumerant indicating that a job in a {@linkcode SeriesCTCtl}
 * encountered a terminal error condition.  */
SeriesCTCtl.QUIT = 1;

SeriesCTCtl.prototype.initCtx = function() {
  this.curJob = 0;
  this.jobList[0].initCtx();

  this.status.returnType = CothreadStatus.PREEMPTED;
  this.status.preemptCode = 0;
  this.status.percent = 0;
};

SeriesCTCtl.prototype.contExec = function() {
  var jobList = this.jobList;
  var numJobs = jobList.length;
  var curJob = this.curJob;
  var status;

  var ctnow = Cothread.now;
  var startTime = ctnow();
  var timeout = this.timeout;

  while (true) {
    var execJob = jobList[curJob];
    var isCothread = typeof(execJob) != "function";
    var retVal;
    if (isCothread) {
      status = execJob.continueCT();
      retVal = execJob.retVal;
    } else { status = {}; retVal = execJob(); }

    if (isCothread && ctnow() - startTime >= timeout)
      break;

    if (!isCothread || status.returnType == CothreadStatus.FINISHED) {
      if (retVal == SeriesCTCtl.QUIT) {
	this.retVal = SeriesCTCtl.QUIT;
	this.status.returnType = CothreadStatus.FINISHED;
	this.status.preemptCode = 0;
	this.status.percent = CothreadStatus.MAX_PERCENT;
	return this.status;
      }

      curJob++; this.curJob = curJob;

      if (curJob >= numJobs) {
	this.retVal = retVal;
	this.status.returnType = CothreadStatus.FINISHED;
	this.status.preemptCode = 0;
	this.status.percent = CothreadStatus.MAX_PERCENT;
	return this.status;
      }

      execJob = jobList[curJob];
      if (typeof(execJob) != "function")
	execJob.initCtx();
      if (!isCothread && ctnow() - startTime >= timeout)
	break;

    } else if (status.preemptCode == CothreadStatus.IOWAIT) {
      this.status.returnType = CothreadStatus.PREEMPTED;
      this.status.preemptCode = CothreadStatus.IOWAIT;
      this.status.percent = (curJob * CothreadStatus.MAX_PERCENT +
			     status.percent) / numJobs;
      return this.status;
    }
  }

  this.status.returnType = CothreadStatus.PREEMPTED;
  this.status.preemptCode = 0;
  this.status.percent = (curJob * CothreadStatus.MAX_PERCENT +
			 status.percent) / numJobs;
  return this.status;
};

/**
 * Cothreaded parallel cothread controller.  Each job is given an
 * equal division of the controller's timeout interval.  When all jobs
 * finish, the controller quits.  If some jobs finish before others,
 * then the controller will consistently quit before it's allocated
 * timeout, in order to (1) always give each job an equal sized
 * timeslice and (2) only run each job once during each allocated time
 * period.
 *
 * If the preemptCode of a job's return status is
 * `CothreadStatus.IOWAIT`, then the cothread controller marks that
 * job as waiting by putting it in the wait list.  If all remaining
 * non-finished jobs are waiting for I/O, then the cothread controller
 * returns with a preemptCode of `CothreadStatus.IOWAIT`, with the
 * expectation that the controller will be resumed once I/O is
 * available.
 *
 * Basic usage:
 *
 * ~~~
 * var job1 = new Cothread(j1StartExec, j1ContExec);
 * var job2 = new Cothread(j2StartExec, j2ContExec);
 * var jobSeries = new ParallelCTCtl([ job1, job2 ]);
 * jobSeries.timeout = 15;
 * jobSeries.start();
 * // Execute main loop until the jobs complete...
 * var status = jobSeries.continueCT();
 * if (status.returnType == CothreadStatus.PREEMPTED)
 *   return window.setTimeout(mainLoop, 15);
 * ~~~
 *
 * Parameters:
 *
 * "jobList" (this.jobList) -- The list of cothreaded jobs to execute.
 *
 * @param {Array} jobList - The list of cothreaded jobs to execute.
 *
 * @constructor
 */
var ParallelCTCtl = function(jobList) {
  /* Note: We must be careful to make sure that the base cothread
     initializations take place.  */
  Cothread.call(this, this.initCtx, this.contExec);

  this.jobList = jobList;
};

OEV.ParallelCTCtl = ParallelCTCtl;
ParallelCTCtl.prototype = new Cothread();
ParallelCTCtl.prototype.constructor = ParallelCTCtl;

ParallelCTCtl.prototype.initCtx = function() {
  /* Create a copy of the list for keeping track of remaining jobs to
     execute.  */
  var jobList = this.jobList;
  this.execList = jobList.slice(0);

  /* Initialize the `IOWAIT' list, the list of jobs that are waiting
     for I/O.  */
  this.waitList = [];

  /* Initialize all the jobs.  */
  var numJobs = jobList.length;
  var timeSlice = this.timeout / numJobs;
  for (var i = 0; i < numJobs; i++) {
    jobList[i].timeout = timeSlice;
    jobList[i].initCtx();
  }

  this.status.returnType = CothreadStatus.PREEMPTED;
  this.status.preemptCode = 0;
  this.status.percent = 0;
};

ParallelCTCtl.prototype.contExec = function() {
  var numJobs = this.jobList.length;
  var execList = this.execList;
  var remJobs = execList.length; /* Remaining jobs */
  var waitList = this.waitList;
  var numWaitJobs = waitList.length;
  var status;
  var execPercent = 0;

  for (var i = 0; i < numWaitJobs; i++) {
    status = waitList[i].continueCT();
    if (status.returnType == CothreadStatus.FINISHED) {
      waitList.splice(i--, 1);
      numWaitJobs--;
    } else {
      execPercent += status.percent;

      if (status.preemptCode != CothreadStatus.IOWAIT) {
	/* Queue this job for return to the normal execution list.
	   Since the value of `remJobs' has already been set, this job
	   will not get accidentally executed twice in the same
	   iteration.  */
	execList.push(waitList[i]);
	waitList.splice(i--, 1);
	numWaitJobs--;
      }
    }
  }

  for (var i = 0; i < remJobs; i++) {
    status = execList[i].continueCT();
    if (status.returnType == CothreadStatus.FINISHED) {
      execList.splice(i--, 1);
      remJobs--;
    } else {
      execPercent += status.percent;

      if (status.preemptCode == CothreadStatus.IOWAIT) {
	/* Add this job to the IOWAIT list.  */
	waitList.push(execList[i]);
	execList.splice(i--, 1);
	remJobs--;
      }
    }
  }

  remJobs = execList.length + waitList.length;

  if (remJobs == 0) {
    this.status.returnType = CothreadStatus.FINISHED;
    this.status.preemptCode = 0;
    this.status.percent = CothreadStatus.MAX_PERCENT;
    return this.status;
  }

  if (waitList.length != 0)
    this.status.preemptCode = CothreadStatus.IOWAIT;
  else this.status.preemptCode = 0;
  this.status.returnType = CothreadStatus.PREEMPTED;
  this.status.percent = ((execPercent +
			  (numJobs - remJobs) * CothreadStatus.MAX_PERCENT) /
			 numJobs);
  return this.status;
};

/*

NOTE: One more kind of controller (and cothread type) is a "bare"
cothread and parallel bare cothread controller.  A bare cothread is
almost like a normal cothread, except that the contExec() method only
performs one iteration and does not check for timeouts.  All timeout
checking is delegated to the bare cothread controller.

A bare cothread controller is useful for sequencing many cothreads
within a small timeframe, such as 15 ms.  A normal cothread would not
be able to make accurate timings for very short intervals, and thus
the user experience would be jerky since the cothread controller would
not be able to consistently meet its timeout deadline.  Bare cothread
controllers solve this problem by coalescing the timeout intervals
into a single larger interval.

Bare cothreads possibly suffer from lower performance since not as
many variables can be cached for tight inner loop computations, and
CPU cache misses are going to be more common when rapidly jumping
between unrelated code segments.

*/
