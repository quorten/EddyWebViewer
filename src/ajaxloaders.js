/* Cothreaded base implementations of asynchronous XMLHttpRequest and
   Image loaders.  */

import "oevns";
import "compat";
import "cothread";

/**
 * Cothreaded base class for XMLHttpRequest data loaders.
 *
 * Basic usage (JSON loading example):
 *
 * ~~~
 * var jsonObject;
 *
 * var jsonLoader = new XHRLoader("data.json", resumeMainLoop);
 * jsonLoader.listenOnProgress = true;
 * jsonLoader.start();
 * // Enter the main loop, wait for finish condition...
 * var status = jsonLoader.continueCT();
 * if (status.returnType == CothreadStatus.FINISHED)
 *   jsonObject = jsonLoader.jsonObject;
 * ~~~
 *
 * Usually, you will create a derived class using
 * {@linkcode XHRLoader} as the base class and override the
 * {@linkcode XHRLoader#procData} function to provide appropriate
 * processing for the specific application usage.  The source code of
 * the example `procData` function in `XHRLoader` provides more
 * information on how to properly do this.
 *
 * Parameters:
 *
 * "url" (this.url) -- The URL (as a String) of the data to load.
 *
 * "notifyFunc" (this.notifyFunc) -- (optional) The notification
 * callback function to use when there is either more data available
 * or the transfer is complete.  This is typically the cothread
 * controller or a main loop.  This parameter is called from the
 * class's internal handler that directly handles `XMLHttpRequest`
 * notification events.  Function prototype:
 * `function(event) { return preventDefault; }`
 *
 * "byteRange" (this.byteRange) -- (optional) An array specifying the
 * range of bytes to download [ min, max ].  Either of the two entries
 * can be an integer or the empty string.
 *
 * "charRange" (this.charRange) -- (optional) If specified, this
 * assumes the text encoding is UTF-16 with BOM and automatically
 * calculates `byteRange` from the given [ min, max ] values in
 * `charRange`.
 *
 * "listenOnProgress" (this.listenOnProgress) -- (optional) If `true`,
 * listen to `progress` events.  This can provide for a more efficient
 * way to get the download progress than reading
 * `httpRequest.responseText.length` in `readystatechange` events.
 * Unfortunately, progress events can cause dramatic throughput
 * slowdowns on some (old) browsers.
 *
 * "notifyProgress" (this.notifyProgress) -- (optional) If both
 * "listenOnProgress" and this parameter are `true`, then call
 * "notifyFunc" (if specified) every time a `progress` event is
 * processed.
 *
 * Return value:
 *
 * * `XHRLoader.CREATE_FAILED` on failure due to inability
 *   to create an XMLHttpRequest (or compatible) object,
 * * `XHRLoader.LOAD_FAILED` due to download error,
 * * `XHRLoader.PROC_ERROR` for data processing error.
 * * Any other return value is an HTTP status code.  200 is the HTTP
 *   OK status, and 206 is the HTTP Partial Content status.
 *
 * `this.status.preemptCode` may be one of the following values:
 *
 * * 0 (Zero) -- Not applicable `(returnType == CothreadStatus.FINISHED)`.
 *
 * * `CothreadStatus.IOWAIT` -- The cothread is waiting for an
 *   XMLHttpRequest to return more data.  This preemption code is
 *   useful in telling the cothread controller that more work will
 *   only arrive by waiting, so if the cothread controller has no
 *   other work to do, it can quit.  The notification function can
 *   resume this cothread when there is more data to process.  (Note
 *   of origin: IOWAIT was introduced into the CothreadStatus due to
 *   the slowness in browsers of determining download progress via
 *   reading the `responseText.length` member of an `XMLHttpRequest`.)
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
  this.byteRange = null;
  this.charRange = null;
  this.listenOnProgress = null;
  this.notifyProgress = null;
  this.httpRequest = null;

  /**
   * Number of bytes downloaded so far, or `null` if it cannot be
   * determined.  Used for progress calculations.
   * @type integer
   * @readonly
   */
  this.progLen = null;
  /**
   * Total number of bytes in request.  Used for progress
   * calculations.
   * @type integer
   * @readonly
   */
  this.reqLen = 0;
};

OEV.XHRLoader = XHRLoader;
XHRLoader.prototype = new Cothread();
XHRLoader.prototype.constructor = XHRLoader;

(function() {
  var i = 0;
  XHRLoader.CREATE_FAILED = i++;
  XHRLoader.LOAD_FAILED = i++;
  XHRLoader.PROC_ERROR = i++;
  XHRLoader.MAX_ENUM = i++; // Useful for derived classes
})();

