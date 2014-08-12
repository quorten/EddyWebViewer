/* Render layer for display of the Sea Surface Height (SSH).  */

import "oevns";
import "renderlayer";
import "csv";
import "ajaxloaders";
import "dates";

/**
 * This object has many important parameters for SSHLayer rendering.
 * However, they do not show up in the JSDocs.  See the source code
 * for these details.
 */
var SSHParams = {};
OEV.SSHParams = SSHParams;

/** Desired image format to use */
SSHParams.imgFormat = "png";

/** Path prefix to append to date for frame to load */
SSHParams.loadPrefix = "../data/";

/**
 * One of the following values:
 * * 0: Grayscale
 * * 1: MATLAB Jet color palette
 * * 2: Contour bands
 */
SSHParams.shadeStyle = 1;

/**
 * Scale factor for shading the SSH values.  When set to one, -128 and
 * +128 correspond to the bottom and top of the visualized value range
 * respectively.
 */
SSHParams.shadeScale = 4;

/********************************************************************/

/**
 * Generic Sea Surface Height Layer.  This variant can render in every
 * possible style.  It is also the slowest of all variants,
 * unfortunately.
 *
 * `this.notifyFunc` is used to wake up the main loop to load more
 * data, if provided.
 */
var GenSSHLayer = new RenderLayer();
OEV.GenSSHLayer = GenSSHLayer;
GenSSHLayer.loadXHRData = new XHRLoader();
GenSSHLayer.loadImageData = new ImageLoader();
GenSSHLayer.loadData = GenSSHLayer.loadImageData;
GenSSHLayer.render = new RayTracer(null, 1, 1);
GenSSHLayer.frontBuf = GenSSHLayer.render.frontBuf;
GenSSHLayer.setViewport = function(width, height) {
  return this.render.setViewport(width, height);
};

GenSSHLayer.initCtx = function() {
  var loadFrame = Dates.dateList[Dates.curDate].split("-").join("");
  var newUrl;
  if (SSHParams.imgFormat == "dat") {
    newUrl = SSHParams.loadPrefix + "SSH/ssh_" + loadFrame +
      "." + SSHParams.imgFormat;
    this.loadData = this.loadXHRData;
  } else {
    newUrl =
      SSHParams.loadPrefix +
      SSHParams.imgFormat + "ssh/ssh_" + loadFrame +
      "." + SSHParams.imgFormat;
    this.loadData = this.loadImageData;
  }

  if (newUrl != this.loadData.url) {
    this.loadData.timeout = this.timeout;
    this.loadData.notifyFunc = this.notifyFunc;
    this.loadData.url = newUrl;
    this.loadData.initCtx();
  }

  this.render.timeout = this.timeout;
  this.render.initCtx();

  this.status.returnType = CothreadStatus.PREEMPTED;
  this.status.preemptCode = 0;
  this.status.percent = 0;
};

