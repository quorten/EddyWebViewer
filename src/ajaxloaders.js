/* Cothreaded base implementations of asynchronous XMLHttpRequest and
   Image loaders.  */

import "compat";
import "cothread";

/**
 * Cothreaded XMLHttpRequest data loading function, class prototype.
 *
 * Parameters:
 *
 * "url" (this.url) -- The URL (as a String) of the data to load.
 *
 * "byteRange" (this.byteRange) -- (optional) An array specifying the
 * range of bytes to download [ min, max ].  Either of the two entries
 * can be an integer or the empty string.
 *
 * "notifyFunc" (this.notifyFunc) -- (optional) The notification
 * callback function to use when there is either more data available
 * or the transfer is complete.  This is typically the cothread
 * controller or a main loop.  This parameter is called from the
 * class's internal handler that directly handles `XMLHttpRequest`
 * notification events.
 *
 * Return value: `XHRLoader.CREATE_FAILED` on failure due to inability
 * to create an XMLHttpRequest (or compatible) object,
 * `XHRLoader.LOAD_FAILED` due to download error,
 * `XHRLoader.PROC_ERROR` for data processing error.  Any other return
 * value is an HTTP status code.  200 is the HTTP OK status, and 206
 * is the HTTP Partial Content status.  Internally, all other status
 * codes are treated as errors.
 *
 * `this.status.preemptCode` may be one of the following values:
 *
 * * 0 (Zero) -- Not applicable `(returnType == CothreadStatus.FINISHED)`.
 *
 * * `CothreadStatus.IOWAIT` -- The cothread is waiting for an
 *   XMLHttpRequest to return more data.  This preemption code is
 *   useful in telling the cothread controller that more work will
 *   only arrive by waiting, so if the cothread controller has no
 *   other work to do, it can quit.  The notification function will
 *   resume it when there is more data to process.
 *
 * * `CothreadStatus.PROC_DATA` -- The cothread has been preempted when it
 *   was processing data rather than waiting for data.  This
 *   preemption code is only used when all data has been downloaded
 *   and only data processing remains.
 *
 * @constructor
 * @param {String} url - URL of data to download.
 * @param {Function} notifyFunc - Notification function to use, as
 * explained above.
 */
var XHRLoader = function(url, notifyFunc) {
  this.url = url;
  this.notifyFunc = notifyFunc;
  this.httpRequest = null;
};

XHRLoader.prototype = new Cothread();
XHRLoader.constructor = XHRLoader;

(function() {
  var i = 0;
  XHRLoader.CREATE_FAILED = i++;
  XHRLoader.LOAD_FAILED = i++;
  XHRLoader.PROC_ERROR = i++;
  XHRLoader.MAX_ENUM = i++; // Useful for derived classes
})();

XHRLoader.prototype.alertContents = function() {
  var httpRequest = this.httpRequest;
  if (!httpRequest)
    return;
  switch (httpRequest.readyState) {
  case 4: // DONE
    return this.notifyFunc();
    break;
  case 3: // LOADING
    /* NOTE: In some browsers, invoking the notification callback here
       can dramatically reduce download speed, so we avoid doing that.
       It is better to use the cothread controller to fetch the
       updated status every one or two seconds or so.  */
    // Call the main loop to update the download status.
    // return setTimeout(this.notifyFunc, 0);
    break;
  case 2: // HEADERS_RECEIVED
    /* For loaders that do not maintain a progress meter in realtime
       but only retrieve progress at the beginning and the end, doing
       this can result in them displaying 0% for some time, so we
       avoid doing that.  */
    // return this.notifyFunc(); // Read the fetched Content-Length.
    break;
  }
};

XHRLoader.prototype.startExec = function() {
  if (this.httpRequest)
    this.httpRequest.abort();

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
    // Error: Could not create XMLHttpRequest (or compatible) object.
    this.httpRequest = null;
    this.retVal = XHRLoader.CREATE_FAILED;
    return;
  }

  if (this.notifyFunc) {
    httpRequest.onreadystatechange = makeEventWrapper(this, "alertContents");
  }
  httpRequest.open("GET", this.url, true);
  if (this.byteRange) {
    var min = this.byteRange[0];
    var max = this.byteRange[1];
    httpRequest.setRequestHeader("Range", "bytes=" + min + "-" + max);
  }
  httpRequest.send();
  this.reqLen = 0; // Used for progress meters
  this.readySyncProcess = false; // Non-preemptable data processing

  this.httpRequest = httpRequest;
};

