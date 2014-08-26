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
 * * 3: Waters
 */
SSHParams.shadeStyle = 0;

/**
 * Sea surface height value to consider to be at the center of the
 * visualized value range.
 */
SSHParams.shadeBase = 0;

/**
 * Scale factor for shading the SSH values.  When set to one, -128 and
 * +128 correspond to the bottom and top of the visualized value range
 * respectively.
 */
SSHParams.shadeScale = 4;

/**
 * If sets to `true`, render white at SSH positions where the value is
 * NaN.  This is useful for more informative visualization of the
 * polar ice caps.  If set to `false` then these positions rendered as
 * transparent.  Positions where the projection is undefined are
 * always rendered as transparent.
 */
SSHParams.whiteAtUndef = true;

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
GenSSHLayer.setViewParams = function(vp) {
  this.vp = vp; return this.render.setViewParams(vp);
};

GenSSHLayer.initCtx = function() {
  if (!Dates.dateList) {
    this.status.returnType = CothreadStatus.FINISHED;
    this.status.preemptCode = 0;
    this.status.percent = CothreadStatus.MAX_PERCENT;
    this.retVal = RenderLayer.LOAD_ERROR;
    return;
  }

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

var makeColorTbl = function(grad) {
  var colorTbl = [];
  var numStops = grad.length - 1;
  for (var i = 0; i < 256; i++) {
    var value = i / 256 * numStops;
    var index =  0|value;
    var ix2 = index + 1;
    if (ix2 > numStops) ix2 = numStops;
    var interpol = value % 1;
    colorTbl.push((1 - interpol) * grad[index][0] +
		  interpol *  grad[ix2][0]);
    colorTbl.push((1 - interpol) * grad[index][1] +
		  interpol *  grad[ix2][1]);
    colorTbl.push((1 - interpol) * grad[index][2] +
		  interpol *  grad[ix2][2]);
    colorTbl.push(255);
  }
  return colorTbl;
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
  return makeColorTbl(grad);
})();

/* First variant of the waters color table.  The colors are designed
   to be like deep sea colors.  */
GenSSHLayer.render.dewaColorTbl = (function() {
  var grad = [ [ 0x00, 0x00, 0x00 ],
	       [ 0x00, 0x50, 0x30 ],
	       [ 0x00, 0x90, 0x70 ],
	       [ 0x00, 0xc0, 0xc0 ],
	       [ 0x40, 0xc0, 0xff ],
	       [ 0xc0, 0xc0, 0xff ],
	       [ 0xff, 0xff, 0xff ] ];
  return makeColorTbl(grad);
})();

/* Second variant of the waters color table.  These colors are more of
   a surface-level sky-reflecting color.  A little bit too deep blue,
   though.  More cyan would be better.  */
GenSSHLayer.render.bwaColorTbl = (function() {
  var grad = [ [ 0x00, 0x00, 0x00 ],
	       [ 0x00, 0x20, 0x60 ],
	       [ 0x00, 0x40, 0xc0 ],
	       [ 0x40, 0x80, 0xc0 ],
	       [ 0x80, 0x80, 0xff ],
	       [ 0xc0, 0xc0, 0xff ],
	       [ 0xff, 0xff, 0xff ] ];
  return makeColorTbl(grad);
})();

/* Third variation of the waters color table.  Perfect hue.  Need more
   saturation, though.  */
GenSSHLayer.render.hwaColorTbl = (function() {
  var grad = [ [ 0x00, 0x00, 0x00 ],
	       [ 0x00, 0x40, 0x40 ],
	       [ 0x00, 0x80, 0x80 ],
	       [ 0x00, 0x80, 0xff ],
	       [ 0x40, 0xc0, 0xff ],
	       [ 0xc0, 0xc0, 0xff ],
	       [ 0xff, 0xff, 0xff ] ];
  return makeColorTbl(grad);
})();

/* Forth variation of the waters color table.  This one seems to be
   okay.  */
GenSSHLayer.render.waColorTbl = (function() {
  var grad = [ [ 0x00, 0x00, 0x00 ],
	       [ 0x14, 0x36, 0x36 ],
	       [ 0x28, 0x6c, 0x6c ],
	       [ 0x40, 0x80, 0xc0 ],
	       [ 0x76, 0xb6, 0xd4 ],
	       [ 0xcb, 0xcb, 0xea ],
	       [ 0xff, 0xff, 0xff ] ];
  return makeColorTbl(grad);
})();

