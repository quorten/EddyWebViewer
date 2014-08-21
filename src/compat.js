/* Library of useful browser compatibility functions that can be
   called within inner runtime code bodies without errors due to
   missing features.

   Some of these functions may rely on feature detections performed in
   `detect.js' at startup.  */

/********************************************************************/
/* Generic Event Handling */

/**
 * Create a function wrapper for use when invoking object methods
 * within an event handler.  The function wrapper guarantees that
 * `this` points to the object that the method is being called from.
 * No parameters are passed to the method.
 *
 * @param {Object} callObj - the object on which to call the method.
 * @param {String} handler - a quoted string specifying the name of
 * the function to call.  Two parameters are passed to this method.
 * The first one is the original value of `this` within the wrapper
 * function, and the second one is the event object.
 */
var makeEventWrapper = function(callObj, handler) {
  return function(event) { return callObj[handler](this, event); };
};

/********************************************************************/
/* Browser Detection

  BAD BAD BAD BAD BAD BAD BAD BAD BAD BAD BAD BAD BAD BAD BAD BAD BAD

			   DO NOT USE THIS!

Browser  detection  is  strongly  discouraged by  best  practices  for
JavaScript  browser   programming.   Instead  of   performing  browser
detection, you should  make a best effort to  use feature detection as
much as is possible.  */

/* Return Microsoft Internet Explorer (major) version number, or 0 for
   others.  This function works by finding the "MSIE " string and
   extracting the version number following the space, up to the
   semicolon.  */
var getMsieVersion = function() {
  var ua = window.navigator.userAgent;
  var msie = ua.indexOf("MSIE ");

  if (msie > 0)
    return parseFloat(ua.substring(msie + 5, ua.indexOf(";", msie)));
  return 0; // is a different browser
};

/********************************************************************/
/* Mouse Pointer and Wheel Compatibility */

/**
 * Check if the browser meets the minimum requirements for reading the
 * mouse pointer position.  `true` is returned on success, `false` on
 * failure.  If this check is used, it should only be used once on the
 * first mouse pointer event.
 *
 * @param {MouseEvent} event - The mouse event to check
 */
var MousePos_checkRead = function(event) {
  // var oldMsie = msieVersion <= 6 && msieVersion > 0;
  if (typeof(event.clientX) == "undefined" &&
      typeof(window.event) != "undefined") // Probably old MSIE
    event = window.event;
  if (typeof(event.clientX) != "undefined" &&
      typeof(event.clientY) != "undefined")
    return true;
  return false;
};

/**
 * Set the mouse position calibration point.
 *
 * In the event that you would rather opt-out of browser detects to
 * read the position of the mouse pointer, this function sets a
 * "calibration point" to the values of `x` and `y` passed to this
 * function.  When `MousePos_get()` is called, it will read the mouse
 * position from `event.clientX` and `event.clientY` and subtract the
 * values of the calibration point from the position that has been
 * read.
 *
 * @param {integer} x - The calibration point x coordinate
 * @param {integer} y - The calibration point y coordinate
 */
var MousePos_setCalibPt = function(x, y) {
  calibPt = [ x, y ];
};

/**
 * Read the position of the mouse pointer in a cross-browser
 * compatible way.
 *
 * @param {Array} out - Storage for output value.  If
 * `null`, then static storage is used.
 * @param {MouseEvent} event - The mouse event to use
 *
 * @returns an array describing the mouse position.  The X and Y
 * coordinates are stored in indexes 0 and 1 of this array.
 */
var MousePos_get = function(out, event) {
  // var oldMsie = msieVersion <= 6 && msieVersion > 0;
  if (typeof(event.clientX) == "undefined" &&
      typeof(window.event) != "undefined") // Probably old MSIE
    event = window.event;

  if (!out) out = MousePos_getStorage;

  if (calibPt) {
    out[0] = event.clientX - calibPt[0];
    out[1] = event.clientY - calibPt[1];
    return out;
  }

  if (typeof(event.pageX) != "undefined") {
    out[0] = event.pageX;
    out[1] = event.pageY;
    return out;
  }

  out[0] = event.clientX + (document.documentElement.scrollLeft +
			    document.body.scrollLeft);
  out[1] = event.clientY + (document.documentElement.scrollTop +
			    document.body.scrollTop);

  return out;
};

/**
 * Create a mouse wheel event listener in a cross-browser compatible
 * way.
 *
 * Example: `addWheelListener(elem, function(e) {
 *   console.log(e.deltaY); e.preventDefault(); } );`
 *
 * This function originated from sample code on Mozilla Developer
 * Network.
 *
 * @function
 * @param {Element} elem - The element to add the event listener to.
 * @param {function} callback - The event handler function to use.
 * @param {Boolean} useCapture - Whether or not to use event
 * capturing.
 */
