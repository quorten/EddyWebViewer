

/* Test the TracksLayer module.  */



/* Render layer for display of the eddy tracks layer.  */



/**
 * Abstract class for a render layer.  A derived class must be created
 * that has methods that do something useful.
 * @constructor
 */
var RenderLayer = function() {
  /**
   * RenderLayer front buffer (HTML Canvas), used for storing
   * completed renders.  This can either be manually composited into
   * another Canvas or inserted into the document for automatic
   * compositing of render layers.
   * @readonly
   */
  this.frontBuf = document.createElement("canvas");
  this.frontBuf.innerHTML = "Sorry, your browser doesn't support the " +
    "&lt;canvas&gt; element.";
};

/**
 * Set the limits of this rendering engine's internal caches.
 * Internal caches are very implementation-specific, but they can be
 * generalized to the two parameters that this function accepts.
 *
 * For trivial rendering units, the data cache and render cache will
 * be identical.
 * @abstract
 *
 * @param {integer} dataCache - Data loaded from an external source,
 * measured in implementation-specific entities.
 *
 * @param {integer} renderCache - Maximum size of prerendered images,
 * measured in pixels.
 */
RenderLayer.prototype.setCacheLimits = function(dataCache, renderCache) {
  throw new Error("Must be implemented by a subclass!");
};

/**
 * Load any pending data resources that must be loaded.  This function
 * is cothreaded so that a controlling function can provide
 * responsiveness.
 * @abstract
 *
 * @returns the cothread status of the data load operation.
 */
RenderLayer.prototype.loadData = function() {
  throw new Error("Must be implemented by a subclass!");
};

RenderLayer.READY = 0;
RenderLayer.NEED_DATA = 1;

/**
 * Setup the viewport and projection of a render layer.
 * @abstract
 *
 * @param {AbstractPoint} center - The point in the content
 * coordinate space that should appear at the center of the viewport.
 * @param {integer} width - The width of the rendering viewport in
 * pixels.
 * @param {integer} height - The height of the rendering viewport in
 * pixels.
 * @param {Projector} projection - The projection to use for rendering
 * the content into the viewport.
 *
 * @returns One of the following constants:
 *
 *  * RenderLayer.READY --- Changing the viewport was successful and a
 *    render may immediately proceed.
 *
 *  * RenderLayer.NEED_DATA --- The new viewport requires additional
 *    data that needs to be loaded.
 */
RenderLayer.prototype.setViewport =
  function(center, width, height, projection) {
  throw new Error("Must be implemented by a subclass!");
};

RenderLayer.FRAME_AVAIL = 0;
RenderLayer.NO_DISP_FRAME = 1;

/**
 * Cothreaded rendering routine.
 * @abstract
 *
 * @returns The cothread status of the data load operation.  When the
 * cothread gets preempted before the rendering task is finished, the
 * CothreadStatus preemptCode is one of the following values:
 *
 *  * RenderLayer.FRAME_AVAIL --- A partial frame has been rendered
 *    that is suitable for display.
 *
 *  * RenderLayer.NO_DISP_FRAME --- The partial frame is not suitable
 *    for display.
 */
RenderLayer.prototype.render = function() {
  throw new Error("Must be implemented by a subclass!");
};


/* JavaScript base class for cothreaded procedures.  */

/**
 * Creates a new Cothread object.
 *
 * A Cothread object is an object that contains the procedures and
 * contextual data necessary for implementing a single cothread of
 * execution.
 *
 * The three main run control functions that a cothreading controller
 * should call are {@linkcode Cothread#start}, {@linkcode Cothread#continueCT},
 * and {@linkcode Cothread#loop}.  Note that none of these functions take any
 * arguments and all of them return a {@linkcode CothreadStatus} object.
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
 * @param {function} startExec - The internal function to execute at
 * initialization of a new Cothread run context.  See the
 * {@linkcode Cothread#startExec} member documentation for details.
 *
 * @param {function} contExec - The internal function to execute when
 * continuing a preempted cothread.  See the {@linkcode Cothread#contExec}
 * member documentation for details.
 */
