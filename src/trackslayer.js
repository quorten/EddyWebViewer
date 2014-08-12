/* Render layer for display of the eddy tracks layer.  */

import "oevns";
import "renderlayer";
import "viewparams";
import "ajaxloaders";
import "dates";

/**
 * Eddy Tracks Layer.
 *
 * This object has many important parameters.  However, they do not
 * show up in the JSDocs.  See the source code for these details.
 *
 * `this.notifyFunc` is used to wake up the main loop to load more
 * data, if provided.
 */
var TracksLayer = new RenderLayer();
OEV.TracksLayer = TracksLayer;

// Important parameters for TracksLayer:

/** Whether or not to display anticyclonic tracks.  */
TracksLayer.dispAcyc = true;

/** Whether or not to display cyclonic tracks.  */
TracksLayer.dispCyc = true;

/**
 * Minimum track length in seconds.  This is used to determine if a
 * track should be rendered or not.
 */
TracksLayer.minLength = 0;

/**
 * Maximum track length in seconds, -1 for any.  This is used to
 * determine if a track should be rendered or not.
 */
TracksLayer.maxLength = -1;

TracksLayer.initCtx = function() {
  if (!this.acTracksData) {
    this.acLoad.timeout = this.timeout;
    this.acLoad.notifyFunc = this.notifyFunc;
    this.acLoad.initCtx();
  }
  if (!this.cTracksData) {
    this.cLoad.timeout = this.timeout;
    this.cLoad.notifyFunc = this.notifyFunc;
    this.cLoad.initCtx();
  }

  this.render.timeout = this.timeout;
  this.render.initCtx();

  this.status.returnType = CothreadStatus.PREEMPTED;
  this.status.preemptCode = 0;
  this.status.percent = 0;
};

TracksLayer.contExec = function() {
  // Load the tracks data if it has not yet been loaded.
  if (this.acLoad.status.returnType != CothreadStatus.FINISHED) {
    var status = this.acLoad.continueCT();
    this.status.returnType = CothreadStatus.PREEMPTED;
    this.status.preemptCode = status.preemptCode;
    this.status.percent = status.percent / 2;
    if (status.returnType == CothreadStatus.FINISHED) {
      if (this.acLoad.retVal == 200)
	this.retVal = 0;
      else {
	this.status.returnType = CothreadStatus.FINISHED;
	this.retVal = RenderLayer.LOAD_ERROR;
      }
    }
    return this.status;
  }

  if (this.cLoad.status.returnType != CothreadStatus.FINISHED) {
    var status = this.cLoad.continueCT();
    this.status.returnType = CothreadStatus.PREEMPTED;
    this.status.preemptCode = status.preemptCode;
    this.status.percent = CothreadStatus.MAX_PERCENT / 2 +
      status.percent / 2;
    if (status.returnType == CothreadStatus.FINISHED) {
      if (this.cLoad.retVal == 200)
	this.retVal = 0;
      else {
	this.status.returnType = CothreadStatus.FINISHED;
	this.retVal = RenderLayer.LOAD_ERROR;
      }
    }
    return this.status;
  }

  // Otherwise, render.
  return this.render.continueCT();
};

/** Anticyclonic tracks loader.  */
TracksLayer.acLoad = new XHRLoader("../data/tracks/acyc_bu_tracks.json");

