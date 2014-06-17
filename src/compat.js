/* Library of useful browser compatibility functions.  */

/* Return Microsoft Internet Explorer (major) version number, or 0 for
   others.  This function works by finding the "MSIE " string and
   extracting the version number following the space, up to the
   semicolon.  */
function getMsieVersion() {
  var ua = window.navigator.userAgent;
  var msie = ua.indexOf("MSIE ");

  if (msie > 0)
    return parseFloat(ua.substring(msie + 5, ua.indexOf(";", msie)));
  return 0; // is a different browser
}

/********************************************************************/
/* Mouse Pointer and Wheel Compatibility */

/**
 * Check if the browser meets the minimum requirements for reading the
 * mouse pointer position.  `true` is returned on success, `false` on
 * failure.  If this check is used, it should only be used once on the
 * first mouse pointer event.
 *
 * @param {MouseEvent} - The mouse event to check
 */
function MousePos_checkRead(event) {
  if (msieVersion <= 6 && msieVersion > 0)
    event = window.event;
  if (typeof(event.clientX) != "undefined" &&
      typeof(event.clientY) != "undefined")
    return true;
  return false;
}

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
function MousePos_setCalibPt(x, y) {
  calibPt = [ x, y ];
}

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
function MousePos_get(out, event) {
  var oldMsie = msieVersion <= 6 && msieVersion > 0;
  if (oldMsie)
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
}

/**
 * Create a mouse wheel event listener in a cross-browser compatible
 * way.  This function is only used to initialize the addWheelListener
 * global variable.
 *
 * Example: addWheelListener(elem, function(e) {
 *   console.log(e.deltaY); e.preventDefault(); } );
 *
 * @param {Window} window
 * @param {Document} document
 */
function createAddWheelListener(window, document) {
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
	} else {
	  event.deltaY = originalEvent.detail;
	}

	// It's time to fire the callback.
	return callback(event);

      }, useCapture || false);
  };

  return addWheelListenerInternal;
}

/**
 * Capture the mouse pointer in a way that is cross-browser
 * compatible.  You must call crossReleaseCapture() when you no longer
 * need a mouse capture.
 *
 * @param {Element} elmt - The element to set capture on
 * @param {function} onMouseMove - The event handler for `onmousemove`
 * @param {function} onMouseUp - The event handler for `onmouseup'
 */
function crossSetCapture(elmt, onMouseMove, onMouseUp) {
  if (elmt.setCapture) {
    elmt.onmousemove = onMouseMove;
    elmt.onmouseup = onMouseUp;
    elmt.setCapture();
  } else {
    window.onmousemove = onMouseMove;
    window.onmouseup = onMouseUp;
  }
}

/**
 * Release a captured mouse pointer in a way that is cross-browser
 * compatible.
 */
function crossReleaseCapture() {
  if (document.releaseCapture)
    document.releaseCapture();
  else {
    window.onmousemove = null;
    window.onmouseup = null;
  }
}

/********************************************************************/
/* Global Variables */

// Cached getMsieVersion()
msieVersion = getMsieVersion();

// Mouse Calibration Point
var calibPt = null;

// Static storage for MousePos_Get()
var MousePos_getStorage = [];

var addWheelListener = createAddWheelListener(window, document);