var addWheelListener = (function(window, document) {
  var prefix = "", _addEventListener, onwheel, support;

  // Detect the event model.
  if (window.addEventListener) {
    _addEventListener = "addEventListener";
  } else {
    _addEventListener = "attachEvent";
    prefix = "on";
  }

  // Detect an available wheel event.
  support = "onwheel" in
    document.createElement("div") ? "wheel" : // Standardized
    document.onmousewheel !== undefined ? "mousewheel" : // Webkit and IE
    "DOMMouseScroll"; // Assume that remaining browsers are older Firefox

  var addWheelListenerInternal = function(elem, callback, useCapture) {
    subAddWheelListener(elem, support, callback, useCapture);

    // Handle MozMousePixelScroll in older Firefox.
    if(support == "DOMMouseScroll") {
      subAddWheelListener(elem, "MozMousePixelScroll", callback, useCapture);
    }
  };

  var subAddWheelListener = function(elem, eventName, callback, useCapture) {
    elem[_addEventListener](prefix + eventName, support == "wheel" ?
      callback : function(originalEvent) {
	!originalEvent && (originalEvent = window.event);

	// Create a normalized event object.
	var event = {
	  // Keep a reference to the original event object.
	originalEvent: originalEvent,
	target: originalEvent.target || originalEvent.srcElement,
	type: "wheel",
	deltaMode: originalEvent.type == "MozMousePixelScroll" ? 0 : 1,
	deltaX: 0,
	delatZ: 0,
	preventDefault: function() {
	    originalEvent.preventDefault ?
	    originalEvent.preventDefault() :
	    originalEvent.returnValue = false;
	  }
	};

	// Calculate deltaY (and deltaX) according to the event.
	if (support == "mousewheel") {
	  event.deltaY = - 1/40 * originalEvent.wheelDelta;
	  // Webkit also supports wheelDeltaX.
	  originalEvent.wheelDeltaX && (event.deltaX = - 1/40 *
					originalEvent.wheelDeltaX);
	} else
	  event.deltaY = originalEvent.detail;

	// It's time to fire the callback.
	return callback(event);

      }, useCapture || false);
  };

  return addWheelListenerInternal;
})(window, document);

/**
 * Capture the mouse pointer in a way that is cross-browser
 * compatible.  The function crossReleaseCapture() must be called when
 * mouse capture is no longer needed.
 *
 * @param {Element} elmt - The element to set capture on
 * @param {function} onMouseMove - The event handler for `onmousemove`
 * @param {function} onMouseUp - The event handler for `onmouseup'
 */
var crossSetCapture = function(elmt, onMouseMove, onMouseUp) {
  if (elmt.setCapture) {
    elmt.onmousemove = onMouseMove;
    elmt.onmouseup = onMouseUp;
    elmt.setCapture();
  } else {
    window.onmousemove = onMouseMove;
    window.onmouseup = onMouseUp;
  }
};

/**
 * Release a captured mouse pointer in a way that is cross-browser
 * compatible.
 */
var crossReleaseCapture = function() {
  if (document.releaseCapture)
    document.releaseCapture();
  else {
    window.onmousemove = null;
    window.onmouseup = null;
  }
};

/********************************************************************/
/* Screen Update Helpers */

/* NOTE: Avoid assigning directly to the window object, this may not
   work well on all browsers.  */
(function createRequestAnimationFrame() {
  var lastTime = 0;
  var vendors = [ "webkit", "moz" ];
  for(var x = 0; x < vendors.length && !window.requestAnimationFrame; ++x) {
    window.requestAnimationFrame = window[vendors[x]+"RequestAnimationFrame"];
    window.cancelAnimationFrame = window[vendors[x]+"CancelAnimationFrame"] ||
      window[vendors[x]+"CancelRequestAnimationFrame"];
  }

  if (!window.requestAnimationFrame)
    window.requestAnimationFrame = function(callback) {
      // Just use a constant timeout.
      return window.setTimeout(callback, 20);
    };

  /* The following is an alternative more complicated optimizing
     timeout adjustment routine.  */
    /* window.requestAnimationFrame = function(callback, element) {
      var currTime = new Date().getTime();
      var timeToCall = Math.max(0, 16 - (currTime - lastTime));
      var id = window.setTimeout(
	function() { callback(currTime + timeToCall); },
				 timeToCall);
      lastTime = currTime + timeToCall;
      return id;
    }; */

  if (!window.cancelAnimationFrame) {
    window.cancelAnimationFrame = function(id) {
      clearTimeout(id);
    };
  }
})();

/* The following functions help maintain smooth animation in Firefox.
   The new code architecture does not need them anymore, though: the
   cothreading architecture has subsumed their functionality.  */

/**
 * Try to allocate a new render job.  This will either preempt an
 * existing job or deny rendering if preemption is disabled.  Returns
 * true if the render job can proceed, false if rendering is denied.
 *
 * @param {function} rendQFunc - If the render job gets queued
 * (denied from immediate execution), this is the function that will
 * be called once the queue is empty.
 */
var allocRenderJob = function(rendQFunc) {
  if (renderInProg) {
    renderQueue = rendQFunc;
    return false;
  }
  renderInProg = true;
  requestAnimationFrame(freeRenderJob);
  return true;
};

/**
 * Free a render job from the queue.  This function should only be
 * called from `allocRenderJob()` and never by any code that uses
 * `allocRenderJob()`.
 */
var freeRenderJob = function() {
  renderInProg = false;
  if (renderQueue) {
    var rendQFunc = renderQueue;
    renderQueue = null;
    return rendQFunc();
  }
};

/********************************************************************/
/* Global Variables */

/** Cached getMsieVersion() */
var msieVersion = getMsieVersion();

/** Mouse Calibration Point */
var calibPt = null;

/** Static storage for MousePos_Get() */
var MousePos_getStorage = [];

/** For allocRenderJob() and freeRenderJob(): Whether or not a render
 * job is in progress.   */
var renderInProg = false;
/** For allocRenderJob() and freeRenderJob(): A render queue that can
 * store up to one pending job.  */
var renderQueue = null;