TracksLayer.acLoad.procData = function(httpRequest, responseText) {
  var doneProcData = false;
  var procError = false;

  if (httpRequest.readyState == 4) { // DONE
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
    TracksLayer.acTracksData = safeJSONParse(responseText);
    doneProcData = true;
    if (!TracksLayer.acTracksData)
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

/** Cyclonic tracks loader.  */
// TracksLayer.cLoad = new XHRLoader("../data/tracks/cyc_bu_tracks.json");
TracksLayer.cLoad = new XHRLoader("../data/tracks/scyc.json");

TracksLayer.cLoad.procData = function(httpRequest, responseText) {
  var doneProcData = false;
  var procError = false;

  if (httpRequest.readyState == 4) { // DONE
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
    TracksLayer.cTracksData = safeJSONParse(responseText);
    doneProcData = true;
    if (!TracksLayer.cTracksData)
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

TracksLayer.setViewport = function(width, height) {
  this.frontBuf.width = width;
  this.frontBuf.height = height;
};

var inv_180 = 1 / 180,  inv_360 = 1 / 360;

TracksLayer.render = (function() {
  "use strict";

  function initCtx() {
    var frontBuf = TracksLayer.frontBuf;
    var edc = frontBuf.getContext("2d");
    this.edc = edc;

    edc.clearRect(0, 0, frontBuf.width, frontBuf.height);
    edc.lineWidth = /* Compositor.backbufScale */ 1;
    edc.strokeStyle = "#800080";
    edc.lineJoin = "round";

    this.i = 0;
    this.polToMap = [ NaN, NaN ];
    if (ViewParams.projector == EquirectProjector &&
	ViewParams.polCenter[1] == 0 && ViewParams.polCenter[0] == 0)
      this.fastEqui = true;
    else this.fastEqui = false;

    this.status.returnType = CothreadStatus.PREEMPTED;
    this.status.preemptCode = 0;
    this.status.percent = 0;
  }

  function contExec() {
    var edc = this.edc;
    var i = this.i;
    var polToMap = this.polToMap;
    var fastEqui = this.fastEqui;

    /* Data format: [list of tracks]
       track: [ list of eddies ]
       eddy: [ latitude, longitude, date_index, eddy_index ]
       Date indexes start from one, not zero.
     */
    var backbufScale = /* Compositor.backbufScale */ 1;
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
    var aspectXY = ViewParams.aspectXY;
    // var projector = ViewParams.projector;
    var projector_project = ViewParams.projector.project;

    var ctnow = Cothread.now;

    var startTime = ctnow();
    var timeout = this.timeout;

    while (true /* i < numTracks */) {
      /* This line is actually supposed to be a goto at the end of the
	 loop body, but JavaScript doesn't support goto with a clean
	 syntax.  Rather than make it a goto at the end of the loop
	 body, move it to the start of the loop body, even though it
	 doesn't conceptually belong there.  */
      if (renderPart == 2) { renderPart = 0; i++; }
      if (i >= numTracks) break;

      /* Check for the exit condition at the beginning of the loop
         rather than the end, since we must update `i' at the
         beginning of the loop rather than the end.  */
      if (renderPart == 0 && i % 1024 == 0 &&
	  ctnow() - startTime >= timeout)
	break;

      /* Rather than rendering all the anticyclonic tracks in one loop
	 and then render all the cyclonic tracks in a second loop,
	 alternate between rendering an anticyclonic track and a
	 cyclonic track on even and odd loop iterations.  */
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
	  continue;
	}
        tracksData = cTracksData;
      } else {
	// Nothing to render.
	renderPart++;
	continue;
      }

      // First check if the track is within the time range.
      if (tracksData[i][0][2] - 1 > curDate ||
	  tracksData[i][tracksData[i].length-1][2] - 1 < curDate) {
	renderPart++;
	continue;
      }

      if (TracksLayer.minLength > 0 || TracksLayer.maxLength != -1) {
	// Determine the length of the eddy in weeks.
	var numEddies = tracksData[i].length;
	var firstDateIdx = tracksData[i][0][2] - 1;
	var lastDateIdx = tracksData[i][numEddies-1][2] - 1;
	var trackLen = Dates.realTimes[lastDateIdx] -
	  Dates.realTimes[firstDateIdx];
	if (trackLen < TracksLayer.minLength) {
	  renderPart++;
	  continue;
	}
	if (TracksLayer.maxLength != -1 &&
	    trackLen > TracksLayer.maxLength) {
	  renderPart++;
	  continue;
	}
      }

      edc.beginPath();
      var lat = tracksData[i][0][0];
      var lon = tracksData[i][0][1];
      var mapX = (lon + 180) * inv_360 * frontBuf_width;
      var mapY = (90 - lat) * inv_180 * frontBuf_height;
      var mapCoord_x, mapCoord_y;
      if (fastEqui) {
	mapCoord_x = (tracksData[i][0][1] / 180 + 1) *
	  0.5 * frontBuf_width;
	mapCoord_y = (-tracksData[i][0][0] / 180 * aspectXY + 1) *
	  0.5 * frontBuf_height;
      } else {
	polToMap[1] = tracksData[i][0][0];
	polToMap[0] = tracksData[i][0][1];
	projector_project(polToMap);
	mapCoord_x = (polToMap[0] + 1) * 0.5 * frontBuf_width;
	mapCoord_y = (-polToMap[1] * aspectXY + 1) * 0.5 * frontBuf_height;
      }

      edc.moveTo(mapCoord_x, mapCoord_y);
      if (tracksData[i][0][2] - 1 == Dates.curDate)
	edc.arc(mapCoord_x, mapCoord_y,
		2 * backbufScale, 0, 2 * Math.PI, false);
      for (var j = 1; j < tracksData[i].length; j++) {
	lat = tracksData[i][j][0];
	lon = tracksData[i][j][1];
	mapX = (lon + 180) * inv_360 * frontBuf_width;
	mapY = (90 - lat) * inv_180 * frontBuf_height;
	if (fastEqui) {
	  mapCoord_x = (tracksData[i][j][1] / 180 + 1) *
	    0.5 * frontBuf_width;
	  mapCoord_y = (-tracksData[i][j][0] / 180 * aspectXY + 1) *
	    0.5 * frontBuf_height;
	} else {
	  polToMap[1] = tracksData[i][j][0];
	  polToMap[0] = tracksData[i][j][1];
	  projector_project(polToMap);
	  mapCoord_x = (polToMap[0] + 1) * 0.5 * frontBuf_width;
	  mapCoord_y = (-polToMap[1] * aspectXY + 1) * 0.5 * frontBuf_height;
	}

	edc.lineTo(mapCoord_x, mapCoord_y);
	if (tracksData[i][j][2] - 1 == Dates.curDate)
	  edc.arc(mapCoord_x, mapCoord_y,
		  2 * backbufScale, 0, 2 * Math.PI, false);
      }
      edc.stroke();

      renderPart++;
    }

    this.setExitStatus(i < numTracks);
    this.status.preemptCode = RenderLayer.RENDERING;
    this.status.percent = i * CothreadStatus.MAX_PERCENT / numTracks;

    this.i = i;
    return this.status;
  }

  return new Cothread(initCtx, contExec);
})();
