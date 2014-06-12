/* Render layer for display of the Sea Surface Height (SSH).  */

import "renderlayer";

SSHLayer = new RenderLayer();
SSHLayer.IOWAIT = 1;
SSHLayer.PROC_DATA = 2;

/*

Load the data
Process the data into an image
Done

 */
/* Note: This algorithm needs a newline at the end of the file.  It
   also does not handle files with non-Unix line endings.  */
function csvParse(csvText) {
  var tgtArray = [];
  var i = 0;
  var rowEnd;

  while ((rowEnd = csvText.indexOf('\n', i)) != -1) {
    var taEnd = tgtArray.push([]) - 1;
    var commaIdx;

    while ((commaIdx = csvText.indexOf(',', i)) < rowEnd &&
	   commaIdx != -1) {
      tgtArray[taEnd].push(csvText.substring(i, commaIdx));
      i = commaIdx + 1
    }

    if (csvText[rowEnd-1] != ',') {
      // Parse the last entry in the row.
      tgtArray[taEnd].push(csvText.substring(i, rowEnd))
    }
    i = rowEnd + 1
  }

  return tgtArray;
}


SSHLayer.setCacheLimits = function(dataCache, renderCache) {
};

/**
 * Cothreaded data loading function.  This function only initiates
 * loading of one SSH frame at initialization and the cothread loop
 * only tells whether the image has been fully loaded or not.
 */
SSHLayer.loadData = (function() {
  "use strict";

  function alertContents() {
    var httpRequest = SSHLayer.loadData.httpRequest;
    if (!httpRequest)
      return;
    switch (httpRequest.readyState) {
    case 4: // DONE
      if (httpRequest.status == 200) {
	// Call the main loop to continue cothread execution.
	return execTime();
      } else {
	throw new Error("There was a problem with the HTTP request.");
      }
      break;
    case 3: // LOADING
      /* NOTE: In some browsers, doing this can dramatically reduce
	 download speed, so we avoid it.  In the future, we should
	 only do it after a timeout of two seconds.  */
      // Call the main loop to update the download status.
      // return execTime();
      break;
    case 2: // HEADERS_RECEIVED
      SSHLayer.loadData.reqLen = httpRequest.getResponseHeader("Content-Length");
      break;
    }
  }

  function startExec() {
    var url = "../data/SSH/ssh_19930303.dat";
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
      this.status.preemptCode = SSHLayer.IOWAIT;
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
      this.status.preemptCode = SSHLayer.PROC_DATA;
      return this.status;
    }

    this.status.percent = CothreadStatus.MAX_PERCENT;

    // Process the data here.

    SSHLayer.sshData = csvParse(httpRequest.responseText);
    httpRequest.onreadystatechange = null;
    this.httpRequest = null;

    this.status.returnType = CothreadStatus.FINISHED;
    this.status.preemptCode = 0;

    return this.status;
  }

  return new Cothread(startExec, contExec);
})();