XHRLoader.prototype.alertContents = function(origThis, event) {
  var httpRequest = this.httpRequest;
  if (!httpRequest)
    return;
  switch (httpRequest.readyState) {
  case 4: // DONE
    return this.notifyFunc(origThis, event);
    break;
  case 3: // LOADING
    /* NOTE: In some browsers, invoking the notification callback here
       can dramatically reduce download speed, so we avoid doing that.
       It is better to use the cothread controller to fetch the
       updated status every one or two seconds or so.  */
    // Call the main loop to update the download status.
    // return setTimeout(function()
    //   { return this.notifyFunc(origThis, event); }, 0);
    break;
  case 2: // HEADERS_RECEIVED
    /* For loaders that do not maintain a progress meter in realtime
       but only retrieve progress at the beginning and the end, doing
       this can result in them displaying 0% for some time after the
       initial "please wait" display, so we avoid doing that.  */
    // Read the fetched Content-Length.
    // return this.notifyFunc(origThis, event);
    break;
  }
};

XHRLoader.prototype.updateProgress = function(origThis, event) {
  this.progLen = event.loaded;
  if (this.notifyProgress && this.notifyFunc)
    return this.notifyFunc(origThis, event);
};

XHRLoader.prototype.alertError = function(origThis, event) {
  this.httpRequest = null;
  this.retVal = XHRLoader.LOAD_FAILED;
  if (this.notifyFunc)
    return this.notifyFunc(origThis, event);
};

XHRLoader.prototype.initCtx = function() {
  if (this.httpRequest)
    this.httpRequest.abort();

  var httpRequest;
  if (window.XMLHttpRequest)
    httpRequest = new XMLHttpRequest();

  if (!httpRequest) {
    // Error: Could not create XMLHttpRequest (or compatible) object.
    this.httpRequest = null;
    this.retVal = XHRLoader.CREATE_FAILED;
    this.status.returnType = CothreadStatus.FINISHED;
    this.status.preemptCode = 0;
    this.status.percent = CothreadStatus.MAX_PERCENT;
    return;
  }

  if (this.notifyFunc)
    httpRequest.onreadystatechange = makeEventWrapper(this, "alertContents");
  if (this.listenOnProgress)
    httpRequest.onprogress = makeEventWrapper(this, "updateProgress");
  httpRequest.onerror = makeEventWrapper(this, "alertError");
  httpRequest.open("GET", this.url, true);
  if (this.charRange) {
    this.byteRange =
      [ (this.charRange[0]) ? 2 + this.charRange * 2 : "",
	(this.charRange[1]) ? 2 + this.charRange * 2 : "" ];
  }
  if (this.byteRange) {
    var min = this.byteRange[0];
    var max = this.byteRange[1];
    httpRequest.setRequestHeader("Range", "bytes=" + min + "-" + max);
  }
  httpRequest.send();
  this.progLen = null;
  this.reqLen = 0;
  this.readySyncProcess = false; // Non-preemptable data processing
  this.httpRequest = httpRequest;

  this.status.returnType = CothreadStatus.PREEMPTED;
  this.status.preemptCode = 0;
  this.status.percent = 0;
};

XHRLoader.prototype.contExec = function() {
  var httpRequest = this.httpRequest;

  if (!httpRequest) {
    this.status.returnType = CothreadStatus.FINISHED;
    this.status.preemptCode = 0;
    return this.status;
  }
  else if (httpRequest.readyState != 4) {
    this.status.returnType = CothreadStatus.PREEMPTED;
    this.status.preemptCode = CothreadStatus.IOWAIT;

    if (!this.reqLen && httpRequest.readyState >= 2) // HEADERS_RECEIVED
      this.reqLen = +httpRequest.getResponseHeader("Content-Length");
    if (this.reqLen) {
      if (this.progLen)
	this.status.percent = this.progLen *
	  CothreadStatus.MAX_PERCENT / this.reqLen;
      else this.status.percent = httpRequest.responseText.length *
	     CothreadStatus.MAX_PERCENT / this.reqLen;
    } else
      this.status.percent = 0;

    return this.procData(httpRequest, httpRequest.responseText);
  }

  // (httpRequest.readyState == 4)
  var responseText = httpRequest.responseText;
  this.retVal = httpRequest.status;

  /* Process any remaining data that has not yet been processed.  */
  this.status.returnType = CothreadStatus.PREEMPTED;
  this.status.preemptCode = CothreadStatus.PROC_DATA;
  /* if (this.url == "../data/tracks/acyc_bu_tracks.json") {
    console.log("Give up");
    console.log(this.status);
    console.log(this);
    console.log(this.status.returnType);
    console.log(CothreadStatus.PREEMPTED);
  } */

  /* The processing function following this point may be a synchronous
     function that cannot be interrupted, such as JSON parsing, so
     return here to provide updated status to the cothread
     controller.  */
  if (!this.readySyncProcess) {
    this.readySyncProcess = true;
    return this.status;
  }

  this.status.percent = CothreadStatus.MAX_PERCENT;
  return this.procData(httpRequest, responseText);
};

