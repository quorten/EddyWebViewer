/* Render layer for display of the Sea Surface Height (SSH).  */

import "renderlayer";
import "csv";

SSHLayer = new RenderLayer();

/* Important parameters for TracksLayer: */

// loadPrefix: prefix to append to date for frame to load
SSHLayer.loadPrefix = "../data/jpgssh/ssh_";

// loadFrame: hyphenless date of frame to load
SSHLayer.loadFrame = "19930303";

// loadPostfix: extension to append for frame to load
SSHLayer.loadPostfix = ".jpg";

// shadeStyle: Zero for grayscale, one for MATLAB jet
SSHLayer.shadeStyle = 1;

// notifyFunc: Main loop function to call for notifications
SSHLayer.notifyFunc = execTime;

SSHLayer.setCacheLimits = function(dataCache, renderCache) {
};

/*

Work on SSHLayer.  What needs to be done?

1. Load the data.  Start by using the cothread imageloader module.
After the cothread imageloader module finishes, copy the data into a
byte array, 0..255.  Rendering: just write out pixel value.

*/

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
	return SSHLayer.notifyFunc();
      } else {
	throw new Error("There was a problem with the HTTP request.");
      }
      break;
    case 3: // LOADING
      /* NOTE: In some browsers, doing this can dramatically reduce
	 download speed, so we avoid it.  In the future, we should
	 only do it after a timeout of two seconds.  */
      // Call the main loop to update the download status.
      // return SSHLayer.notifyFunc();
      break;
    case 2: // HEADERS_RECEIVED
      SSHLayer.loadData.reqLen = httpRequest.getResponseHeader("Content-Length");
      break;
    }
  }

  function imgLoaded() {
    // Call the main loop to continue cothread execution.
    SSHLayer.loadData.imgReady = true;
    return SSHLayer.notifyFunc();
  }

  function startExec() {
    var url = "../data/SSH/ssh_19930303.dat";
    /* var httpRequest;

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
    httpRequest.open("GET", url, true); */
    // httpRequest.setRequestHeader("Range", "bytes=0-500");
    // httpRequest.send();
    this.reqLen = 0;
    this.readyDataProcess = false;

    this.tmpImg = new Image();
    this.tmpImg.onload = imgLoaded;
    this.tmpImg.src =
      SSHLayer.loadPrefix + SSHLayer.loadFrame + SSHLayer.loadPostfix;
    this.imgReady = false;

    // this.httpRequest = httpRequest;
  }

  /** This function primarily retrieves the current loading status of
      the XMLHttpRequest.  */
  function contExec() {
    var httpRequest = this.httpRequest;
    var reqLen = this.reqLen;

    /* if (!httpRequest) {
      this.status.returnType = CothreadStatus.FINISHED;
      this.status.preemptCode = 0;
      return this.status;
    } else if (httpRequest.readyState != 4) {
      this.status.returnType = CothreadStatus.PREEMPTED;
      this.status.preemptCode = CothreadStatus.IOWAIT;
      if (reqLen) {
	this.status.percent = httpRequest.responseText.length * 
	  CothreadStatus.MAX_PERCENT / reqLen;
      } else
	this.status.percent = 0;
      return this.status;
    } */
    // (httpRequest.readyState == 4)

    if (!this.imgReady) {
      this.status.returnType = CothreadStatus.PREEMPTED;
      this.status.preemptCode = CothreadStatus.IOWAIT;
      return this.status;
    }

    // JSON parsing is slow: Return here and come back later.
    if (!this.readyDataProcess) {
      this.readyDataProcess = true;
      this.status.returnType = CothreadStatus.PREEMPTED;
      this.status.preemptCode = CothreadStatus.PROC_DATA;
      return this.status;
    }

    this.status.percent = CothreadStatus.MAX_PERCENT;

    // Process the data here.

    /* Pull the pixels off of the image and fill them into the sshData
       array as floating point numbers.  */
    var tmpCanvas = document.createElement("canvas");
    tmpCanvas.width = 1440 * 4;
    tmpCanvas.height = 721;
    var ctx = tmpCanvas.getContext("2d");
    ctx.drawImage(this.tmpImg, 0, 0);
    this.tmpImg = null;
    var tmpImgData = ctx.getImageData(0, 0, tmpCanvas.width, tmpCanvas.height);
    // document.documentElement.children[1].appendChild(tmpCanvas);
    tmpCanvas = null; ctx = null;

    /* var iSz = 1440 * 721 * 4;
    var sshData = new Float32Array(1440 * 721);
    SSHLayer.sshData = sshData;
    var ntohl = new DataView(tmpImgData.data.buffer);
    for (var i = 0, j = 0; i < iSz; i += 4) {
      sshData[j++] = ntohl.getFloat32(i, false);
    } */

    SSHLayer.sshData = new Float32Array(1440 * 721 * 4);
    var sshData = SSHLayer.sshData;
    var bytePacker = new Uint8Array(SSHLayer.sshData.buffer);
    var badCSize = 1440 * 4 * 721 * 4;
    var ntohlBuf = new Uint8Array(4);
    var ntohl = new DataView(ntohlBuf.buffer);
    for (var i = 0, j = 0; i < badCSize; i += 16) {
      /* FIXME: Optimize loader.  */
      ntohlBuf[0] = tmpImgData.data[i+0];
      ntohlBuf[1] = tmpImgData.data[i+4];
      ntohlBuf[2] = tmpImgData.data[i+8];
      ntohlBuf[3] = tmpImgData.data[i+12];
      sshData[j++] = ntohl.getFloat32(0, false);
    }

    // SSHLayer.sshData = csvParse(httpRequest.responseText);
    // httpRequest.onreadystatechange = null;
    // this.httpRequest = null;

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
    var src_width = 1440;//sshData[0].length;
    var src_height = 721;//sshData.length;
    var aspectXY = SSHLayer.aspectXY;
    var inv_aspectXY = 1 / aspectXY;
    // var projector = SSHLayer.projector;
    var projector_unproject = SSHLayer.projector.unproject;

    var lDate_now = Date.now;

    var startTime = lDate_now();
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
	// var value = sshData[src_height-1-y][x] / 32;
	var value = sshData[y*src_width+x] / 32;

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
	/* if (lDate_now() - startTime >= timeout)
	  break; */
      }
      if (x >= frontBuf_width) {
	x = 0;
	y++;
      }
      if (y % 32 == 0 && lDate_now() - startTime >= timeout)
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
