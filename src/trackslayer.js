/* Render layer for display of the eddy tracks layer.  */

import "renderlayer";
import "ajaxloaders";

import "dates";

TracksLayer = new RenderLayer();

/* Important parameters for TracksLayer: */

// acycName: Name of acyclic file to load.
// cycName: Name of cyclic file to load.

// Important parameters:

// Whether or not to display cyclonic/anticyclonic tracks.
TracksLayer.dispCyc = false;
TracksLayer.dispAcyc = false;

// Minimum track length in weeks
TracksLayer.minLength = 0;

// Maximum track length in weeks, -1 for any
TracksLayer.maxLength = -1;

TracksLayer.setCacheLimits = function(dataCache, renderCache) {
};

/*

Okay, take it slow.  Yes, I'm taking it so, and so will my viewer be
slow.

*/

TracksLayer.acLoad = new XHRLoader("../data/tracks/acyc_bu_tracks.json",
				   execTime);

TracksLayer.acLoad.procData = function(httpRequest) {
  var doneProcData = false;
  var procError = false;

  // Program timed cothread loop here.
  if (httpRequest.readyState == 4) {
    try {
      TracksLayer.acTracksData = JSON.parse(httpRequest.responseText);
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

TracksLayer.cLoad = new XHRLoader("../data/tracks/cyc_bu_tracks.json",
				   execTime);

TracksLayer.cLoad.procData = function(httpRequest) {
  var doneProcData = false;
  var procError = false;

  // Program timed cothread loop here.
  if (httpRequest.readyState == 4) {
    try {
      TracksLayer.cTracksData = JSON.parse(httpRequest.responseText);
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

/**
 * Cothreaded data loading function.  The cothreaded function takes no
 * parameters.  See {@linkcode XHRLoader} for information on the
 * return value.
 *
 * `this.status.preemptCode` may be one of the following values:
 *
 * * 0 (Zero) -- Not applicable `(returnType == CothreadStatus.FINISHED)`.
 *
 * * CothreadStatus.IOWAIT -- The cothread is waiting for an
 *   XMLHttpRequest to finish.  For optimal performance, the
 *   controller should not explicitly call continueCT(), since the
 *   asynchronous calling will be handled by the browser during data
 *   loading.  When the data is finished being loaded, this cothread
 *   will explicitly yield control to the controller.
 *
 * * CothreadStatus.PROC_DATA -- The cothread has been preempted when
 *   it was processing data rather than waiting for data.
 */
TracksLayer.loadData = new SeriesCTCtl([ Dates, TracksLayer.acLoad,
					 TracksLayer.cLoad ]);

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

var minTrackLen = 0, maxTrackLen = -1;
var numericDates = [];
var inv_180 = 1 / 180, inv_360 = 1 / 360;

TracksLayer.render = (function() {
  "use strict";

  function startExec() {
    var frontBuf = TracksLayer.frontBuf;
    var edc = frontBuf.getContext("2d");
    this.edc = edc;

    edc.clearRect(0, 0, frontBuf.width, frontBuf.height);
    edc.lineWidth = Compositor.backbufScale;
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
       Date indexes start from one, not zero.
     */
    var backbufScale = Compositor.backbufScale;
    var curDate = Dates.curDate;
    var acTracksData = TracksLayer.acTracksData;
    var acTracksData_length = acTracksData.length;
    var dispAcyc = TracksLayer.dispAcyc;
    var cTracksData = TracksLayer.cTracksData;
    var cTracksData_length = cTracksData.length;
    var dispCyc = TracksLayer.dispCyc;
    var numTracks = 0;
    if (dispAcyc)
      numTracks = acTracksData_length;
    if (dispCyc && cTracksData_length > numTracks)
      numTracks = cTracksData_length;
    var renderPart = 0;

    var frontBuf_width = TracksLayer.frontBuf.width;
    var frontBuf_height = TracksLayer.frontBuf.height;
    var aspectXY = TracksLayer.aspectXY;
    // var projector = TracksLayer.projector;
    var projector_project = TracksLayer.projector.project;

    var lDate_now = Date.now;

    var startTime = lDate_now();
    var timeout = this.timeout;

    for (; i < numTracks; ) {
      var tracksData;
      if (renderPart == 0 && dispAcyc) {
	if (i >= acTracksData_length) {
	  renderPart++;
	  continue;
	}
        tracksData = acTracksData;
      } else if (renderPart == 1 && dispCyc) {
	if (i >= cTracksData_length) {
	  renderPart++;
	  if (renderPart == 2) { renderPart = 0; i++; }
	  continue;
	}
        tracksData = cTracksData;
      } else {
	// Nothing to render.
	renderPart++;
	if (renderPart == 2) { renderPart = 0; i++; }
	continue;
      }

      // First check if the track is within the time range.
      if (tracksData[i][0][2] - 1 > curDate ||
	  tracksData[i][tracksData[i].length-1][2] - 1 < curDate) {
	renderPart++;
	if (renderPart == 2) { renderPart = 0; i++; }
	continue;
      }

      if (TracksLayer.minLength > 0 && TracksLayer.maxLength != -1) {
	// Determine the length of the eddy in weeks.
	var numEddies = tracksData[i].length;
	var firstDateIdx = tracksData[i][0][2] - 1;
	var lastDateIdx = tracksData[i][numEddies-1][2] - 1;
	var trackLen = Dates.realTimes[lastDateIdx] -
	  Dates.realTimes[firstDateIdx];
	if (trackLen < TracksLayer.minLength) {
	  renderPart++;
	  if (renderPart == 2) { renderPart = 0; i++; }
	  continue;
	}
	if (maxTrackLen != -1 && trackLen > TracksLayer.maxLength) {
	  renderPart++;
	  if (renderPart == 2) { renderPart = 0; i++; }
	  continue;
	}
      }

      edc.beginPath();
      var lat = tracksData[i][0][0];
      var lon = tracksData[i][0][1];
      var mapX = (lon + 180) * inv_360 * frontBuf_width;
      var mapY = (90 - lat) * inv_180 * frontBuf_height;
      var polCoord = { lat: tracksData[i][0][0], lon: tracksData[i][0][1] };
      var mapCoord = projector_project(polCoord);
      var mapCoord_x = (mapCoord.x + 1) * 0.5 * frontBuf_width;
      var mapCoord_y = (-mapCoord.y * aspectXY + 1) * 0.5 * frontBuf_height;

      // var mapCoord_x = tracksData[i][0][1] / 180;
      // var mapCoord_y = tracksData[i][0][0] / 180;

      edc.moveTo(mapCoord_x, mapCoord_y);
      if (tracksData[i][0][2] - 1 == Dates.curDate)
	edc.arc(mapCoord_x, mapCoord_y,
		2 * backbufScale, 0, 2 * Math.PI, false);
      for (var j = 1; j < tracksData[i].length; j++) {
	lat = tracksData[i][j][0];
	lon = tracksData[i][j][1];
	mapX = (lon + 180) * inv_360 * frontBuf_width;
	mapY = (90 - lat) * inv_180 * frontBuf_height;
	polCoord = { lat: tracksData[i][j][0], lon: tracksData[i][j][1] };
	mapCoord = projector_project(polCoord);
	mapCoord_x = (mapCoord.x + 1) * 0.5 * frontBuf_width;
	mapCoord_y = (-mapCoord.y * aspectXY + 1) * 0.5 * frontBuf_height;

	// mapCoord_x = tracksData[i][j][1] / 180;
	// mapCoord_y = tracksData[i][j][0] / 180;

	edc.lineTo(mapCoord_x, mapCoord_y);
	if (tracksData[i][j][2] - 1 == Dates.curDate)
	  edc.arc(mapCoord_x, mapCoord_y,
		  2 * backbufScale, 0, 2 * Math.PI, false);
      }
      edc.stroke();

      renderPart++;
      if (renderPart == 2) { renderPart = 0; i++; }

      if (i % 1024 == 0 && lDate_now() - startTime >= timeout)
	break;
    }

    this.setExitStatus(i < numTracks);
    this.status.preemptCode = RenderLayer.FRAME_AVAIL;
    this.status.percent = i * CothreadStatus.MAX_PERCENT / numTracks;

    this.i = i;
    return this.status;
  }

  return new Cothread(startExec, contExec);
})();
