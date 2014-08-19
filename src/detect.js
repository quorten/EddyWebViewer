/* Required startup feature detection.  */

import "oevns";

/*

JavaScript language core checks
*******************************

Array: [], new Array, a[i], length, push, pop, splice, slice, join

new Date().getTime, Date.now()

String: charCodeAt, substr, substring, indexOf, split

Regexp: exec

JSON: JSON.parse

Math: sin, cos, tan, atan2, asin, acos, sqrt, PI

Web API
*******

document: getElementById(), createElement()

excanvas depends on getElementsByTagName

new Image()

performance.now
window.performance.now

window.setTimeout

window.atob, window.btoa, window.onerror

window.ActiveXObject, window.ActiveXObject("Microsoft.XMLHTTP"),
ActiveXObject("Msxml2.XMLHTTP"), XMLHttpRequest

XMLHttpRequest: abort, open, setRequestHeader, overrideMimeType, send,
readyState, getResponseHeader, responseText, responseXML (unused),
responseType, status, onreadystatechange, onprogress

document.createElement('canvas')

canvas.getContext("2d")
// ctx.createImageData() unused
ctx.fill = color; ctx.stroke = color;
ctx.clearRect()
// ctx.fillRect() unused
ctx.beginPath()
ctx.getImageData()
ctx.putImageData()
ctx.moveTo()
ctx.lineTo()
ctx.arc()
ctx.stroke()
ctx.closePath()
ctx.fill()

optional

Checking for DataView

Checking for mouse input
Checking for mouse wheel
Checking for innerHTML
NOTE Maybe innerHTML will not be needed.
Checking for data URI support
Checking for HTML canvas support
Checking for HTML 5 video support
Checking for WebGL support

 */



/* Note: Exception handling is mandatory for JSON parsing.  */

/* This function is a specially formulated XMLHttpRequest detection
   function that does not require exception handling.  */
var detectXHR = function(resume) {
  if (!OEV.xhrDetectStage) {
    OEV.xhrDetectStage = 0;
    // Use `window.onerror' instead of exception handling.
    window.defonerror = onerror;
    window.onerror = function() {
      OEV.xhrDetectStage++;
      window.setTimeout(function { return detectXHR(resume); }, 0);
      return true;
    };
  }

  var httpRequest;
  switch (OEV.xhrDetectStage) {
  case 0:
    // We probably should do isHostObject()...
    // if (typeof(XMLHttpRequest) != "undefined")
    if (window.XMLHttpRequest)
      break;
    OEV.xhrDetectStage++;
    return detectXHR(resume);
  case 1:
    httpRequest = new ActiveXObject("Msxml2.XMLHTTP");
    window.XMLHttpRequest = function()
      { return new ActiveXObject("Msxml2.XMLHTTP"); };
    break;
  case 2:
    httpRequest = new ActiveXObject("Microsoft.XMLHTTP");
    window.XMLHttpRequest = function()
      { return new ActiveXObject("Microsoft.XMLHTTP"); };
    break;
  default:
    // Error: XMLHttpRequest not available.
    break;
  }

  OEV.xhrDetectStage = null;
  window.onerror = window.defonerror;
  window.defonerror = null;
  return resume();
};

/* This is an XMLHttpRequest function that uses exception handling to
   detect XMLHttpRequest.  */
var tryDetectXHR = function() {
  var httpRequest;
  // We probably should do isHostObject()...
  // if (typeof(XMLHttpRequest) != "undefined")
  if (window.XMLHttpRequest)
    return;
  else if (window.ActiveXObject) {
    try {
      httpRequest = new ActiveXObject("Msxml2.XMLHTTP");
      window.XMLHttpRequest = function()
	{ return new ActiveXObject("Msxml2.XMLHTTP"); };
    }
    catch (e) {
      try {
	httpRequest = new ActiveXObject("Microsoft.XMLHTTP");
	window.XMLHttpRequest = function()
	  { return new ActiveXObject("Microsoft.XMLHTTP"); };
      }
      catch (e) {}
    }
  }
};

/* This function is dynamically loaded depending on whether exception
   handling and JSON are available.  */
var tryJSONParse = function(text) {
  var jsonObject = null;
  try {
    jsonObject = JSON.parse(text);
  }
  catch (e) {
    return null;
  }
  return jsonObject;
};

var safeJSONParse = function(text) {
  if (!JSON.parse)
    return null;
  return tryJSONParse(text);
};

/* Do not use any isHost* methods outside of feature detection at
   startup.  */

/* If you can't entirely refrain from any try-catch expressions in the
   code, then the syntax is mandatory.  */