GenSSHLayer.contExec = function() {
  // Load the SSH frame if it has not yet been loaded.
  if (this.loadData.status.returnType != CothreadStatus.FINISHED) {
    var status = this.loadData.continueCT();
    this.status.returnType = CothreadStatus.PREEMPTED;
    this.status.preemptCode = status.preemptCode;
    this.status.percent = status.percent;
    if (status.returnType == CothreadStatus.FINISHED) {
      if (this.loadData.retVal == 200 ||
	  this.loadData.retVal == ImageLoader.SUCCESS) {
	this.render.backBuf = this.loadData.backBuf;
	this.loadData.backBuf = null;
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

GenSSHLayer.loadXHRData.procData = function(httpRequest, responseText) {
  var doneProcData = false;
  var procError = false;

  if (httpRequest.readyState == 3) { // LOADING
    /* Process partial data here (possibly with timed cothread
       loop).  */
  }
  else if (httpRequest.readyState == 4) { // DONE
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
    this.backBuf = csvParseFlat(responseText);
    doneProcData = true;
    if (!this.backBuf)
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

GenSSHLayer.loadImageData.procData = function(image) {
  /* Pull the pixels off of the image and fill them into the sshData
     array as floating point numbers.  */
  var tmpCanvas = document.createElement("canvas");
  tmpCanvas.width = image.width;
  tmpCanvas.height = image.height;
  var ctx = tmpCanvas.getContext("2d");
  ctx.drawImage(image, 0, 0);
  /* We no longer need the original image, so free up the associated
     memory.  */
  this.image = null;
  var tmpImgData = ctx.getImageData(0, 0, tmpCanvas.width, tmpCanvas.height);
  tmpCanvas = null; ctx = null;

  this.backBuf = { data: [], width: image.width, height: image.height };
  var i = 0;
  var bad; // Bits After Decimal
  var bbd; // Bits Before Decimal
  if (SSHParams.imgFormat == "jpg") {
    bad = 2;
    bbd = 6;
    while (i < tmpImgData.data.length) {
      if (tmpImgData.data[i+0] < 16 &&
	  tmpImgData.data[i+1] < 16 &&
	  tmpImgData.data[i+2] < 16) // Use fuzz margin due to JPEG artifacts
	this.backBuf.data.push(-128); // Transparent
      else
	this.backBuf.data.push((tmpImgData.data[i] - 12) / (1 << bad) -
			       (1 << (bbd - 1)));
      i += 4;
    }
  }
  else if (SSHParams.imgFormat == "png") {
    bad = 8; // Actually only 7, but we decode it as 8.
    bbd = 8;
    while (i < tmpImgData.data.length) {
      if (tmpImgData.data[i+0] == 0 &&
	  tmpImgData.data[i+1] == 0)
	this.backBuf.data.push(-128); // Transparent
      else {
	var intVal = (tmpImgData.data[i] << 8) + tmpImgData.data[i+1];
	if (intVal & 0x100) intVal ^= 0xff;
	this.backBuf.data.push(intVal / (1 << bad) -
			      (1 << (bbd - 1)));
      }
      i += 4;
    }
  }

  this.status.returnType = CothreadStatus.FINISHED;
  this.status.preemptCode = 0;
  return this.status;
};

// MATLAB Jet color table
GenSSHLayer.render.mlColorTbl = (function() {
  var grad = [ [ 0x00, 0x00, 0x7f ],
	       [ 0x00, 0x00, 0xff ],
	       [ 0x00, 0x7f, 0xff ],
	       [ 0x00, 0xff, 0xff ],
	       [ 0x7f, 0xff, 0x7f ],
	       [ 0xff, 0xff, 0x00 ],
	       [ 0xff, 0x7f, 0x00 ],
	       [ 0xff, 0x00, 0x00 ],
	       [ 0x7f, 0x00, 0x00 ] ];

  var mlColorTbl = [];
  for (var i = 0; i < 256; i++) {
    var value = i / 256 * 8;
    var index =  0|value;
    var ix2 = index + 1;
    if (ix2 > 8) ix2 = 8;
    var interpol = value % 1;
    mlColorTbl.push((1 - interpol) * grad[index][0] +
		  interpol *  grad[ix2][0]);
    mlColorTbl.push((1 - interpol) * grad[index][1] +
		  interpol *  grad[ix2][1]);
    mlColorTbl.push((1 - interpol) * grad[index][2] +
		  interpol *  grad[ix2][2]);
    mlColorTbl.push(255);
  }
  return mlColorTbl;
})();

GenSSHLayer.render.pixelPP = function(value, data, destIdx,
				   osaFac, inv_osaFac) {
  if (value == -128 || isNaN(value)) { // Undefined SSH
    data[destIdx+0] = 0|(data[destIdx+0] * inv_osaFac + 0 * osaFac);
    data[destIdx+1] = 0|(data[destIdx+1] * inv_osaFac + 0 * osaFac);
    data[destIdx+2] = 0|(data[destIdx+2] * inv_osaFac + 0 * osaFac);
    data[destIdx+3] = 0|(data[destIdx+3] * inv_osaFac + 0 * osaFac);
    return;
  }

  var red, green, blue;
  switch (SSHParams.shadeStyle) {
  case 1: // MATLAB
    value *= SSHParams.shadeScale;
    value /= 128;
    if (value < -1) value = -1;
    if (value > 1) value = 1;
    value = 0|((value + 1) / 2 * 255);
    value <<= 2;
    red = this.mlColorTbl[value++];
    green = this.mlColorTbl[value++];
    blue = this.mlColorTbl[value++];
    break;
  case 2: // Contour bands
    value += 128;
    value *= SSHParams.shadeScale;
    if (value & 0x100) value = ~value;
    value &= 0xff;
    red = green = blue = value;
    break;
  default: // Grayscale
    value *= SSHParams.shadeScale;
    value /= 128;
    if (value > 1) value = 1;
    if (value < -1) value = -1;
    value = 0|((value + 1) / 2 * 255);
    red = green = blue = value;
    break;
  }

  data[destIdx+0] = 0|(data[destIdx+0] * inv_osaFac + red * osaFac);
  data[destIdx+1] = 0|(data[destIdx+1] * inv_osaFac + green * osaFac);
  data[destIdx+2] = 0|(data[destIdx+2] * inv_osaFac + blue * osaFac);
  data[destIdx+3] = 0|(data[destIdx+3] * inv_osaFac + 255 * osaFac);
};

/********************************************************************/

/**
 * An SSHLayer implementation that is optimized to quickly and
 * exclusively render a grayscale, equirectangular projection SSH
 * layer.
 */
var EquiGraySSHLayer = new RenderLayer();
OEV.EquiGraySSHLayer = EquiGraySSHLayer;
EquiGraySSHLayer.loadData = new ImageLoader();
EquiGraySSHLayer.loadData.prontoMode = true;

EquiGraySSHLayer.initCtx = function() {
  var loadFrame = Dates.dateList[Dates.curDate].split("-").join("");
  var newUrl = SSHParams.loadPrefix + "jpgssh/ssh_" + loadFrame +
    ".jpg";
  if (newUrl != this.loadData.url) {
    this.loadData.timeout = this.timeout;
    this.loadData.notifyFunc = this.notifyFunc;
    this.loadData.url = newUrl;
    this.loadData.initCtx();
  }

  this.status.returnType = CothreadStatus.PREEMPTED;
  this.status.preemptCode = 0;
  this.status.percent = 0;
};

EquiGraySSHLayer.contExec = function() {
  // Load the SSH frame if it has not yet been loaded.
  if (this.loadData.status.returnType != CothreadStatus.FINISHED) {
    var status = this.loadData.continueCT();
    this.status.returnType = CothreadStatus.PREEMPTED;
    this.status.preemptCode = status.preemptCode;
    this.status.percent = status.percent;
    if (status.returnType == CothreadStatus.FINISHED) {
      if (this.loadData.retVal == 200 ||
	  this.loadData.retVal == ImageLoader.SUCCESS) {
	this.backBuf = this.loadData.image;
	this.loadData.backBuf = null;
	this.retVal = 0;
      } else {
	this.status.returnType = CothreadStatus.FINISHED;
	this.retVal = RenderLayer.LOAD_ERROR;
      }
    }
    return this.status;
  }

  // Otherwise, render.
  return this.render();
};

EquiGraySSHLayer.render = function() {
  var fbwidth = this.frontBuf.width;
  var x = (ViewParams.mapCenter[0] + 1) / 2 *
    fbwidth;
  var y = (-ViewParams.mapCenter[1] + 1) / 2 *
    fbwidth / ViewParams.aspectXY;
  var width = fbwidth * ViewParams.scale;
  var height = fbwidth * ViewParams.scale / ViewParams.aspectXY;

  /* this.frontBuf.style.cssText =
    "position: relative; left: " +
    ViewParams.mapCenter[0] * width + "; top: " +
    ViewParams.mapCenter[1] * height * ViewParams.aspectXY; */

  var ctx = this.frontBuf.getContext("2d");
  ctx.clearRect(0, 0, this.frontBuf.width, this.frontBuf.height);
  ctx.drawImage(this.backBuf, x - width / 2, y - height / 2, width, height);

  // Draw duplicates on the left and right sides.
  ctx.drawImage(this.backBuf, x - width / 2 - width, y - height / 2,
		width, height);
  ctx.drawImage(this.backBuf, x - width / 2 + width, y - height / 2,
		width, height);

  this.status.returnType = CothreadStatus.FINISHED;
  this.status.preemptCode = RenderLayer.RENDERING;
  this.status.percent = CothreadStatus.MAX_PERCENT;
  return this.status;
};

/********************************************************************/

/**
 * An SSHLayer implementation that is optimized to quickly and
 * exclusively render a grayscale, equirectangular projection SSH
 * layer.  This renderer attempts to load the current frame from a
 * video element.  If that fails, then this render falls back to
 * loading the current frame from an image.
 */
var EquiGrayVidSSHLayer = new RenderLayer();
OEV.EquiGrayVidSSHLayer = EquiGrayVidSSHLayer;
// EquiGrayVidSSHLayer.loadData = new ImageLoader();

/**
 * NOTE: Although it would be nice if we could just keep updating
 * currentTime to play a video forwards or backwards or at any speed,
 * we cannot practically do that.
 */

// Initialize the back buffer.
(function() {
  var backBuf = document.createElement("video");
  backBuf.id = "sshVidBackBuf";
  backBuf.preload = "auto";
  backBuf.width = 1440; backBuf.height = 720;
  backBuf.src = "../data/ssh.ogv";

  EquiGrayVidSSHLayer.backBuf = backBuf;
})();

EquiGrayVidSSHLayer.initCtx = function() {
  /* var loadFrame = Dates.dateList[Dates.curDate].split("-").join("");
  var newUrl = SSHParams.loadPrefix + "jpgssh/ssh_" + loadFrame +
    ".jpg";
  if (newUrl != this.loadData.url) {
    this.loadData.timeout = this.timeout;
    this.loadData.notifyFunc = this.notifyFunc;
    this.loadData.url = newUrl;
    this.loadData.initCtx();
  } */

  this.status.returnType = CothreadStatus.PREEMPTED;
  this.status.preemptCode = 0;
  this.status.percent = 0;
};

EquiGrayVidSSHLayer.contExec = function() {
  // Load the SSH frame if it has not yet been loaded.
  /* if (this.loadData.status.returnType != CothreadStatus.FINISHED) {
    var status = this.loadData.continueCT();
    this.status.returnType = CothreadStatus.PREEMPTED;
    this.status.preemptCode = status.preemptCode;
    this.status.percent = status.percent;
    if (status.returnType == CothreadStatus.FINISHED) {
      if (this.loadData.retVal == 200 ||
	  this.loadData.retVal == ImageLoader.SUCCESS) {
	this.backBuf = this.loadData.image;
	this.loadData.backBuf = null;
	this.retVal = 0;
      } else {
	this.status.returnType = CothreadStatus.FINISHED;
	this.retVal = RenderLayer.LOAD_ERROR;
      }
    }
    return this.status;
  } */

  // Otherwise, render.
  /* NOTE: It's important that we can seek through the video with
     sub-second precision.  Thus, we set `currentTime' rather than use
     `fastSeek()'. */
  this.backBuf.currentTime = Dates.curDate / 25;
  return this.render();
};

EquiGrayVidSSHLayer.render = function() {
  var fbwidth = this.frontBuf.width;
  var x = (ViewParams.mapCenter[0] + 1) / 2 *
    fbwidth;
  var y = (-ViewParams.mapCenter[1] + 1) / 2 *
    fbwidth / ViewParams.aspectXY;
  var width = fbwidth * ViewParams.scale;
  var height = fbwidth * ViewParams.scale / ViewParams.aspectXY;

  /* this.frontBuf.style.cssText =
    "position: relative; left: " +
    ViewParams.mapCenter[0] * width + "; top: " +
    ViewParams.mapCenter[1] * height * ViewParams.aspectXY; */

  var ctx = this.frontBuf.getContext("2d");
  ctx.clearRect(0, 0, this.frontBuf.width, this.frontBuf.height);
  ctx.drawImage(this.backBuf, x - width / 2, y - height / 2, width, height);

  // Draw duplicates on the left and right sides.
  ctx.drawImage(this.backBuf, x - width / 2 - width, y - height / 2,
		width, height);
  ctx.drawImage(this.backBuf, x - width / 2 + width, y - height / 2,
		width, height);

  this.status.returnType = CothreadStatus.FINISHED;
  this.status.preemptCode = RenderLayer.RENDERING;
  this.status.percent = CothreadStatus.MAX_PERCENT;
  return this.status;
};

/********************************************************************/

/** Pointer to the current SSHLayer implementation.  */
var SSHLayer = GenSSHLayer;
OEV.SSHLayer = SSHLayer;
