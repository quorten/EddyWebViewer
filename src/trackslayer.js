/* Render layer for display of the eddy tracks layer.  */

import "renderlayer";
import "projector";

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
 * * TracksLayer.IOWAIT --- The cothread is waiting for an
 *   XMLHttpRequest to finish.  For optimal performance, the
 *   controller should not explicitly call continueCT(), since the
 *   asynchronous calling will be handled by the browser during data
 *   loading.  When the data is finished being loaded, this cothread
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
	return execTime();
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

TracksLayer.setViewport = function(center, width, height, projector) {
  // RenderLayer.call(center, width, height, projection);
  this.frontBuf.width = width;
  this.frontBuf.height = height;

  this.center = center;
  this.projector = projector;

  return RenderLayer.READY;
};

var backbufScale = 1;
var minTrackLen = 0, maxTrackLen = -1;
var numericDates = [];
var dateIndex = 0;
var inv_180 = 1 / 180, inv_360 = 1 / 360;

TracksLayer.render = (function() {
  "use strict";

  function startExec() {
    var frontBuf = TracksLayer.frontBuf;
    var edc = frontBuf.getContext("2d");
    this.edc = edc;

    edc.clearRect(0, 0, frontBuf.width, frontBuf.height);
    edc.lineWidth = backbufScale;
    edc.strokeStyle = "#800080";
    edc.lineJoin = "round";

    this.i = 0;
  }

  function contExec() {
    var edc = this.edc;
    var i = this.i;

    /* Data format: [list of tracks]
       track: [ list of eddies ]
       eddy: [ latitude, longitude, date_index, eddy_index ]
     */
    var tracksData = TracksLayer.tracksData;
    var numTracks = tracksData.length;
    var frontBuf_width = TracksLayer.frontBuf.width;
    var frontBuf_height = TracksLayer.frontBuf.height;
    // var projector = TracksLayer.projector;
    var projector_project = TracksLayer.projector.project;

    var lDate_now = Date.now;

    var lastTime = lDate_now();
    var timeout = this.timeout;
    for (; lDate_now() - lastTime < timeout && i < numTracks; i++) {
      if (minTrackLen > 0 || maxTrackLen != -1) {
	// Determine the length of the eddy in weeks.
	var numEddies = tracksData[i].length;
	var firstDateIdx = tracksData[i][0][2];
	var lastDateIdx = tracksData[i][numEddies-1][2];
	var trackLen = numericDates[lastDateIdx] - numericDates[firstDateIdx];

	if (trackLen < minTrackLen)
	  continue;
	if (maxTrackLen != -1 && trackLen > maxTrackLen)
	  continue;
      }

      edc.beginPath();
      // var lat = tracksData[i][0][0];
      // var lon = tracksData[i][0][1];
      // var mapX = (lon + 180) * inv_360 * frontBuf_width;
      // var mapY = (90 - lat) * inv_180 * frontBuf_height;
      var polCoord = { lat: tracksData[i][0][0], lon: tracksData[i][0][1] };
      var mapCoord = projector_project(polCoord);
      edc.moveTo((mapCoord.x + 1) * 0.5 * frontBuf_width,
		 (-mapCoord.y + 1) * 0.5 * frontBuf_height);
      for (var j = 1; j < tracksData[i].length; j++) {
	// lat = tracksData[i][j][0];
	// lon = tracksData[i][j][1];
	// mapX = (lon + 180) * inv_360 * frontBuf_width;
	// mapY = (90 - lat) * inv_180 * frontBuf_height;
	polCoord = { lat: tracksData[i][j][0], lon: tracksData[i][j][1] };
	mapCoord = projector_project(polCoord);
	edc.lineTo((mapCoord.x + 1) * 0.5 * frontBuf_width,
		   (-mapCoord.y + 1) * 0.5 * frontBuf_height);
	if (tracksData[i][j][2] == dateIndex)
	  edc.arc(mapX, mapY, 2 * backbufScale, 0, 2 * Math.PI, false);
      }
      edc.stroke();
    }

    this.setExitStatus(i < numTracks);
    this.status.preemptCode = 0;
    this.status.percent = i * CothreadStatus.MAX_PERCENT / numTracks;

    this.i = i;
    return this.status;
  }

  return new Cothread(startExec, contExec);
})();
