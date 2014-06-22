/* Render layer for display of the eddy tracks layer.  */

import "renderlayer";
import "ajaxloaders";

TracksLayer = new RenderLayer();

TracksLayer.setCacheLimits = function(dataCache, renderCache) {
};

/**
 * Cothreaded data loading function.  The cothreaded function takes no
 * parameters.  See {@linkcode XHRLoader} for information on the
 * return value.
 *
 * `this.status.preemptCode` may be one of the following values:
 *
 * * 0 (Zero) -- Not applicable `(returnType == CothreadStatus.FINISHED)`.
 *
 * * XHRLoader.IOWAIT -- The cothread is waiting for an
 *   XMLHttpRequest to finish.  For optimal performance, the
 *   controller should not explicitly call continueCT(), since the
 *   asynchronous calling will be handled by the browser during data
 *   loading.  When the data is finished being loaded, this cothread
 *   will explicitly yield control to the controller.
 *
 * * XHRLoader.PROC_DATA -- The cothread has been preempted when it
 *   was processing data rather than waiting for data.
 */
TracksLayer.loadData = new XHRLoader("../data/tracks/acyc_bu_tracks.json",
				     execTime);

TracksLayer.loadData.procData = function(httpRequest) {
  var doneProcData = false;
  var procError = false;

  // Program timed cothread loop here.
  if (httpRequest.readyState == 4) {
    try {
      TracksLayer.tracksData = JSON.parse(httpRequest.responseText);
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

TracksLayer.setViewport = function(center, width, height,
				   aspectXY, projector) {
  // RenderLayer.call(center, width, height, projection);
  this.frontBuf.width = width;
  this.frontBuf.height = height;

  this.aspectXY = aspectXY;
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
    var aspectXY = TracksLayer.aspectXY;
    // var projector = TracksLayer.projector;
    var projector_project = TracksLayer.projector.project;

    var lDate_now = Date.now;

    var startTime = lDate_now();
    var timeout = this.timeout;
    for (; i < numTracks; ) {
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
      // var mapY = (90 - lat) * inv_180 * frontBuf_heightY;
      // var polCoord = { lat: tracksData[i][0][0], lon: tracksData[i][0][1] };
      // var mapCoord = projector_project(polCoord);
      var mapCoord_x = tracksData[i][0][1] / 180;
      var mapCoord_y = tracksData[i][0][0] / 180;
      edc.moveTo((mapCoord_x + 1) * 0.5 * frontBuf_width,
		 (-mapCoord_y * aspectXY + 1) * 0.5 * frontBuf_height);
      for (var j = 1; j < tracksData[i].length; j++) {
	// lat = tracksData[i][j][0];
	// lon = tracksData[i][j][1];
	// mapX = (lon + 180) * inv_360 * frontBuf_width;
	// mapY = (90 - lat) * inv_180 * frontBuf_height;
	// polCoord = { lat: tracksData[i][j][0], lon: tracksData[i][j][1] };
	// mapCoord = projector_project(polCoord);
	mapCoord_x = tracksData[i][j][1] / 180;
	mapCoord_y = tracksData[i][j][0] / 180;
	edc.lineTo((mapCoord_x + 1) * 0.5 * frontBuf_width,
		   (-mapCoord_y * aspectXY + 1) * 0.5 * frontBuf_height);
	if (tracksData[i][j][2] == dateIndex)
	  edc.arc(mapCoord_x, mapCoord_y, 2 * backbufScale, 0, 2 * Math.PI, false);
      }
      edc.stroke();
      i++;
      if (i % 1024 == 0 && lDate_now() - startTime >= timeout)
	break;
    }

    this.setExitStatus(i < numTracks);
    this.status.preemptCode = 0;
    this.status.percent = i * CothreadStatus.MAX_PERCENT / numTracks;

    this.i = i;
    return this.status;
  }

  return new Cothread(startExec, contExec);
})();
