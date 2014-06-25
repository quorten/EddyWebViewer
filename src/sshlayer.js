/* Render layer for display of the Sea Surface Height (SSH).  */

import "renderlayer";
import "csv";
import "ajaxloaders";

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
SSHLayer.loadData = new ImageLoader("", null /* execTime */);

SSHLayer.loadData.url =
  SSHLayer.loadPrefix + SSHLayer.loadFrame + SSHLayer.loadPostfix;

SSHLayer.loadData.procData = function(image) {
  var doneProcData = true;
  var procError = false;

  /* Pull the pixels off of the image and fill them into the sshData
     array as floating point numbers.  */
  var tmpCanvas = document.createElement("canvas");
  tmpCanvas.width = 1440;
  tmpCanvas.height = 721;
  var ctx = tmpCanvas.getContext("2d");
  ctx.drawImage(image, 0, 0);
  this.image = null;
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

  SSHLayer.sshData = [];
  var i = 0;
  while (i < tmpImgData.data.length) {
    SSHLayer.sshData.push(tmpImgData.data[i++] / 4 - 32);
    // Skip all the other data in this pixel.
    i++;
    i++;
    i++;
  }

  /* SSHLayer.sshData = new Float32Array(1440 * 721 * 4);
  var sshData = SSHLayer.sshData;
  var bytePacker = new Uint8Array(SSHLayer.sshData.buffer);
  var badCSize = 1440 * 4 * 721 * 4;
  var ntohlBuf = new Uint8Array(4);
  var ntohl = new DataView(ntohlBuf.buffer);
  for (var i = 0, j = 0; i < badCSize; i += 16) {
    /\* FIXME: Optimize loader.  *\/
    ntohlBuf[0] = tmpImgData.data[i+0];
    ntohlBuf[1] = tmpImgData.data[i+4];
    ntohlBuf[2] = tmpImgData.data[i+8];
    ntohlBuf[3] = tmpImgData.data[i+12];
    sshData[j++] = ntohl.getFloat32(0, false);
  } */

  // SSHLayer.sshData = csvParse(httpRequest.responseText);
  // httpRequest.onreadystatechange = null;
  // this.httpRequest = null;

  if (procError) {
    this.image = null;
    this.retVal = ImageLoader.PROC_ERROR;
    this.status.returnType = CothreadStatus.FINISHED;
    this.status.preemptCode = 0;
    return this.status;
  }

  if (doneProcData) {
    /* Only manipulate the CothreadStatus object from within this
       function when processing is entirely finished.  */
    this.status.returnType = CothreadStatus.FINISHED;
    this.status.preemptCode = 0;
  }

  return this.status;
};

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
	var mapCoord = { x: (x / frontBuf_width) * 2 - 1,
	y: ((y / frontBuf_height) * 2 - 1) * inv_aspectXY };
	// NOTE: Object creation is slow.  Newer versions must avoid this.
	var polCoord = projector_unproject(mapCoord);
	if (!isNaN(polCoord.lat) && !isNaN(polCoord.lon) &&
	    polCoord.lat > -90 && polCoord.lat < 90 &&
	    polCoord.lon > -180 && polCoord.lon < 180)
	  ;
	else {
	  destIdx += 4;
	  x++;
	  continue;
	}
	var latIdx = ~~((polCoord.lat + 90) / 180 * src_height);
	var lonIdx = ~~((polCoord.lon + 180) / 360 * src_width);
	var value = sshData[latIdx*src_width+lonIdx] / 32;
	// var value = sshData[y*src_width+x] / 32;

	  if (isNaN(value) || value == -1) {
	      destIdx += 4;
	      x++;
	      continue;
	  }

	  if (value > 1) value = 1;
	  if (value < -1) value = -1;
	  value = ~~((value + 1) / 2 * 255);
	  if (SSHLayer.shadeStyle == 1) {
	    value <<= 2;
	    destImg.data[destIdx++] = colorTbl[value++];
	    destImg.data[destIdx++] = colorTbl[value++];
	    destImg.data[destIdx++] = colorTbl[value++];
	    destImg.data[destIdx++] = colorTbl[value++];
	  } else {
	    destImg.data[destIdx++] = value;
	    destImg.data[destIdx++] = value;
	    destImg.data[destIdx++] = value;
	    destImg.data[destIdx++] = 255;
	  }

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
    this.status.preemptCode = RenderLayer.FRAME_AVAIL;
    this.status.percent = y * CothreadStatus.MAX_PERCENT / frontBuf_height;

    this.destIdx = destIdx;
    this.x = x;
    this.y = y;
    return this.status;
  }

  return new Cothread(startExec, contExec);
})();