/* For those wishing to reuse this library but not use advanced
   feature detection at startup, this is a default function for
   safeJSONParse().  */
var safeJSONParse = function(text) {
  var jsonObject = null;
  try {
    jsonObject = JSON.parse(text);
  }
  catch (e) {
    return null;
  }
  return jsonObject;
};

/**
 * Example data processing hook that parses JSON synchronously.
 * Instantiated objects should replace this with a better function.
 * It should be preemptable and should set and return the
 * `CothreadStatus` object, because this function is called from
 * `contExec()` to process data after it has arrived.
 *
 * @param {XMLHttpRequest} httpRequest - Convenience parameter so that
 * the variable does not have to be fetched from `this`.
 *
 * @param {XMLHttpRequest} responseText - Convenience parameter so
 * that the variable does not have to be fetched from `httpRequest`.
 * Every access to `httpRequest.responseText` has significant overhead
 * due to translation from a DOMString to a JavaScript String.  Thus,
 * you should use this variable to access the response text to avoid
 * performance penalties.
 *
 * @returns {@linkcode CothreadStatus} object
 */
XHRLoader.prototype.procData = function(httpRequest, responseText) {
  var doneProcData = false;
  var procError = false;

  if (httpRequest.readyState == 3) { // LOADING
    /* Process partial data here (possibly with timed cothread
       loop).  */
  }
  else if (httpRequest.readyState == 4) { // DONE
    /* Determine if the HTTP status code is an acceptable success
       condition.  */
    if ((httpRequest.status == 200 || httpRequest.status == 206) &&
	responseText == null)
      this.retVal = XHRLoader.LOAD_FAILED;
    if (httpRequest.status != 200 && httpRequest.status != 206 ||
	responseText == null) {
      // Error
      httpRequest.onreadystatechange = null;
      this.httpRequest = null;
      this.status.returnType = CothreadStatus.FINISHED;
      this.status.preemptCode = 0;
      return this.status;
    }

    /* Perform final cothreaded (or possibly synchronous) data
       processing here.  */
    this.jsonObject = safeJSONParse(responseText);
    doneProcData = true;
    if (!this.jsonObject)
      procError = true;
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

/**
 * Abort a transfer in progress and clear the `XHRLoader` request
 * state so that the cothreaded processing does not try to continue
 * the request.
 */
XHRLoader.prototype.abort = function() {
  this.httpRequest.onreadystatechange = null;
  this.httpRequest.abort();
  this.httpRequest = null;
  this.status.returnType = CothreadStatus.FINISHED;
  this.status.preemptCode = 0;
};

/********************************************************************/

/**
 * Cothreaded base class to load and process an image using the
 * `Image()` constructor.  Note that this implementation currently
 * does not support cothreaded data processing of a partially
 * downloaded image.
 *
 * Basic usage:
 *
 * ~~~
 * var image;
 *
 * var imageLoader = new ImageLoader("image.png", resumeMainLoop);
 * imageLoader.listenOnProgress = true;
 * imageLoader.start();
 * // Enter the main loop, wait for finish condition...
 * var status = imageLoader.continueCT();
 * if (status.returnType == CothreadStatus.FINISHED)
 *   image = imageLoader.image;
 * ~~~
 *
 * Usually, you will create a derived class using
 * {@linkcode ImageLoader} as the base class and override the
 * {@linkcode ImageLoader#procData} function to provide appropriate
 * processing for the specific application usage.  The source code of
 * the example `procData` function in `ImageLoader` provides more
 * information on how to properly do this.
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
 * notification events.  Function prototype:
 * `function(event) { return preventDefault; }`
 *
 * "listenOnProgress" (this.listenOnProgress) -- (optional) If `true`,
 * listen to `progress` events.  Unfortunately, progress events can
 * cause dramatic throughput slowdowns on some (old) browsers.
 *
 * "notifyProgress" (this.notifyProgress) -- (optional) If both
 * "listenOnProgress" and this parameter are `true`, then call
 * "notifyFunc" (if specified) every time a `progress` event is
 * processed.
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
 *   notification function can resume this cothread when there is more
 *   data to process.
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
  this.listenOnProgress = null;
  this.notifyProgress = null;
  this.image = null;

  /**
   * Number of bytes downloaded so far, or `null` if it cannot be
   * determined.  Used for progress calculations.
   * @type integer
   * @readonly
   */
  this.progLen = null;
  /**
   * Total number of bytes in request, or zero if it cannot be
   * determined.  Used for progress calculations.
   * @type integer
   * @readonly
   */
  this.reqLen = 0;
};

OEV.ImageLoader = ImageLoader;
ImageLoader.prototype = new Cothread();
ImageLoader.prototype.constructor = ImageLoader;

(function() {
  var i = 0;
  ImageLoader.SUCCESS = i++;
  ImageLoader.CREATE_FAILED = i++;
  ImageLoader.LOAD_FAILED = i++;
  ImageLoader.LOAD_ABORTED = i++;
  ImageLoader.PROC_ERROR = i++;
  ImageLoader.MAX_ENUM = i++; // Useful for derived classes
})();

ImageLoader.prototype.alertContents = function(origThis, event) {
  this.loaded = true;
  this.retVal = ImageLoader.SUCCESS;
  if (this.notifyFunc)
    return this.notifyFunc(origThis, event);
};

ImageLoader.prototype.alertLoadStart = function(origThis, event) {
  return this.notifyFunc(origThis, event);
};

ImageLoader.prototype.updateProgress = function(origThis, event) {
  if (!this.reqLen)
    this.reqLen = event.total;
  this.progLen = event.loaded;
  if (this.notifyProgress && this.notifyFunc)
    return this.notifyFunc(origThis, event);
};

ImageLoader.prototype.alertError = function(origThis, event) {
  this.image = null;
  this.retVal = ImageLoader.LOAD_FAILED;
  if (this.notifyFunc)
    return this.notifyFunc(origThis, event);
};

ImageLoader.prototype.alertAbort = function(origThis, event) {
  this.image = null;
  this.retVal = ImageLoader.LOAD_ABORTED;
  if (this.notifyFunc)
    return this.notifyFunc(origThis, event);
};

ImageLoader.prototype.initCtx = function() {
  this.image = new Image();
  if (!this.image) {
    // Error: Could not create an HTMLImageElement.
    this.image = null;
    this.retVal = ImageLoader.CREATE_FAILED;
    this.status.returnType = CothreadStatus.FINISHED;
    this.status.preemptCode = 0;
    this.status.percent = CothreadStatus.MAX_PERCENT;
    return;
  }
  this.loaded = false;
  this.readySyncProcess = false; // Non-preemptable data processing
  this.image.onload = makeEventWrapper(this, "alertContents");
  if (this.listenOnProgress) {
    if (this.notifyProgress && this.notifyFunc)
      this.image.onloadstart = makeEventWrapper(this, "alertLoadStart");
    this.image.onprogress = makeEventWrapper(this, "updateProgress");
  }
  this.image.onerror = makeEventWrapper(this, "alertError");
  this.image.onabort = makeEventWrapper(this, "alertAbort");
  this.image.src = this.url;
  this.progLen = null;
  this.reqLen = 0;

  this.status.returnType = CothreadStatus.PREEMPTED;
  this.status.preemptCode = CothreadStatus.IOWAIT;
  this.status.percent = 0;
};

ImageLoader.prototype.contExec = function() {
  if (!this.image) {
    this.status.returnType = CothreadStatus.FINISHED;
    this.status.preemptCode = 0;
    return this.status;
  } else if (!this.loaded) {
    this.status.returnType = CothreadStatus.PREEMPTED;
    this.status.preemptCode = CothreadStatus.IOWAIT;
    if (this.reqLen && this.progLen)
      this.status.percent =
	this.progLen * CothreadStatus.MAX_PERCENT / this.reqLen;
    else this.status.percent = 0;
    return this.status;
  }
  // (this.loaded == true)
  this.status.returnType = CothreadStatus.PREEMPTED;
  this.status.preemptCode = CothreadStatus.PROC_DATA;
  this.status.percent = CothreadStatus.MAX_PERCENT;

  /* The processing function following this point may be a synchronous
     function that cannot be interrupted, so return here to provide
     updated status to the cothread controller.  */
  if (!this.readySyncProcess) {
    this.readySyncProcess = true;
    return this.status;
  }

  return this.procData(this.image);
};

/**
 * Example image processing hook.  Currently it does nothing.
 * Instantiated objects should replace this with a better function.
 * It should be preemptable and should set and return the
 * `CothreadStatus` object, because this function is called from
 * `contExec()` to process an image once it has been fully downloaded.
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