SSHLayer.setViewport = function(center, width, height,
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

SSHLayer.render = (function() {
  "use strict";

  function startExec() {
    var frontBuf = SSHLayer.frontBuf;
    var ctx = frontBuf.getContext("2d");
    this.ctx = ctx;
    var destImg = ctx.createImageData(frontBuf.width, frontBuf.height);
    this.destImg = destImg;
    this.destIdx = 0;

    // Generate the color table.
    var grad = [ [ 0x00, 0x00, 0x7f ],
		 [ 0x00, 0x00, 0xff ],
		 [ 0x00, 0x7f, 0xff ],
		 [ 0x00, 0xff, 0xff ],
		 [ 0x7f, 0xff, 0x7f ],
		 [ 0xff, 0xff, 0x00 ],
		 [ 0xff, 0x7f, 0x00 ],
		 [ 0xff, 0x00, 0x00 ],
		 [ 0x7f, 0x00, 0x00 ] ];

    var colorTbl = [];
    for (var i = 0; i < 256; i++) {
	var value = i / 256 * 8;
	var index =  ~~value;
	var ix2 = index + 1;
	if (ix2 > 8) ix2 = 8;
	var interpol = value % 1;
	colorTbl.push((1 - interpol) * grad[index][0] +
		      interpol *  grad[ix2][0]);
	colorTbl.push((1 - interpol) * grad[index][1] +
		      interpol *  grad[ix2][1]);
	colorTbl.push((1 - interpol) * grad[index][2] +
		      interpol *  grad[ix2][2]);
	colorTbl.push(255);
    }
    this.colorTbl = colorTbl;

    ctx.clearRect(0, 0, frontBuf.width, frontBuf.height);

    this.x = 0;
    this.y = 0;
  }

  function contExec() {
    var ctx = this.ctx;
    var destImg = this.destImg;
    var destIdx = this.destIdx;
    var x = this.x;
    var y = this.y;
    var oldY = y;
    var colorTbl = this.colorTbl;

    var sshData = SSHLayer.sshData;
    var frontBuf_width = SSHLayer.frontBuf.width;
    var frontBuf_height = SSHLayer.frontBuf.height;
    var src_width = sshData[0].length;
    var src_height = sshData.length;
    var aspectXY = SSHLayer.aspectXY;
    var inv_aspectXY = 1 / aspectXY;
    // var projector = SSHLayer.projector;
    var projector_unproject = SSHLayer.projector.unproject;

    var lDate_now = Date.now;

    var lastTime = lDate_now();
    var timeout = this.timeout;

    while (y < frontBuf_height) {
      while (x < frontBuf_width) {
	// var mapCoord = { x: (x / frontBuf_width) * 2 - 1,
	// y: -((y / frontBuf_height) * 2 - 1) * inv_aspectXY };
	// var polCoord = projector_unproject(mapCoord);
	// var polCoord = { lat: mapCoord.y * 180, lon: mapCoord.x * 180  };
	/* if (!isNaN(polCoord.lat) && !isNaN(polCoord.lon) &&
	    polCoord.lat > -90 && polCoord.lat < 90 &&
	    polCoord.lon > -180 && polCoord.lon < 180) */
	  /* SSH strangeness: The SSH data measures from the international
	     date line, not the prime meridian?  */
	  // var latIdx = ~~((((((-((y / frontBuf_height) * 2 - 1) * inv_aspectXY) * 180) + 90) / 180) % 1) * src_height);
	  // var lonIdx = ~~(((((((x / frontBuf_width) * 2 - 1) * 180) + 180 + 180) / 360) % 1) * src_width);
	  // var value = sshData[latIdx][lonIdx] / 32;
	  // var value = sshData[~~((((((-((y / frontBuf_height) * 2 - 1) * inv_aspectXY) * 180) + 90) / 180) % 1) * src_height)][~~(((((((x / frontBuf_width) * 2 - 1) * 180) + 180 + 180) / 360) % 1) * src_width)] / 32;
	  var value = sshData[src_height-1-y][x] / 32;

	  if (isNaN(value)) {
	      destIdx += 4;
	      x++;
	      continue;
	  }

	  if (value > 1) value = 1;
	  if (value < -1) value = -1;
	  value = (~~((value + 1) / 2 * 255)) << 2;

	  destImg.data[destIdx++] = colorTbl[value++];
	  destImg.data[destIdx++] = colorTbl[value++];
	  destImg.data[destIdx++] = colorTbl[value++];
	  destImg.data[destIdx++] = colorTbl[value++];

	  /* destImg.data[destIdx++] = value;
	  destImg.data[destIdx++] = value;
	  destImg.data[destIdx++] = value;
	  destImg.data[destIdx++] = value; */
	x++;
	/* if (lDate_now() - lastTime >= timeout)
	  break; */
      }
      if (x >= frontBuf_width) {
	x = 0;
	y++;
      }
      if (y % 32 == 0 && lDate_now() - lastTime >= timeout)
	break;
    }

    this.setExitStatus(y < frontBuf_height);
    ctx.putImageData(destImg, 0, 0, 0, oldY, frontBuf_width, y - oldY);
    this.status.preemptCode = 0;
    this.status.percent = y * CothreadStatus.MAX_PERCENT / frontBuf_height;

    this.destIdx = destIdx;
    this.x = x;
    this.y = y;
    return this.status;
  }

  return new Cothread(startExec, contExec);
})();
