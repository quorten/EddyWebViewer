/* Render layer for display of the eddy tracks layer.  */

import "oevns";
import "renderlayer";
import "oevmath";
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
    edc.lineWidth = frontBuf.height / 720 * ViewParams.scale;
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
    var projector_project = ViewParams.projector.project;
    var arcRad = 2 * frontBuf_height / 720 * ViewParams.scale;

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
		arcRad, 0, 2 * Math.PI, false);
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
		  arcRad, 0, 2 * Math.PI, false);
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
    if (!this.loadData.textBuf) {
      this.loadData.timeout = this.timeout;
      this.loadData.notifyFunc = this.notifyFunc;
      this.loadData.initCtx();
    } else {
      this.textBuf = this.loadData.textBuf;
      this.loadData.textBuf = null;
      this.INPUT_ZERO_SYM = this.loadData.INPUT_ZERO_SYM;
      this.loadData.INPUT_ZERO_SYM = null;
      this.dateChunkStarts = this.loadData.dateChunkStarts;
      this.loadData.dateChunkStarts = null;
      this.startOfData = this.loadData.startOfData;
      this.loadData.startOfData = null;
    }
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
      if (this.loadData.retVal == 200) {
	this.textBuf = this.loadData.textBuf;
	this.loadData.textBuf = null;
	this.INPUT_ZERO_SYM = this.loadData.INPUT_ZERO_SYM;
	this.loadData.INPUT_ZERO_SYM = null;
	this.dateChunkStarts = this.loadData.dateChunkStarts;
	this.loadData.dateChunkStarts = null;
	this.startOfData = this.loadData.startOfData;
	this.loadData.startOfData = null;
	this.retVal = 0;
      } else {
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

WCTracksLayer.loadData.procData = function(httpRequest, responseText) {
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
    var textBuf = responseText;
    var textBuf_length = textBuf.length;
    this.textBuf = textBuf;

    // Start by skipping past the human-readable header.
    var re = /(^|\n)# BEGIN_DATA\n/g;
    if (!re.exec(textBuf))
      procError = true; // Invalid data file.
    else {
      var curPos = re.lastIndex;

      // Read the format header.
      var formatBits = textBuf.charCodeAt(curPos++);
      if (formatBits & 0x02) /* Extended range */
	this.INPUT_ZERO_SYM = 0xffff;
      else
	this.INPUT_ZERO_SYM = 0xd7ff;
      if (formatBits & 0x04)
	/* Track-keyed format */ procError = true;
      else
	/* Eddy-keyed format */;

      // Read the entire dates header.
      var numDates = textBuf.charCodeAt(curPos++);
      var lastCumDates = 0;
      var dateChunkStarts = new Array(numDates + 1);
      dateChunkStarts[0] = lastCumDates;
      for (var i = 0; i < numDates; ) {
	if (i % 32 == 0)
	  curPos++; // Skip the newline character.
	if (curPos >= textBuf_length)
	  { procError = true; break; }
	var numEddies = textBuf.charCodeAt(curPos++);
	lastCumDates += numEddies;
	dateChunkStarts[++i] = lastCumDates;
      }
      curPos++; // Skip the newline immediately at the end of the header.
      this.dateChunkStarts = dateChunkStarts;
      this.startOfData = curPos;
    }

    /* Rather than parsing out all data into JavaScript objects at
       this point, we will only parse out the data when we need it.
       Advantage: This is a tremendous economization on memory
       consumption: Using only a single JavaScript object for multiple
       entities results in far less garbage accumulation.  Plus, this
       method allows us to count the exact number of bytes of memory
       that our JavaScript program needs.  */

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

/**
 * Parse out an eddy from the text stream at the given position.
 * @param {Array} outEddy - The output structure that will be filled
 * with the eddy data.
 * @param {integer} index - The index of the eddy in the input array.
 * This is in terms of the size of the eddy structure, i.e. an eddy at
 * index 2 is translated to character position 8.
 */
WCTracksLayer.getEddy = function(outEddy, index) {
  var numNls = 0|(index / 32);
  var curPos = this.startOfData + index * 4 + numNls;
  if (curPos + 4 > this.textBuf.length)
    return; // Error

  // Start by reading the raw data fields.
  outEddy[0] = 0; // Eddy type
  outEddy[1] = this.textBuf.charCodeAt(curPos++); // Latitude
  outEddy[2] = this.textBuf.charCodeAt(curPos++); // Longitude
  outEddy[3] = this.textBuf.charCodeAt(curPos++); // Next
  outEddy[4] = this.textBuf.charCodeAt(curPos++); // Prev

  // Perform mandatory format conversions.
  /* Note: Although this code could transform INPUT_ZERO_SYM to be
     zero at this point, in favor of performance, that task is left up
     to the code that uses this structure to compare with
     INPUT_ZERO_SYM rather than zero.  */

  // Decode the data fields.
  outEddy[0] = (outEddy[1] >> 14) & 1;
  outEddy[1] = ((outEddy[1] & 0x3fff) - (1 << 13)) / (1 << 6);
  outEddy[2] = ((outEddy[2] & 0x7fff) - (1 << 14)) / (1 << 6);
  return outEddy;
};

/**
 * Parse out an eddy from the text stream at the given position,
 * transforming extended range numbers as necessary.
 * @param {Array} outEddy - The output structure that will be filled
 * with the eddy data.
 * @param {integer} index - The index of the eddy in the input array.
 * This is in terms of the size of the eddy structure, i.e. an eddy at
 * index 2 is translated to character position 8.
 */
WCTracksLayer.getEddyXRange = function(outEddy, index) {
  var numNls = 0|(index / 32);
  var curPos = startOfData + index * 4 + numNls;

  // Start by reading the raw data fields.
  outEddy[0] = 0; // Eddy type
  outEddy[1] = textBuf.charCodeAt(curPos++); // Latitude
  outEddy[2] = textBuf.charCodeAt(curPos++); // Longitude
  outEddy[3] = textBuf.charCodeAt(curPos++); // Next
  outEddy[4] = textBuf.charCodeAt(curPos++); // Prev

  // Perform mandatory format conversions.
  /* Note: Although this code could transform INPUT_ZERO_SYM to be
     zero at this point, in favor of performance, that task is left up
     to the code that uses this structure to compare with
     INPUT_ZERO_SYM rather than zero.  */
  for (var i = 1; i < 5; i++) {
    if (outEddy[i] != INPUT_ZERO_SYM && outEddy[i] > 0xd7ff)
      outEddy[i] -= 0x0800;
  }

  // Decode the data fields.
  outEddy[0] = (outEddy[1] >> 14) & 1;
  outEddy[1] = ((outEddy[1] & 0x3fff) - (1 << 13)) / (1 << 6);
  outEddy[2] = ((outEddy[2] & 0x7fff) - (1 << 14)) / (1 << 6);
  return outEddy;
};

/**
 * Kd-tree potential visibility traversal.  This function traverses
 * the kd-tree at the current date to determine a series of
 * small-sized kd-tree cells that entirely contains the viewport
 * bounding box.
 *
 * Sometimes the viewport box will cross upper level kd-tree divisions
 * that would cause it to have to include an excessively large PVS
 * boundary.  For these cases, the bounding box can be subdivided up
 * to `maxSplits` times to avoid worst cases of this scenario.
 *
 * Boxes can wrap around the longitudinal bounds of the map from one
 * side to the other by having a max edge that is less than a min edge
 * in value.
 *
 * @param curDate - The date index that contains the kd-tree to be
 * traversed.  The returned ranges will refer to the eddies in this
 * date index.
 * @param {Array} vbox - The viewport bounding box, which must have
 * been clipped via {@linkcode clipVBox}() before this call.  It must
 * be of the form [ minLat, minLon, maxLat, maxLon ].  Units are
 * degrees.
 * @param {integer} maxSplits - (optional) The maximum number of times
 * the viewport bounding box can be split for dual-branched traversal.
 * If set to zero or undefined, then there is no limit on the number
 * of times the viewport bounding box can be split.  Currently, this
 * must be set to a number taking the form 2^n - 1, n being an
 * integer, in order for the traversal to be balanced.
 * @returns {Array} An array [ defVis, posVis, notVis, totVis ].  The
 * first three elements are classification arrays containing multiple
 * elements, each indicating a range of elements as follows: [ start,
 * length ].  The fourth element indicates the total number of
 * potentially visible eddies.
 */
WCTracksLayer.kdPVS = function(curDate, vbox, maxSplits) {
  var maxDepth = (0|(Math.log(maxSplits) / Math.log(2))) - 1;
  var curEddy = new Array(5);

  // Pre-separated results
  var notVis = []; // Not visible
  var posVis = []; // Possibly visible
  var defVis = []; // Definitely visible
  var totPVS = 0; // Total number of potentially visible eddies

  // var results = [];
  var stack = [];
  var numSplits = 0;
  var numTrims = 0;

  var kdvbox = [ -90, -180, 90, 180 ];
  var dateChunkStarts = this.dateChunkStarts;
  var start = dateChunkStarts[curDate];
  var length = dateChunkStarts[curDate+1] - dateChunkStarts[curDate];
  var depth = 0;

  while (length > 0) {
    // Current dimension (latitude (0) or longitude (1))
    var curdim = depth % 2;
    var median = start + (0|((length - 1) / 2));
    var end = start + length;
    this.getEddy(curEddy, median);
    var medianVal = curEddy[1+curdim];
    var vbox_min = vbox[curdim];
    var vbox_max = vbox[2+curdim];
    // Is the max edge less than the min edge?
    var vbox_order = vbox_max - vbox_min;
    // These serve both as size and order metrics.
    var vbox_latsz = vbox[2] - vbox[0];
    var vbox_lonsz = vbox[3] - vbox[1];

    if (length <= 1) {
      /* Cannot split a partition of minimum size.  Traversal will
	 continue by popping from the stack.  */
      if (length == 1) {
	// Check if this eddy is within the box.
	var isLatIn =
	  (vbox_latsz > 0 &&
	   vbox[0] < curEddy[1] && curEddy[1] < vbox[2]) ||
	  (vbox_latsz < 0 &&
	   (vbox[0] < curEddy[1] || curEddy[1] < vbox[2]));
	var isLonIn =
	  (vbox_lonsz > 0 &&
	   vbox[1] < curEddy[2] && curEddy[2] < vbox[3]) ||
	  (vbox_lonsz < 0 &&
	   (vbox[1] < curEddy[2] || curEddy[2] < vbox[3]));
	if (isLatIn && isLonIn) {
	  defVis.push([ median, 1 ]);
	  // results.push([ 0, median, 1 ]); // Definitely visible
	  totPVS++;
	} else {
	  notVis.push([ median, 1 ]);
	  // results.push([ 2, median, 1 ]); // Not visible
	}
      }
      length = 0; // Force popping from the stack.
    }
    else if ((vbox_order > 0 &&
	      vbox_min < medianVal && vbox_max < medianVal) ||
	     (vbox_order < 0 &&
	      kdvbox[2+curdim] < vbox_min && medianVal > vbox_max)) {
      // Choose the less-than side.
      kdvbox[2+curdim] = medianVal;
      notVis.push([ median, end - median ]);
      // results.push([ 2, median, end - median ]); // Not visible
      numTrims++;
      /* start = start; */ length = median - start; depth++;
    }
    else if ((vbox_order > 0 &&
	      vbox_min > medianVal && vbox_max > medianVal) ||
	     (vbox_order < 0 &&
	      kdvbox[curdim] > vbox_max && medianVal < vbox_min)) {
      // Choose the greater-than side.
      kdvbox[curdim] = medianVal;
      notVis.push([ start, (median + 1) - start ]);
      // results.push([ 2, start, (median + 1) - start ]); // Not visible
      numTrims++;
      start = median + 1; length = end - start; depth++;
    }
    else {
      /* Split the traversal box into two boxes since neither of the
	 boxes entirely contain the viewport box.  */

      /* To keep the traversal algorithm fast, there is an upper limit
	 on the number of splits that can be performed.  To keep the
	 traversal algorithm balanced, the height of the stack is
	 limited.  */
      var splitOkay =
	!maxSplits || (numSplits < maxSplits && stack.length < maxDepth);

      /* Do not split this box if it lies entirely within the viewport
	 bounding box.  (Use `<=' and `>=' so that if the vbox covers
	 the entire view, then the algorithm finishes quickly.)  */
      var invbox =
	(vbox_latsz > 0 && kdvbox[0] >= vbox[0] && kdvbox[2] <= vbox[2]) &&
	((vbox_lonsz > 0 && kdvbox[1] >= vbox[1] && kdvbox[3] <= vbox[3]) ||
	 (vbox_lonsz < 0 &&
	  (kdvbox[1] <= vbox[3] && kdvbox[3] <= vbox[3] ||
	   kdvbox[1] >= vbox[1] && kdvbox[3] >= vbox[1])));

      /* Make box splitting mandatory if a box has a huge number of
	 points within it.  */
      var hugeNum = length > 128;

      /* Only split this box if it is sufficiently wide/tall.

	The old rule: Do not split if the width/height of the current
	`kdvbox' is less than the width/height of the viewport
	bounding box.

	Disadvantage: Doing this will allow boxes that deviate quite
	far from the viewport center to be kept, simply because their
	widths/heights are within the suitable range.  */
      /* var oversized =
	   (kdvbox[2] - kdvbox[0] > (vbox[2] - vbox[0]) * 1 ||
	    kdvbox[3] - kdvbox[1] > (vbox[3] - vbox[1]) * 1); */

      /* The current rule: Split the box if its furthest edge is
	 further from the edges of the `vbox' than the width/height of
	 the vbox.  If the box is reverse ordered, then split it if it
	 is too wide.

	 Tighter or wider widths/heights than this seem to result in a
	 sub-optimal division algorithm.  */
      var oversized =
	(vbox_latsz > 0 &&
	 (vbox[0] - kdvbox[0] > vbox_latsz * 1 ||
	  kdvbox[2] - vbox[2] > vbox_latsz * 1)) ||
	(vbox_lonsz > 0 &&
	 (vbox[1] - kdvbox[1] > vbox_lonsz * 1 ||
	  kdvbox[3] - vbox[3] > vbox_lonsz * 1)) ||
	(vbox_lonsz < 0 &&
	 (kdvbox[3] - kdvbox[1] > vbox_lonsz * 1 ||
	  vbox[1] - kdvbox[1] < vbox_lonsz * 1 ||
	  kdvbox[3] - vbox[3] < vbox_lonsz * 1));

      if (splitOkay && !invbox && (hugeNum || oversized)) {
        // Include the median if it is within the viewport box.
	var isLatIn =
	  (vbox_latsz > 0 &&
	   vbox[0] < curEddy[1] && curEddy[1] < vbox[2]) ||
	  (vbox_latsz < 0 &&
	   (vbox[0] < curEddy[1] || curEddy[1] < vbox[2]));
	var isLonIn =
	  (vbox_lonsz > 0 &&
	   vbox[1] < curEddy[2] && curEddy[2] < vbox[3]) ||
	  (vbox_lonsz < 0 &&
	   (vbox[1] < curEddy[2] || curEddy[2] < vbox[3]));
	if (isLatIn && isLonIn) {
	  defVis.push([ median, 1 ]);
	  // results.push([ 0, median, 1 ]); // Definitely visible
	  totPVS++;
	} else {
	  notVis.push([ median, 1 ]);
	  // results.push([ 2, median, 1 ]); // Not visible
	}

        numSplits++; depth++;
	/* Push the (sometimes) larger right partition onto the stack
	   first.  */
        var frame = new Array(4);
        frame[0] = kdvbox.slice(0);     // kdvbox
        frame[0][curdim] = medianVal;
        frame[1] = median + 1;          // start
        frame[2] = end - (median + 1);  // length
        frame[3] = depth;               // depth
        stack.push(frame);

        kdvbox[2+curdim] = medianVal;
        /* start = start; */ length = median - start;
      } else {
	if (invbox) {
	  defVis.push([ start, length ]);
	  // results.push([ 0, start, length ]); // Definitely visible
	  totPVS += length;
	} else {
	  posVis.push([ start, length ]);
	  // results.push([ 1, start, length ]); // Possibly visible
	  totPVS += length;
	}
        length = 0; // Force popping from the stack.
      }
    }

    // Process any entries remaining on the stack.
    while (length == 0 && stack.length > 0) {
      var frame = stack.pop();
      kdvbox = frame[0];
      start = frame[1]; length = frame[2]; depth = frame[3];
    }
  }

  // Save diagnostics.
  this.kdNumSplits = numSplits; this.kdNumTrims = numTrims;

  this.ranges = [ defVis, posVis, notVis, totPVS ];
  // this.ranges  = results;
  return this.ranges;
};

/**
 * Generate a viewport bounding box from the current ViewParams.
 * @returns {Array} [ minLat, minLon, maxLat, maxLon ]
 */
WCTracksLayer.genVBox = function() {
  var width = 360 / ViewParams.scale;
  var height = 360 / ViewParams.scale / ViewParams.aspectXY;
  var x = /* -ViewParams.mapCenter[0] / ViewParams.scale * 180 */ +
    ViewParams.polCenter[0];
  var y = -ViewParams.mapCenter[1] / ViewParams.scale * 90;
  return [ y - height / 2, x - width / 2, y + height / 2, x + width / 2 ];
};

WCTracksLayer.render = (function() {
  "use strict";

  function initCtx() {
    this.ranges = null;
    if (!this.curEddy)
      this.curEddy = new Array(5);
    if (!this.box1)
      this.box1 = new Array(4);
    if (!this.polToMap)
      this.polToMap = [ NaN, NaN ];
    /* Render class limit.  If set to 2, then only attempt to render
       tracks with a potentially visible eddy.  If set to 3, attempt
       to render all tracks, and also guarantee that definitely
       visible tracks are rendered before potentially visible
       ones.  */
    if (!this.rLimit)
      this.rLimit = 2;

    var frontBuf = WCTracksLayer.frontBuf;
    var ctx = frontBuf.getContext("2d");
    this.ctx = ctx;

    ctx.clearRect(0, 0, frontBuf.width, frontBuf.height);
    ctx.lineWidth = frontBuf.height / 720 * ViewParams.scale;
    ctx.strokeStyle = "#800080";
    ctx.lineJoin = "round";

    this.rc = 0; this.i = 0; this.j = 0;
    this.numRendered = 0;

    this.status.returnType = CothreadStatus.PREEMPTED;
    this.status.preemptCode = 0;
    this.status.percent = 0;
  }

  function contExec() {
    var ctnow = Cothread.now;
    var startTime = ctnow();
    var timeout = this.timeout;

    /* 1. Perform kd-tree PVS traversal.  This operation should be
       near instantaneous, but if it isn't, the timer has already been
       started above so that tracks rendering can be preempted
       early.  */
    var wctl = WCTracksLayer;
    if (!this.ranges) {
      wctl.vbox = wctl.genVBox(); clipVBox(wctl.vbox);
      wctl.kdPVS(Dates.curDate, wctl.vbox, 31);
    }

    var box1 = this.box1;
    var vbox = wctl.vbox;
    var ranges = wctl.ranges;
    var ctx = this.ctx;
    var polToMap = this.polToMap;
    var curDate = Dates.curDate;
    var dispAcyc = TracksParams.dispAcyc;
    var dispCyc = TracksParams.dispCyc;
    var curEddy = this.curEddy;
    var INPUT_ZERO_SYM = wctl.INPUT_ZERO_SYM;

    var frontBuf_width = WCTracksLayer.frontBuf.width;
    var frontBuf_height = WCTracksLayer.frontBuf.height;
    var aspectXY = ViewParams.aspectXY;
    var scale = ViewParams.scale;
    var mcx = ViewParams.mapCenter[0], mcy = ViewParams.mapCenter[1];
    var projector_project = ViewParams.projector.project;
    var arcRad = 2 * frontBuf_height / 720 * ViewParams.scale;

    /* rc = render class.  Draw all the definitely visible and
       possibly visible edies and tracks.  Optionally (rc = 2), check
       if any of the invisible eddies have tracks that should be
       drawn.  */
    var rc = this.rc; var rLimit = this.rLimit;
    var i = this.i; var j = this.j;
    var numRendered = this.numRendered;
    var rlen;

    ctx.beginPath();
    var quitLoop = false;
    while (rc < rLimit) {
      rlen = ranges[rc].length;
      while (i < rlen) {
	var curRange = ranges[rc][i];
	if (j == 0) j = curRange[0];
	var jend = curRange[0] + curRange[1];
	while (j < jend) {
	  wctl.getEddy(curEddy, j);
	  var next = curEddy[3], prev = curEddy[4];
	  /* `lastLon' is used to determine if drawing a line between
	     two points would cause it to span more than 180 degrees
	     longitude, i.e. if the line would not actually be the
	     shortest distance between two points.  `olastLon' and
	     `olastLat' ("o" for "original") are used together to clip
	     lines that are entirely outside of the viewport bounding
	     box.  */
	  var lastLon;
	  var oLastLon, oLastLat;

	  /* Draw the eddy marker.  We should to draw a triangle that
	     points in the direction of eddy motion, but for now, only
	     a circle is drawn for simplicity.  */
	  polToMap[1] = curEddy[1]; polToMap[0] = curEddy[2];
	  oLastLon = polToMap[0]; oLastLat = polToMap[1];
	  polShiftOrigin(polToMap, 1);
	  lastLon = polToMap[0];
	  projector_project(polToMap);
	  mapCoord_x = (polToMap[0] * scale + mcx + 1) *
	    0.5 * frontBuf_width;
	  mapCoord_y = (-polToMap[1] * scale * aspectXY - mcy + 1) *
	    0.5 * frontBuf_height;
	  /* NOTE: We should probably use box clipping rather than
	     point clipping for the eddy markers, to avoid the effect
	     of having them haptically disappear when close to the
	     edge of the screen.  */
	  if (!isNaN(mapCoord_x) && !isNaN(mapCoord_y) &&
	      (rc == 0 || ptInVBox(oLastLat, oLastLon, vbox))) {
	    ctx.moveTo(mapCoord_x + arcRad, mapCoord_y);
	    ctx.arc(mapCoord_x, mapCoord_y, arcRad, 0, 2 * Math.PI, false);
	  }

	  /* k = 0: Draw all the tracks after the current date.  */
	  /* k = 1: Draw all the tracks before the current date.  */
	  for (var k = 0; k < 2; k++) {
	    var ti = j; // Track index
	    if (k > 0) {
	      wctl.getEddy(curEddy, j);
	      polToMap[1] = curEddy[1]; polToMap[0] = curEddy[2];
	      oLastLon = polToMap[0]; oLastLat = polToMap[1];
	      polShiftOrigin(polToMap, 1);
	      lastLon = polToMap[0];
	      projector_project(polToMap);
	      mapCoord_x = (polToMap[0] * scale + mcx + 1) *
		0.5 * frontBuf_width;
	      mapCoord_y = (-polToMap[1] * scale * aspectXY - mcy + 1) *
		0.5 * frontBuf_height;
	    }
	    if (!isNaN(mapCoord_x) && !isNaN(mapCoord_y))
	      ctx.moveTo(mapCoord_x, mapCoord_y);
	    /* Set to true when we need to clip a point and reorient the
	       moveTo... lineTo... logic.  */
	    var clipped = false;
	    var disp; // Displacement
	    disp = curEddy[3+k];
	    while (disp != INPUT_ZERO_SYM) {
	      var noLine = false;
	      if (!k) ti += disp;
	      else ti -= disp;
	      wctl.getEddy(curEddy, ti);
	      disp = curEddy[3+k];
	      polToMap[1] = curEddy[1]; polToMap[0] = curEddy[2];
	      if (rc > 0) { // Not definitely visible
		/* NOTE: Although the mathematically correct way to
		   peform clipping is to use the `lineInVBox()'
		   function to check if the line to be drawn lies in
		   the vbox, for the sake of simplicity, all track
		   lines are assumed to be short enough such that the
		   simpler `boxInVBox()' visibility testing function
		   will be adequate.  */
		if (oLastLat < polToMap[1])
		  { box1[0] = oLastLat; box1[2] = polToMap[1]; }
		else { box1[0] = polToMap[1]; box1[2] = oLastLat; }
		if (oLastLon < polToMap[0])
		  { box1[1] = oLastLat; box1[3] = polToMap[0]; }
		else { box1[1] = polToMap[0]; box1[3] = oLastLon; }
		if (!boxInVBox(box1, vbox))
		  noLine = true;
	      }
	      oLastLon = polToMap[0]; oLastLat = polToMap[1];
	      polShiftOrigin(polToMap, 1);
	      if (Math.abs(polToMap[0] - lastLon) > 180)
		noLine = true;
	      lastLon = polToMap[0];
	      projector_project(polToMap);
	      mapCoord_x = (polToMap[0] * scale + mcx + 1) *
		0.5 * frontBuf_width;
	      mapCoord_y = (-polToMap[1] * scale * aspectXY - mcy + 1) *
		0.5 * frontBuf_height;
	      if (!isNaN(mapCoord_x) && !isNaN(mapCoord_y)) {
		if (clipped || noLine)
		  { ctx.moveTo(mapCoord_x, mapCoord_y); clipped = false; }
		else ctx.lineTo(mapCoord_x, mapCoord_y);
	      } else clipped = true;
	    }
	  }
	  numRendered++; j++;
	  if (numRendered % 128 == 0 && ctnow() - startTime >= timeout)
	    { quitLoop = true; break; }
	}
	if (j >= jend) { j = 0; i++; }
	if (quitLoop) break;
      }
      if (i >= rlen)
	{ i = 0; rc++; }
      if (quitLoop) break;
    }
    ctx.stroke();

    this.rc = rc; this.i = i; this.j = j;
    this.numRendered = numRendered;

    /* NOTE: Although in general, the invisible eddies need to be
       traversed to see if any parts of their tracks are visible, the
       current render loop normally skips rendering them completely,
       unless rLimit is set to 3.  */

    this.setExitStatus(rc < rLimit);
    this.status.preemptCode = RenderLayer.RENDERING;
    this.status.percent =
      numRendered * CothreadStatus.MAX_PERCENT / ranges[3];
    return this.status;
  }

  return new Cothread(initCtx, contExec);
})();

/********************************************************************/

/**
 * An eddy TracksLayer that displays the structure of the kd-tree used
 * to organize eddies on each date index, solely for the purpose of
 * debugging and development.  This RenderLayer's loader is identical
 * to that of {@linkcode WCTracksLayer}.
 *
 * If `this.maxDepth` is set to a positive number, the kd-tree is only
 * rendered to `maxDepth` levels deep.
 *
 * `this.ranges` holds the result of the last PVS run.  If it is null
 * or undefined, then no PVS classification information is displayed
 * during rendering.
 */
var WCKdDbgTracksLayer = new RenderLayer();
OEV.WCKdDbgTracksLayer = WCKdDbgTracksLayer;
WCKdDbgTracksLayer.loadData = WCTracksLayer.loadData;
WCKdDbgTracksLayer.getEddy = WCTracksLayer.getEddy;
WCKdDbgTracksLayer.getEddyXRange = WCTracksLayer.getEddyXRange;
WCKdDbgTracksLayer.kdPVS = WCTracksLayer.kdPVS;
WCKdDbgTracksLayer.genVBox = WCTracksLayer.genVBox;

WCKdDbgTracksLayer.initCtx = function() {
  if (!this.textBuf) {
    if (!this.loadData.textBuf) {
      this.loadData.timeout = this.timeout;
      this.loadData.notifyFunc = this.notifyFunc;
      this.loadData.initCtx();
    } else {
      this.textBuf = this.loadData.textBuf;
      this.loadData.textBuf = null;
      this.INPUT_ZERO_SYM = this.loadData.INPUT_ZERO_SYM;
      this.loadData.INPUT_ZERO_SYM = null;
      this.dateChunkStarts = this.loadData.dateChunkStarts;
      this.loadData.dateChunkStarts = null;
      this.startOfData = this.loadData.startOfData;
      this.loadData.startOfData = null;
    }
  }

  this.status.returnType = CothreadStatus.PREEMPTED;
  this.status.preemptCode = 0;
  this.status.percent = 0;
};

WCKdDbgTracksLayer.contExec = function() {
  // Load the tracks data if it has not yet been loaded.
  if (this.loadData.status.returnType != CothreadStatus.FINISHED) {
    var status = this.loadData.continueCT();
    this.status.returnType = CothreadStatus.PREEMPTED;
    this.status.preemptCode = status.preemptCode;
    this.status.percent = status.percent / 2;
    if (status.returnType == CothreadStatus.FINISHED) {
      if (this.loadData.retVal == 200) {
	this.textBuf = this.loadData.textBuf;
	this.loadData.textBuf = null;
	this.INPUT_ZERO_SYM = this.loadData.INPUT_ZERO_SYM;
	this.loadData.INPUT_ZERO_SYM = null;
	this.dateChunkStarts = this.loadData.dateChunkStarts;
	this.loadData.dateChunkStarts = null;
	this.startOfData = this.loadData.startOfData;
	this.loadData.startOfData = null;
	this.retVal = 0;
      } else {
	this.status.returnType = CothreadStatus.FINISHED;
	this.retVal = RenderLayer.LOAD_ERROR;
      }
    }
    return this.status;
  }

  // Otherwise, render.
  this.vbox = this.genVBox(); clipVBox(this.vbox);
  this.kdPVS(Dates.curDate, this.vbox, 31);
  return this.render();
};

/**
 * Draw a bounding box on an equirectangular map, that may wrap around
 * the longitudinal edges.
 * @param canvas - The HTML Canvas to draw on.
 * @oaram scale - The scale factor of the canvas.  A scale factor of
 * one means one pixel per degree.
 * @param vbox - The bounding box to draw.
 */
WCKdDbgTracksLayer.drawVBox = function(vbox, scale) {
  var drawbox = vbox.slice(0);
  drawbox[0] = (-drawbox[0] + 90) * scale;
  drawbox[2] = (-drawbox[2] + 90) * scale;
  drawbox[1] = (drawbox[1] + 180) * scale;
  drawbox[3] = (drawbox[3] + 180) * scale;
  var ctx = this.frontBuf.getContext("2d");
  ctx.strokeStyle = "#ff0000";
  ctx.beginPath();
  if (drawbox[1] < drawbox[3]) {
    /* NOTE: Some old canvas implementations don't support
       `strokeRect()'.  */
    ctx.moveTo(drawbox[1], drawbox[0]);
    ctx.lineTo(drawbox[3], drawbox[0]);
    ctx.lineTo(drawbox[3], drawbox[2]);
    ctx.lineTo(drawbox[1], drawbox[2]);
    ctx.closePath();
  } else {
    ctx.moveTo(0, drawbox[0]);
    ctx.lineTo(drawbox[3], drawbox[0]);
    ctx.lineTo(drawbox[3], drawbox[2]);
    ctx.lineTo(0, drawbox[2]);
    ctx.moveTo(360 * scale, drawbox[0]);
    ctx.lineTo(drawbox[1], drawbox[0]);
    ctx.lineTo(drawbox[1], drawbox[2]);
    ctx.lineTo(360 * scale, drawbox[2]);
  }
  ctx.stroke();
};

WCKdDbgTracksLayer.render = function() {
  var curDate = Dates.curDate;
  var scale = ViewParams.viewport[0] / 360;
  var ranges = this.ranges;
  var maxDepth = this.maxDepth;

  var curEddy = new Array(5);
  var frontBuf = this.frontBuf;
  var ctx = frontBuf.getContext("2d");
  ctx.clearRect(0, 0, frontBuf.width, frontBuf.height);
  ctx.strokeStyle = "#800080";

  var stack = [];
  var kdvbox = [ -90, -180, 90, 180 ];
  var dateChunkStarts = this.dateChunkStarts;
  var start = dateChunkStarts[curDate];
  var length = dateChunkStarts[curDate+1] - dateChunkStarts[curDate];
  var depth = 0;

  if (!ranges)
    ctx.beginPath();
  while (length > 0) {
    // Current dimension (latitude (0) or longitude (1))
    var curdim = depth % 2;
    var median = start + (0|((length - 1) / 2));
    var end = start + length;
    this.getEddy(curEddy, median);
    var medianVal = curEddy[1+curdim];

    if (!maxDepth || depth < maxDepth) {
      if (ranges) {
	/* This color signifies a PVS error: All points should be
	   located within a classified range.  */
        ctx.strokeStyle = "#808080";
	for (var j = 0; j < 3; j++) {
	  for (var i = 0, len = ranges[j].length;
	       i < len; i++) {
	    if (median >= ranges[j][i][0] &&
		median < ranges[j][i][0] + ranges[j][i][1]) {
	      switch (j) {
	      case 0: ctx.strokeStyle = "#0000ff"; break;
	      case 1: ctx.strokeStyle = "#800080"; break;
	      case 2: ctx.strokeStyle = "#000000"; break;
	      }
	      break;
	    }
	  }
	  if (ctx.strokeStyle != "#808080")
	    break;
	}
        /* for (var i = 0, ranges_length = ranges.length;
             i < ranges_length; i++) {
          if (median >= ranges[i][1] &&
              median < ranges[i][1] + ranges[i][2]) {
	    switch (ranges[i][0]) {
	    case 0: ctx.strokeStyle = "#0000ff"; break;
	    case 1: ctx.strokeStyle = "#800080"; break;
	    case 2: ctx.strokeStyle = "#000000"; break;
	    }
	    break;
	  }
        } */
	ctx.beginPath();
      }
      if (curdim == 0) {
        ctx.moveTo((kdvbox[1] + 180) * scale, (-medianVal + 90) * scale);
        ctx.lineTo((kdvbox[3] + 180) * scale, (-medianVal + 90) * scale);
      } else {
        ctx.moveTo((medianVal + 180) * scale, (-kdvbox[0] + 90) * scale);
        ctx.lineTo((medianVal + 180) * scale, (-kdvbox[2] + 90) * scale);
      }
      var xcenter = (curEddy[2] + 180) * scale;
      var ycenter = (-curEddy[1] + 90) * scale;
      ctx.moveTo(xcenter + 2, ycenter);
      ctx.arc(xcenter, ycenter, 2, 0, 2 * Math.PI, false);
      if (ranges)
	ctx.stroke();
    }

    depth++;
    var frame = new Array(4);
    frame[0] = kdvbox.slice(0);
    frame[0][2+curdim] = medianVal;
    frame[1] = start;               // start
    frame[2] = median - start;      // length
    frame[3] = depth;               // depth
    stack.push(frame);

    kdvbox[curdim] = medianVal;
    start = median + 1; length = end - start;

    while (length == 0 && stack.length > 0) {
      var frame = stack.pop();
      kdvbox = frame[0];
      start = frame[1]; length = frame[2]; depth = frame[3];
    }
  }
  if (!ranges)
    ctx.stroke();

  this.drawVBox(this.vbox, scale);

  this.status.returnType = CothreadStatus.FINISHED;
  this.status.preemptCode = RenderLayer.RENDERING;
  this.status.percent = CothreadStatus.MAX_PERCENT;
  return this.status;
};

/********************************************************************/

/** Pointer to the current TracksLayer implementation.  */
var TracksLayer = WCTracksLayer;
OEV.TracksLayer = TracksLayer;