XHRLoader.prototype.contExec = function() {
  var httpRequest = this.httpRequest;

  if (!httpRequest) {
    this.status.returnType = CothreadStatus.FINISHED;
    this.status.preemptCode = 0;
    return this.status;

  } else if (httpRequest.readyState != 4) {
    this.status.returnType = CothreadStatus.PREEMPTED;
    this.status.preemptCode = CothreadStatus.IOWAIT;

    if (!this.reqLen && httpRequest.readyState >= 2) // HEADERS_RECEIVED
      this.reqLen = +httpRequest.getResponseHeader("Content-Length");
    if (this.reqLen) {
      this.status.percent = httpRequest.responseText.length * 
	CothreadStatus.MAX_PERCENT / this.reqLen;
    } else
      this.status.percent = 0;

    return this.procData(httpRequest);
  }

  // (httpRequest.readyState == 4)

  this.retVal = httpRequest.status;
  /* For our purposes, we'll only consider status codes 200 and 206 as
     acceptable.  */
  if (httpRequest.status != 200 && httpRequest.status != 206 ||
      httpRequest.responseText == null) {
    // Error
    if (httpRequest.responseText == null)
      this.retVal = XHRLoader.LOAD_FAILED;
    httpRequest.onreadystatechange = null;
    this.httpRequest = null;
    this.status.returnType = CothreadStatus.FINISHED;
    this.status.preemptCode = 0;
    return this.status;
  }

  /* Process any remaining data that has not yet been processed.  */
  this.status.returnType = CothreadStatus.PREEMPTED;
  this.status.preemptCode = CothreadStatus.PROC_DATA;

  /* The processing function following this point may be a synchronous
     function that cannot be interrupted, such as JSON parsing, so
     return here to provide updated status to the cothread
     controller.  */
  if (!this.readySyncProcess) {
    this.readySyncProcess = true;
    return this.status;
  }

  this.status.percent = CothreadStatus.MAX_PERCENT;
  return this.procData(httpRequest);
};

/**
 * Example data processing function that parses JSON synchronously.
 * You should replace this with a better function in a instantiated
 * object.  This function is called from `contExec()`.  It should be
 * preemptable and should set and return the `CothreadStatus` object.
 *
 * @param {XMLHttpRequest} httpRequest - Convenience parameter so that
 * the variable does not have to be fetched from `this`.
 *
 * @returns {@linkcode CothreadStatus} object
 */
XHRLoader.prototype.procData = function(httpRequest) {
  var doneProcData = false;
  var procError = false;

  // Program timed cothread loop here.
  if (httpRequest.readyState == 4) {
    try {
      this.procObject = JSON.parse(httpRequest.responseText);
      doneProcData = true;
    }
    catch (e) {
      procError = true;
    }
  }

  if (procError) {
    httpRequest.abort();
    httpRequest.onreadystatechange = null;
    this.httpRequest = null;
    this.retVal = XHRLoader.PROC_ERROR;
    this.status.returnType = CothreadStatus.FINISHED;
    this.status.preemptCode = 0;
    return this.status;
  }

  if (httpRequest.readyState == 4 && doneProcData) {
    /* Only manipulate the CothreadStatus object from within this
       function when processing is entirely finished.  */
    httpRequest.onreadystatechange = null;
    this.httpRequest = null;
    this.status.returnType = CothreadStatus.FINISHED;
    this.status.preemptCode = 0;
  }

  return this.status;
};

/********************************************************************/

/**
 * Cothreaded base class to load and process an image using the
 * `Image()` constructor.  Note that this implementation currently
 * does not support cothreaded data processing of a partially
 * downloaded image.
 *
 * Parameters:
 *
 * "url" (this.url) -- The URL (as a String) of the data to load.
 *
 * "notifyFunc" (this.notifyFunc) -- (optional) The notification
 * callback function to use when there is either more data available
 * or the transfer is complete.  This is typically the cothread
 * controller or a main loop.  This parameter is called from the
 * class's internal handler that directly handles `onload`
 * notification events.
 *
 * Return value:
 *
 * * `ImageLoader.SUCCESS` -- Success
 * * `ImageLoader.CREATE_FAILED` -- Could not create an
 *   HTMLImageElement (or compatible)
 * * `ImageLoader.LOAD_FAILED` -- Error during downloading
 * * `ImageLoader.LOAD_ABORTED` -- Download aborted
 * * `ImageLoader.PROC_ERROR` -- Error during processing
 *
 * `this.status.preemptCode` may be one of the following values:
 *
 * * 0 (Zero) -- Not applicable `(returnType == CothreadStatus.FINISHED)`.
 *
 * * `CothreadStatus.IOWAIT` -- The cothread is waiting for more image
 *   data.  This preemption code is useful in telling the cothread
 *   controller that more work will only arrive by waiting, so if the
 *   cothread controller has no other work to do, it can quit.  The
 *   notification function will resume it when there is more data to
 *   process.
 *
 * * `CothreadStatus.PROC_DATA` -- The cothread has been preempted when
 *   it was processing data rather than waiting for data.  This
 *   preemption code is only used when all data has been downloaded
 *   and only data processing remains.
 *
 * @constructor
 * @param {String} url - URL of data to download.
 * @param {Function} notifyFunc - Notification function to use, as
 * explained above.
 */
