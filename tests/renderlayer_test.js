/* A convenient unified framework for testing RenderLayers.  To use
   this test framework:

   1. Make sure the code of the RenderLayer to be tested is within the
      list of `import' statements below.

   2. Create a JavaScript bundle.

   3. Include the bundle in a webpage.

   4. Within the webpage, define and set the `TestLayer' variable to
      point to the RenderLayer object that should be tested.

   5. Add the attribute-value pair `onload="setup(width, height, mouse)"'
      to the body element of your HTML test container, with `width'
      `height' replaced with the desired width and height of the
      canvas, and `mouse' set to `true' if you want a mouse connected
      by default.

   The idea of this JavaScript file is to provide not only setup
   routines for a test webpage, but also convenient functions for
   typing directly in a web developer console.  Here is the command
   repertoire:

   * start() -- Initiate a new render job.

   * halt(), stop() -- Stop a render job in progress.

   * setViewport(width, height) -- Change all variables needed to set
     the viewport to the given dimensions.

   * setScale(scale) -- Change all variables needed to set the scale
     to the given dimensions.

   * `play = true', `play = false': Toggle playing a RenderLayer in
     full-motion animation, at the maximum possible speed.

   * setTestLayer(layer) -- Dynamically switch the layer to be tested
     to the given layer, performing all necessary reconfiguration.

   * OEV.connectMouse(TestLayer.frontBuf, OEV.gViewParams,
                      tmMove, tmStop, tmMove) -- Connect mouse event
     handlers to the current TestLayer that manipulate the global
     ViewParams.

*/

import "../src/oevns";
import "../src/cothread";
import "../src/compat";
import "../src/dates";
import "../src/earthtexlayer";
import "../src/sshlayer";
import "../src/trackslayer";
import "../src/projector";
import "../src/viewparams";

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

/* We want the test instrumentation to be outside of the OEV
   namespace.  */
import "../src/oevnsend";

var progElmt, rendTimeElmt, rendStartTime;
var stopSignal = false;
var play = false;

var execTime = function() {
  var status = TestLayer.continueCT();
  var preemptCode = status.preemptCode;
  if (!play) {
    if (preemptCode == OEV.CothreadStatus.IOWAIT) {
      progElmt.childNodes[0].nodeValue =
	[ "Download: ",
	  (status.percent * 100 /
	   OEV.CothreadStatus.MAX_PERCENT).toFixed(2), "%" ].
	join("");
    } else if (preemptCode == OEV.CothreadStatus.PROC_DATA)
      progElmt.childNodes[0].nodeValue =
	"Processing downloaded data, please wait...";
    else if (preemptCode == OEV.RenderLayer.RENDERING) {
      progElmt.childNodes[0].nodeValue =
	[ "Render: ",
	  (status.percent * 100 /
	   OEV.CothreadStatus.MAX_PERCENT).toFixed(2), "%" ].
	join("");
    }
  }

  if (status.returnType == OEV.CothreadStatus.FINISHED) {
    if (TestLayer.retVal == OEV.RenderLayer.LOAD_ERROR)
      progElmt.childNodes[0].nodeValue =
	"Error occurred during download.";
    var totalTime = (Date.now() - rendStartTime) / 1000;
    if (play)
      rendTimeElmt.childNodes[0].nodeValue = "FPS: " +
	(1 / totalTime).toFixed(3);
    else
      rendTimeElmt.childNodes[0].nodeValue = "Total render time: " +
	totalTime.toFixed(3) + " seconds";
    if (stopSignal)
      { stopSignal = false; return; }
    if (play && TestLayer.retVal != OEV.RenderLayer.LOAD_ERROR) {
      OEV.Dates.curDate++;
      if (OEV.Dates.curDate < OEV.Dates.dateList.length)
	return requestAnimationFrame(start);
      else {
	OEV.Dates.curDate = 0;
	progElmt.childNodes[0].nodeValue = "Done";
      }
    }
    return;
  }
  if (preemptCode == OEV.CothreadStatus.IOWAIT)
    return;
  if (stopSignal)
    { stopSignal = false; return; }
  return requestAnimationFrame(execTime);
};