var Cothread = function(startExec, contExec) {
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
   * executed in this function.
   *
   * @function
   * @protected
   * @returns Nothing
   */
  this.startExec = startExec;

  /**
   * Execution code for preemptable body of a cothread.
   *
   * @function
   * @protected
   * @returns {@linkcode CothreadStatus} object
   */
  this.contExec = contExec;

  /**
   * {@linkcode CothreadStatus} object associated with this cothread.
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


/**
 * Set the exit status of a cothread based off of a condition.
 *
 * @param {boolean} condition - If `false`, then the exit status is
 * set to {@linkcode CothreadStatus#FINISHED}.  Otherwise, it is set to
 * {@linkcode CothreadStatus#PREEMPTED}.
 *
 * @returns Nothing
 */
Cothread.prototype.setExitStatus = function(condition) {
  "use strict";
  if (condition)
    this.status.returnType = CothreadStatus.PREEMPTED;
  else
    this.status.returnType = CothreadStatus.FINISHED;
};

/**
 * Begin execution of a new cothread within the given {@linkcode Cothread}
 * context.
 *
 * If there was any existing context from a preempted cothread, it
 * will be reset to an initial state for the new cothread run.
 *
 * @returns {@linkcode CothreadStatus} object
 */
Cothread.prototype.start = function() {
  "use strict";
  this.startExec();
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
    this.startExec();
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
   *   {@linkcode CothreadStatus.FINISHED} -- Cothread completed its task.
   *
   *   {@linkcode CothreadStatus.PREEMPTED} -- Cothread was interrupted.
   *
   * @type enumerant
   */
  this.returnType = returnType;

  /**
   * Application-specific, see documentation of derived objects for
   * details.
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

/** Enumerant indicating that a cothread has finished.  */
CothreadStatus.FINISHED = 0;

/** Enumerant indicating that a cothread has been preempted.  */
CothreadStatus.PREEMPTED = 1;

/**
 * Maximum value that {@linkcode CothreadStatus#percent} may be.
 * Corresponds to 100%.
 */
CothreadStatus.MAX_PERCENT = 32767;

/*

What data is needed for the tracks rendering class?

1. Eddy track data.
2. Date list (global pointer).

* Render cache

 */

TracksLayer = new RenderLayer();
TracksLayer.IOWAIT = 1;
TracksLayer.PROC_DATA = 2;

TracksLayer.setCacheLimits = function(dataCache, renderCache) {
};

/**
 * Cothreaded data loading function.  The cothreaded function takes no
 * parameters and returns `true' on success, `false' on failure.
 *
 * The CothreadStatus preemptCode may be one of the following values:
 *
 * * TracksLayer.IOWAIT --- The cothread is waiting for an XMLHttpRequest
 *   to finish.  When the data is finished being loaded, this cothread
 *   will explicitly yield control to the controller.
 *
 * * TracksLayer.PROC_DATA --- The cothread has been preempted when it was
 *   processing data rather than waiting for data.
 */
TracksLayer.loadData = (function() {
  "use strict";

  function alertContents() {
    var httpRequest = TracksLayer.loadData.httpRequest;
    if (!httpRequest)
      return;
    if (httpRequest.readyState == 4) {
      if (httpRequest.status == 200) {
 // Call the main loop to continue cothread execution.
 return;
      } else {
 throw new Error("There was a problem with the HTTP request.");
      }
    } else if (httpRequest.readyState == 2) {
      TracksLayer.loadData.reqLen = httpRequest.getResponseHeader("Content-Length");
    }
  }

  function startExec() {
    var url = "../data/tracks/acyc_bu_tracks.json";
    var httpRequest;

    if (window.XMLHttpRequest)
      httpRequest = new XMLHttpRequest();
    else if (window.ActiveXObject) {
      try {
 httpRequest = new ActiveXObject("Msxml2.XMLHTTP");
      }
      catch (e) {
 try {
   httpRequest = new ActiveXObject("Microsoft.XMLHTTP");
 }
 catch (e) {}
      }
    }

    if (!httpRequest) {
      throw new Error("Could not load the data!");
    }

    httpRequest.onreadystatechange = alertContents;
    httpRequest.open("GET", url, true);
    // httpRequest.setRequestHeader("Range", "bytes=0-500");
    httpRequest.send();
    this.reqLen = 0;
    this.readyDataProcess = false;

    this.httpRequest = httpRequest;
  }

  /** This function primarily retrieves the current loading status of
      the XMLHttpRequest.  */
  function contExec() {
    var httpRequest = this.httpRequest;
    var reqLen = this.reqLen;

    if (!httpRequest) {
      this.status.returnType = CothreadStatus.FINISHED;
      this.status.preemptCode = 0;
      return this.status;
    } else if (httpRequest.readyState != 4) {
      this.status.returnType = CothreadStatus.PREEMPTED;
      this.status.preemptCode = TracksLayer.IOWAIT;
      if (reqLen) {
 this.status.percent = httpRequest.responseText.length *
   CothreadStatus.MAX_PERCENT / reqLen;
      } else
 this.status.percent = 0;
      return this.status;
    }
    // (httpRequest.readyState == 4)

    // JSON parsing is slow: Return here and come back later.
    if (!this.readyDataProcess) {
      this.readyDataProcess = true;
      this.status.returnType = CothreadStatus.PREEMPTED;
      this.status.preemptCode = TracksLayer.PROC_DATA;
      return this.status;
    }

    this.status.percent = CothreadStatus.MAX_PERCENT;

    // Process the data here.

    TracksLayer.tracksData = JSON.parse(httpRequest.responseText);
    httpRequest.onreadystatechange = null;
    this.httpRequest = null;

    this.status.returnType = CothreadStatus.FINISHED;
    this.status.preemptCode = 0;

    return this.status;
  }

  return new Cothread(startExec, contExec);
})();

TracksLayer.setViewport = function(center, width, height, projection) {
  // RenderLayer.call(center, width, height, projection);
  this.frontBuf.width = 1440; // width;
  this.frontBuf.height = 720; // height;

  this.center = center;
  this.projection = projection;

  return RenderLayer.READY;
};

TracksLayer.render = (function() {
  "use strict";

  function startExec() {
  }

  function contExec() {
  }

  return new Cothread(startExec, contExec);
})();

function execTime() {
  var status = TracksLayer.loadData.continueCT();
  if (status.preemptCode != TracksLayer.PROC_DATA) {
    document.getElementById("progElmt").innerHTML =
      (status.percent * 100 / CothreadStatus.MAX_PERCENT).toFixed(2) + "%";
  } else
    document.getElementById("progElmt").innerHTML = "Parsing JSON, please wait...";

  if (status.returnType == CothreadStatus.FINISHED) {
    var resultElmt = document.createElement("p");
    resultElmt.id = "resultElmt";
    resultElmt.innerHTML = "Result: " + TracksLayer.tracksData.length +
      " tracks";
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

  TracksLayer.loadData.timeout = 20;
  if (TracksLayer.loadData.start() != CothreadStatus.FINISHED)
    return browserTime();
}
