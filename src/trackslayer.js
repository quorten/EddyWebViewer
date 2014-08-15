/* Render layer for display of the eddy tracks layer.  */

import "oevns";
import "renderlayer";
import "viewparams";
import "ajaxloaders";
import "dates";

/**
 * This object has many important parameters for TracksLayer
 * rendering.  However, they do not show up in the JSDocs.  See the
 * source code for these details.
 */
var TracksParams = {};
OEV.TracksParams = TracksParams;

/** Whether or not to display anticyclonic tracks.  */
TracksParams.dispAcyc = true;

/** Whether or not to display cyclonic tracks.  */
TracksParams.dispCyc = true;

/**
 * Minimum track length in seconds.  This is used to determine if a
 * track should be rendered or not.
 */
TracksParams.minLength = 0;

/**
 * Maximum track length in seconds, -1 for any.  This is used to
 * determine if a track should be rendered or not.
 */
TracksParams.maxLength = -1;

/********************************************************************/

/**
 * An eddy TracksLayer that loads its data via two JSON files.
 *
 * `this.notifyFunc` is used to wake up the main loop to load more
 * data, if provided.
 */
var JSONTracksLayer = new RenderLayer();
OEV.JSONTracksLayer = JSONTracksLayer;

JSONTracksLayer.initCtx = function() {
  if (!this.acTracksData || !this.cTracksData) {
    this.loadData.timeout = this.timeout;
    this.acLoad.timeout = this.timeout;
    this.cLoad.timeout = this.timeout;
    this.acLoad.notifyFunc = this.notifyFunc;
    this.cLoad.notifyFunc = this.notifyFunc;
    this.loadData.initCtx();
  }

  this.render.timeout = this.timeout;
  this.render.initCtx();

  this.status.returnType = CothreadStatus.PREEMPTED;
  this.status.preemptCode = 0;
  this.status.percent = 0;
};

