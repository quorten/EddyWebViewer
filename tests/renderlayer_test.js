/* Test a RenderLayer.  Within the HTML test bench, the `TestLayer'
   variable must be defined to be the layer that should be tested.  */

import "../src/sshlayer";
import "../src/trackslayer";
import "../src/projector";
import "../src/viewparams";

/* We want the test instrumentation to be outside of the OEV
   namespace.  */
import "../src/oevnsend";

var CothreadStatus = OEV.CothreadStatus;

var progElmt, rendTimeElmt, rendStartTime;
var stopSignal = false;

var execTime = function() {
  var status = TestLayer.continueCT();
  var preemptCode = status.preemptCode;
  if (preemptCode == CothreadStatus.IOWAIT) {
    progElmt.childNodes[0].nodeValue =
      [ "Download: ",
      (status.percent * 100 / CothreadStatus.MAX_PERCENT).toFixed(2), "%"].
      join("");
  } else if (preemptCode == CothreadStatus.PROC_DATA)
    progElmt.childNodes[0].nodeValue =
      "Processing downloaded data, please wait...";
  else if (preemptCode == OEV.RenderLayer.RENDERING) {
    progElmt.childNodes[0].nodeValue =
      [ "Render: ",
      (status.percent * 100 / CothreadStatus.MAX_PERCENT).toFixed(2), "%" ].
      join("");
  }

  if (status.returnType == CothreadStatus.FINISHED) {
    if (TestLayer.retVal == OEV.RenderLayer.LOAD_ERROR)
      progElmt.childNodes[0].nodeValue =
	"Error occurred during download.";
    var totalTime = (Date.now() - rendStartTime) / 1000;
    rendTimeElmt.childNodes[0].nodeValue = "Total render time: " +
      totalTime.toFixed(3) + " seconds";
    return;
  }
  if (preemptCode == CothreadStatus.IOWAIT)
    return;
  return browserTime();
};

var browserTime = function() {
  if (stopSignal)
    { stopSignal = false; return; }
  /* Note: On older browsers, the timeout interval might need to be
     larger than zero in order for the control to actually return to
     the browser.  */
  return window.setTimeout(execTime, 0);
};

var start = function() {
  progElmt.childNodes[0].nodeValue =
    "Please wait...";
  rendTimeElmt.childNodes[0].nodeValue =
    "Calculating total render time...";
  rendStartTime = Date.now();

  var status = TestLayer.start();
  if (status.returnType != CothreadStatus.FINISHED) {
    if (status.preemptCode == CothreadStatus.IOWAIT)
      return;
    return browserTime();
  }
};

var halt = function() {
  stopSignal = true;
};

var stop = halt;

var setViewport = function(width, height) {
  OEV.ViewParams.viewport[0] = width;
  OEV.ViewParams.viewport[1] = height;
  OEV.ViewParams.aspectXY = width / height;
  TestLayer.setViewport(width, height);
};

var setScale = function(scale) {
  OEV.ViewParams.scale = scale;
  OEV.ViewParams.inv_scale = 1 / scale;
};

var setup = function() {
  // Append a progress counter element to the document body.
  progElmt = document.createElement("p");
  progElmt.id = "progElmt";
  progElmt.appendChild(document.createTextNode(""));
  rendTimeElmt = document.createElement("p");
  rendTimeElmt.id = "rendTimeElmt";
  rendTimeElmt.appendChild(document.createTextNode(""));

  var body = document.getElementById("topBody");
  body.appendChild(progElmt);
  body.appendChild(rendTimeElmt);
  body.appendChild(TestLayer.frontBuf);

  TestLayer.timeout = 15;
  TestLayer.notifyFunc = execTime;

  var width = 1440, height = 721;

  /* Convenience code to render at a smaller size if the browser
     content area is smaller than the nominal render size. */
  // Warning: clientWidth and clientHeight marked as unstable in MDN.
  var docWidth = document.documentElement.clientWidth;
  var docHeight = document.documentElement.clientHeight;
  if (docWidth < width || docHeight < height) {
    var dim = (docWidth < docHeight * 2) ? docWidth : docHeight * 2;
    width = 0|dim; height = 0|(dim / 2);
  }

  setViewport(width, height);
  OEV.ViewParams.projector = OEV.EquirectProjector;
  return start();
};