var ImageLoader = function(url, notifyFunc) {
  this.url = url;
  this.notifyFunc = notifyFunc;
};

ImageLoader.prototype = new Cothread();
ImageLoader.constructor = ImageLoader;

(function() {
  var i = 0;
  ImageLoader.SUCCESS = i++;
  ImageLoader.CREATE_FAILED = i++;
  ImageLoader.LOAD_FAILED = i++;
  ImageLoader.LOAD_ABORTED = i++;
  ImageLoader.PROC_ERROR = i++;
  ImageLoader.MAX_ENUM = i++; // Useful for derived classes
})();

ImageLoader.prototype.alertContents = function() {
  this.loaded = true;
  this.retVal = ImageLoader.SUCCESS;
  if (this.notifyFunc)
    return this.notifyFunc();
};

ImageLoader.prototype.alertError = function() {
  this.image = null;
  this.retVal = ImageLoader.LOAD_FAILED;
  if (this.notifyFunc)
    return this.notifyFunc();
};

ImageLoader.prototype.alertAbort = function() {
  this.image = null;
  this.retVal = ImageLoader.LOAD_ABORTED;
  if (this.notifyFunc)
    return this.notifyFunc();
};

ImageLoader.prototype.startExec = function() {
  this.image = new Image();
  if (!this.image) {
    // Error: Could not create an HTMLImageElement.
    this.image = null;
    this.retVal = ImageLoader.CREATE_FAILED;
    return;
  }
  this.loaded = false;
  this.readySyncProcess = false; // Non-preemptable data processing
  // image.onloadstart = this.alertLoadStart; // Works only on recent browsers
  // image.onprogress = this.alertProgress; // Works only on recent browsers
  this.image.onload = makeEventWrapper(this, "alertContents");
  this.image.onerror = makeEventWrapper(this, "alertError");
  this.image.onabort = makeEventWrapper(this, "alertAbort");
  this.image.src = this.url;
};

ImageLoader.prototype.contExec = function() {
  if (!this.image) {
    this.status.returnType = CothreadStatus.FINISHED;
    this.status.preemptCode = 0;
    return this.status;
  } else if (!this.loaded) {
    this.status.returnType = CothreadStatus.PREEMPTED;
    this.status.preemptCode = CothreadStatus.IOWAIT;
    this.status.percent = 0;
    return this.status;
  }
  // (this.image.loaded == true)
  this.status.returnType = CothreadStatus.PREEMPTED;
  this.status.preemptCode = CothreadStatus.PROC_DATA;
  this.status.percent = CothreadStatus.MAX_PERCENT;

  /* The processing function following this point may be a synchronous
     function that cannot be interrupted, such as JSON parsing, so
     return here to provide updated status to the cothread
     controller.  */
  if (!this.readySyncProcess) {
    this.readySyncProcess = true;
    return this.status;
  }

  return this.procData(this.image);
};

/**
 * Example image processing function.  Currently does nothing, but you
 * can replace it with a better function in an instantiated object.
 * This function is called from `contExec()`.  It should be
 * preemptable and should set and return the `CothreadStatus` object.
 *
 * @param {HTMLImageElement} image - Convenience parameter so that the
 * variable does not have to be fetched from `this`.
 *
 * @returns {@linkcode CothreadStatus} object
 */
ImageLoader.prototype.procData = function(image) {
  var doneProcData = true;
  var procError = false;

  if (procError) {
    this.image = null;
    this.retVal = ImageLoader.PROC_ERROR;
    this.status.returnType = CothreadStatus.FINISHED;
    this.status.preemptCode = 0;
    return this.status;
  }

  if (doneProcData) {
    /* Only manipulate the CothreadStatus object from within this
       function when processing is entirely finished.  */
    this.status.returnType = CothreadStatus.FINISHED;
    this.status.preemptCode = 0;
  }

  return this.status;
};