GenSSHLayer.render.pixelPP = function(value, data, destIdx,
				   osaFac, inv_osaFac) {
  var red, green, blue;
  if (value == -128 || isNaN(value)) { // Undefined SSH
    var alpha;
    if (SSHParams.whiteAtUndef)
      red = green = blue = alpha = 255;
    else red = green = blue = alpha = 0;

    data[destIdx+0] = 0|(data[destIdx+0] * inv_osaFac + red * osaFac);
    data[destIdx+1] = 0|(data[destIdx+1] * inv_osaFac + green * osaFac);
    data[destIdx+2] = 0|(data[destIdx+2] * inv_osaFac + blue * osaFac);
    data[destIdx+3] = 0|(data[destIdx+3] * inv_osaFac + alpha * osaFac);
    return;
  }

  switch (SSHParams.shadeStyle) {
  case 1: // MATLAB
    value = (value - SSHParams.shadeBase) * SSHParams.shadeScale;
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
    value = (value - SSHParams.shadeBase) * SSHParams.shadeScale;
    if (value & 0x100) value = ~value;
    value &= 0xff;
    red = green = blue = value;
    break;
  case 3: // Waters
    value = (value - SSHParams.shadeBase) * SSHParams.shadeScale;
    value /= 128;
    if (value < -1) value = -1;
    if (value > 1) value = 1;
    value = 0|((value + 1) / 2 * 255);
    value <<= 2;
    red = this.waColorTbl[value++];
    green = this.waColorTbl[value++];
    blue = this.waColorTbl[value++];
    break;
  default: // Grayscale
    value = (value - SSHParams.shadeBase) * SSHParams.shadeScale;
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
 * A specialized SSHLayer implementation for:
 *
 * * equirectangular projection,
 *
 * * grayscale shading with default parameters,
 *
 * * with data loaded verbatim from JPEG images, and
 *
 * * tiling the source image to a front-buffer HTML Canvas via
 *   drawImage().
 */
var EquiGraySSHLayer = new EquiRenderLayer();
OEV.EquiGraySSHLayer = EquiGraySSHLayer;
EquiGraySSHLayer.loadData = new ImageLoader();
EquiGraySSHLayer.loadData.prontoMode = true;

EquiGraySSHLayer.initCtx = function() {
  if (!Dates.dateList) {
    this.status.returnType = CothreadStatus.FINISHED;
    this.status.preemptCode = 0;
    this.status.percent = CothreadStatus.MAX_PERCENT;
    this.retVal = RenderLayer.LOAD_ERROR;
    return;
  }

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

EquiGraySSHLayer.loadData.procData = function(image) {
  this.backBuf = image; this.image = null;
  this.status.returnType = CothreadStatus.FINISHED;
  this.status.preemptCode = 0;
  return this.status;
};

/********************************************************************/

/**
 * A specialized SSHLayer implementation for:
 *
 * * equirectangular projection,
 *
 * * grayscale shading with default parameters,
 *
 * * with data loaded verbatim from JPEG images, and
 *
 * * positioning and scaling the source image as an HTML element via
 *   CSS.
 */
var EquiGrayCSSSSHLayer = new EquiCSSRenderLayer();
OEV.EquiGrayCSSSSHLayer = EquiGrayCSSSSHLayer;
EquiGrayCSSSSHLayer.loadData = new ImageLoader();
EquiGrayCSSSSHLayer.loadData.prontoMode = true;

EquiGrayCSSSSHLayer.initCtx = function() {
  if (!Dates.dateList) {
    this.status.returnType = CothreadStatus.FINISHED;
    this.status.preemptCode = 0;
    this.status.percent = CothreadStatus.MAX_PERCENT;
    this.retVal = RenderLayer.LOAD_ERROR;
    return;
  }

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

EquiGrayCSSSSHLayer.loadData.procData = function(image) {
  this.backBuf = image; this.image = null;
  this.status.returnType = CothreadStatus.FINISHED;
  this.status.preemptCode = 0;
  return this.status;
};

/********************************************************************/

/**
 * A specialized SSHLayer implementation for:
 *
 * * equirectangular projection,
 *
 * * grayscale shading with default parameters,
 *
 * * with data loaded verbatim from a video, and
 *
 * * positioning and scaling the source image as an HTML video element
 *   via CSS.
 */
var EquiGrayVidSSHLayer = new RenderLayer();
OEV.EquiGrayVidSSHLayer = EquiGrayVidSSHLayer;
EquiGrayVidSSHLayer.frontBuf = document.createElement("div");
EquiGrayVidSSHLayer.frontBuf.appendChild(document.createElement("div"));

EquiGrayVidSSHLayer.setViewport = function(width, height) {
  var inner = this.frontBuf.firstChild;
  var fbstyle = this.frontBuf.style;
  fbstyle.width = width + "px";
  fbstyle.height = height + "px";
  var cssText = "";
  /* NOTE: You must have the "ie-inline-block" class defined in your HTML
     for this to work.  */
  var className = document.getElementById("topBody").className;
  if (className == "ie6" || className =="ie7")
    inner.className = "ie-inline-block";
  else cssText = "display: inline-block; ";
  cssText += "position: relative; width: " + width +
    "px; height: " + height + "px; overflow: hidden";
  inner.style.cssText = cssText;
};

EquiGrayVidSSHLayer.initCtx = function() {
  // Initialize the back buffer.
  if (!this.backBuf) {
    var backBuf = document.createElement("video");
    backBuf.id = "sshVidBackBuf";
    backBuf.preload = "auto";
    backBuf.width = 1440; backBuf.height = 720;
    backBuf.src = "../data/ssh.ogv";
    if (!backBuf.canPlayType("video/ogg"))
      ; // That's a load error.

    EquiGrayVidSSHLayer.backBuf = backBuf;

    var inner = EquiGrayVidSSHLayer.frontBuf.firstChild;
    inner.appendChild(backBuf);
  }

  this.status.returnType = CothreadStatus.PREEMPTED;
  this.status.preemptCode = 0;
  this.status.percent = 0;
};

EquiGrayVidSSHLayer.contExec = function() {
  /* If there is no data for the current (soon to be previous) frame,
     return a load error.  */
  if (this.backBuf.readyState >= 2) /* HAVE_CURRENT_DATA ||
				       HAVE_FUTURE_DATA ||
				       HAVE_ENOUGH_DATA.  */
    this.retVal = 0;
  else {
    this.retVal = RenderLayer.LOAD_ERROR;
    this.status.returnType = CothreadStatus.FINISHED;
    this.status.preemptCode = 0;
    this.status.percent = CothreadStatus.MAX_PERCENT;
    return this.status;
  }

  /* NOTE: Although it would be nice if we could just keep updating
     currentTime to play a video forwards or backwards or at any
     speed, we cannot practically do that, due to browser
     limitations.  */

  /* NOTE: Old versions of Firefox do not support the `seekable' and
     `playbackRate' properties on a video element.  */

  /* NOTE: It's important that we can seek through the video with
     sub-second precision.  Thus, we set `currentTime' rather than use
     `fastSeek()'. */
  this.backBuf.currentTime = Dates.curDate / 25;
  return this.render();
};

EquiGrayVidSSHLayer.render = EquiGrayCSSSSHLayer.render;

/********************************************************************/

/**
 * A specialized SSHLayer implementation for:
 *
 * * equirectangular projection,
 *
 * * grayscale shading with default parameters,
 *
 * * with data loaded verbatim from a video, and
 *
 * * tiling the source image to a front-buffer HTML Canvas via
 *   drawImage().
 */
var EquiGrayVidCanvSSHLayer = new RenderLayer();
OEV.EquiGrayVidCanvSSHLayer = EquiGrayVidCanvSSHLayer;

EquiGrayVidCanvSSHLayer.initCtx = function() {
  // Initialize the back buffer.
  if (!this.backBuf) {
    var backBuf = document.createElement("video");
    backBuf.id = "sshVidBackBuf";
    backBuf.preload = "auto";
    backBuf.width = 1440; backBuf.height = 720;
    backBuf.src = "../data/ssh.ogv";
    if (!backBuf.canPlayType("video/ogg"))
      ; // That's a load error.

    this.backBuf = backBuf;
  }

  this.status.returnType = CothreadStatus.PREEMPTED;
  this.status.preemptCode = 0;
  this.status.percent = 0;
};

EquiGrayVidCanvSSHLayer.contExec = function() {
  /* If there is no data for the current (soon to be previous) frame,
     return a load error.  */
  if (this.backBuf.readyState >= 2) /* HAVE_CURRENT_DATA ||
				       HAVE_FUTURE_DATA ||
				       HAVE_ENOUGH_DATA.  */
    this.retVal = 0;
  else {
    this.retVal = RenderLayer.LOAD_ERROR;
    this.status.returnType = CothreadStatus.FINISHED;
    this.status.preemptCode = 0;
    this.status.percent = CothreadStatus.MAX_PERCENT;
    return this.status;
  }

  /* NOTE: Although it would be nice if we could just keep updating
     currentTime to play a video forwards or backwards or at any
     speed, we cannot practically do that, due to browser
     limitations.  */

  /* NOTE: Old versions of Firefox do not support the `seekable' and
     `playbackRate' properties on a video element.  */

  /* NOTE: It's important that we can seek through the video with
     sub-second precision.  Thus, we set `currentTime' rather than use
     `fastSeek()'. */
  this.backBuf.currentTime = Dates.curDate / 25;
  return this.render();
};

EquiGrayVidCanvSSHLayer.render = EquiGraySSHLayer.render;

/********************************************************************/

/** Pointer to the current SSHLayer implementation.  */
var SSHLayer = OEV.SSHLayer = GenSSHLayer;