JSONTracksLayer.contExec = function() {
  // Load the tracks data if it has not yet been loaded.
  if (this.loadData.status.returnType != CothreadStatus.FINISHED) {
    var status = this.loadData.continueCT();
    this.status.returnType = CothreadStatus.PREEMPTED;
    this.status.preemptCode = status.preemptCode;
    this.status.percent = status.percent;
    if (status.returnType == CothreadStatus.FINISHED) {
      if (this.acLoad.retVal == 200 && this.cLoad.retVal == 200)
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
JSONTracksLayer.acLoad = new XHRLoader("../data/tracks/acyc_bu_tracks.json");

JSONTracksLayer.acLoad.procData = function(httpRequest, responseText) {
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
    if (this == JSONTracksLayer.acLoad)
      JSONTracksLayer.acTracksData = safeJSONParse(responseText);
    else
      JSONTracksLayer.cTracksData = safeJSONParse(responseText);
    doneProcData = true;
    if (!JSONTracksLayer.acTracksData)
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
// JSONTracksLayer.cLoad = new XHRLoader("../data/tracks/cyc_bu_tracks.json");
JSONTracksLayer.cLoad = new XHRLoader("../data/tracks/scyc.json");

JSONTracksLayer.cLoad.procData = JSONTracksLayer.acLoad.procData;

JSONTracksLayer.loadData = new SeriesCTCtl([ JSONTracksLayer.acLoad,
					     JSONTracksLayer.cLoad ]);

var inv_180 = 1 / 180,  inv_360 = 1 / 360;

JSONTracksLayer.render = (function() {
  "use strict";

  function initCtx() {
    var frontBuf = JSONTracksLayer.frontBuf;
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
    var acTracksData = JSONTracksLayer.acTracksData;
    var acTracksData_length = acTracksData.length;
    var dispAcyc = TracksParams.dispAcyc;
    var cTracksData = JSONTracksLayer.cTracksData;
    var cTracksData_length = cTracksData.length;
    var dispCyc = TracksParams.dispCyc;
    var numTracks = 0;
    if (dispAcyc)
      numTracks = acTracksData_length;
    if (dispCyc && cTracksData_length > numTracks)
      numTracks = cTracksData_length;
    var renderPart = 0;

    var frontBuf_width = JSONTracksLayer.frontBuf.width;
    var frontBuf_height = JSONTracksLayer.frontBuf.height;
    var aspectXY = ViewParams.aspectXY;
    // var projector = ViewParams.projector;
    var projector_project = ViewParams.projector.project;

    var ctnow = Cothread.now;

    var startTime = ctnow();
    var timeout = this.timeout;

    edc.beginPath();
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

      if (TracksParams.minLength > 0 || TracksParams.maxLength != -1) {
	// Determine the length of the eddy in weeks.
	var numEddies = tracksData[i].length;
	var firstDateIdx = tracksData[i][0][2] - 1;
	var lastDateIdx = tracksData[i][numEddies-1][2] - 1;
	var trackLen = Dates.realTimes[lastDateIdx] -
	  Dates.realTimes[firstDateIdx];
	if (trackLen < TracksParams.minLength) {
	  renderPart++;
	  continue;
	}
	if (TracksParams.maxLength != -1 &&
	    trackLen > TracksParams.maxLength) {
	  renderPart++;
	  continue;
	}
      }

      // edc.beginPath();
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
      if (isNaN(mapCoord_x) || isNaN(mapCoord_y))
	{ renderPart++; continue; }

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
	if (isNaN(mapCoord_x) || isNaN(mapCoord_y))
	  continue;

	edc.lineTo(mapCoord_x, mapCoord_y);
	if (tracksData[i][j][2] - 1 == Dates.curDate)
	  edc.arc(mapCoord_x, mapCoord_y,
		  2 * backbufScale, 0, 2 * Math.PI, false);
      }
      /* Stroking this often is not necessary unless different colors
	 are used for anticyclonic and cyclonic tracks.  */
      // edc.stroke();

      renderPart++;
    }
    edc.stroke();

    this.setExitStatus(i < numTracks);
    this.status.preemptCode = RenderLayer.RENDERING;
    this.status.percent = i * CothreadStatus.MAX_PERCENT / numTracks;

    this.i = i;
    return this.status;
  }

  return new Cothread(initCtx, contExec);
})();

/********************************************************************/

/**
 * An eddy TracksLayer that loads its data via a single UTF-16 little
 * endian (wide character) file.  This loader and renderer for this
 * TracksLayer is substantially more efficient than the other one.
 *
 * This object has many important parameters.  However, they do not
 * show up in the JSDocs.  See the source code for these details.
 *
 * `this.notifyFunc` is used to wake up the main loop to load more
 * data, if provided.
 */
var WCTracksLayer = new RenderLayer();
OEV.WCTracksLayer = WCTracksLayer;

WCTracksLayer.initCtx = function() {
  if (!this.textBuf) {
    this.loadData.timeout = this.timeout;
    this.loadData.notifyFunc = this.notifyFunc;
    this.loadData.initCtx();
  }

  this.render.timeout = this.timeout;
  this.render.initCtx();

  this.status.returnType = CothreadStatus.PREEMPTED;
  this.status.preemptCode = 0;
  this.status.percent = 0;
};

WCTracksLayer.contExec = function() {
  // Load the tracks data if it has not yet been loaded.
  if (this.loadData.status.returnType != CothreadStatus.FINISHED) {
    var status = this.loadData.continueCT();
    this.status.returnType = CothreadStatus.PREEMPTED;
    this.status.preemptCode = status.preemptCode;
    this.status.percent = status.percent / 2;
    if (status.returnType == CothreadStatus.FINISHED) {
      if (this.loadData.retVal == 200)
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

WCTracksLayer.loadData = new XHRLoader("../data/tracks.wtxt");
WCTracksLayer.loadData.overrideMimeType = "text/plain; charset=utf-16le";

WCTracksLayer.loadData.procData = function() {
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
    WCTracksLayer.textBuf = responseText;
    doneProcData = true;
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

WCTracksLayer.render = (function() {
  "use strict";

  function initCtx() {
    this.status.returnType = CothreadStatus.PREEMPTED;
    this.status.preemptCode = 0;
    this.status.percent = 0;
  }

  function contExec() {

    // 1. Kd-tree pvs traversal.

    // 2. For each eddy on the current date index:
    // * Draw the marker at the current date index.
    // Parse backward to get the starting point.
    // Keep track of the current bounding box.
    // If the backtrack is fully visible.
    // Parse forward to draw the line.

    // (optional) Once finished with definitely visible,
    // move to possibly visible and do bounding box checks for each line.

    // Need two parts:
    // * Critical render loop
    // * Auxiliary render loop

    // Single traversal will be way better than double traversal,
    // since earth.nullschool.net does just fine with it's terribly
    // inefficient rendering mechanisms.

  }

  return new Cothread(initCtx, contExec);
})();

/********************************************************************/

/** Pointer to the current TracksLayer implementation.  */
var TracksLayer = JSONTracksLayer;
OEV.TracksLayer = TracksLayer;