var start = function() {
  progElmt.childNodes[0].nodeValue =
    "Please wait...";
  if (!play)
    rendTimeElmt.childNodes[0].nodeValue =
      "Calculating total render time...";
  rendStartTime = Date.now();

  var status = TestLayer.start();
  if (status.preemptCode == OEV.CothreadStatus.IOWAIT)
    return;
  if (stopSignal)
    { stopSignal = false; return; }
  return requestAnimationFrame(execTime);
};

var halt = function() {
  stopSignal = true;
};

var stop = halt;

var setViewport = function(width, height) {
  OEV.gViewParams.viewport[0] = width;
  OEV.gViewParams.viewport[1] = height;
  OEV.gViewParams.aspectXY = width / height;
  TestLayer.setViewport(width, height);
};

var setScale = function(scale) {
  OEV.gViewParams.scale = scale;
  OEV.gViewParams.inv_scale = 1 / scale;
};

var finishSetup = function() {
  if (OEV.Dates.dateList) {
    OEV.Dates.notifyFunc = null;
    return start();
  } else {
    OEV.Dates.continueCT();
    return window.setTimeout(finishSetup, 15);
  }
};

var setup = function(width, height, mouse) {
  // Append a progress counter element to the document body.
  progElmt = document.createElement("p");
  progElmt.id = "progElmt";
  progElmt.appendChild(document.createTextNode("Please wait..."));
  rendTimeElmt = document.createElement("p");
  rendTimeElmt.id = "rendTimeElmt";
  rendTimeElmt.appendChild(document.createTextNode("Starting up..."));
  TestLayer.frontBuf.id = "testLayer";
  TestLayer.frontBuf.style.cssText =
    "border-style: solid; margin: 0px auto; display: block";

  var body = document.getElementById("topBody");
  body.appendChild(progElmt);
  body.appendChild(rendTimeElmt);
  body.appendChild(TestLayer.frontBuf);

  TestLayer.timeout = 15;
  TestLayer.notifyFunc = execTime;

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

  if (mouse)
    OEV.connectMouse(TestLayer.frontBuf, OEV.gViewParams,
		     tmMove, tmStop, tmMove);

  // Load the dates.
  OEV.Dates.timeout = 15;
  OEV.Dates.notifyFunc = finishSetup;
  OEV.Dates.start();
};

var setTestLayer = function(layer) {
  var oldTestEl = document.getElementById("testLayer");
  TestLayer = layer;
  TestLayer.frontBuf.id = "testLayer";
  TestLayer.frontBuf.style.cssText =
    "border-style: solid; margin: 0px auto; display: block";
  TestLayer.timeout = 15;
  TestLayer.notifyFunc = execTime;
  var body = document.getElementById("topBody");
  body.replaceChild(TestLayer.frontBuf, oldTestEl);

  setViewport(OEV.gViewParams.viewport[0], OEV.gViewParams.viewport[1]);

  /* If a mouse was connected to the old TestLayer but not yet
     connected to the new TestLayer, then connect it.  */
  if (oldTestEl.onmousedown && !TestLayer.frontBuf.onmousedown)
    OEV.connectMouse(TestLayer.frontBuf, OEV.gViewParams,
		     tmMove, tmStop, tmMove);
};

/* This is something that really should be possible directly within
   the original code, but circular includes prevent that from being
   viable...  */
OEV.gViewParams.projector = OEV.EquirectProjector;

var tmMove = function() {
  /* Only allow one iteration:
  var doit = function() { TestLayer.start(); };
  if (OEV.allocRenderJob(doit)) doit(); */
  if (OEV.allocRenderJob(start)) start();
  return false;
};

var tmStop = function() {
  /* Finish the remaining iterations:
  if (OEV.allocRenderJob(start)) start(); */
  return false;
};
