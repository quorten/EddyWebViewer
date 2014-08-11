/* Render layer for display of the Sea Surface Height (SSH).  */

import "oevns";
import "renderlayer";
import "csv";
import "ajaxloaders";

/**
 * Sea Surface Height Layer.
 *
 * This object has many important parameters.  However, they do not
 * show up in the JSDocs.  See the source code for these details.
 *
 * `this.notifyFunc` is used to wake up the main loop to load more
 * data, if provided.
 */
var SSHLayer = new RenderLayer();
OEV.SSHLayer = SSHLayer;
SSHLayer.loadXHRData = new XHRLoader();
SSHLayer.loadImageData = new ImageLoader();
SSHLayer.loadData = SSHLayer.loadImageData;
SSHLayer.render = new RayTracer(null, 1, 1);
SSHLayer.frontBuf = SSHLayer.render.frontBuf;
SSHLayer.setViewport = function(width, height) {
  return this.render.setViewport(width, height);
};

// Important parameters for SSHLayer:

/** imgFormat: desired image format to use */
SSHLayer.imgFormat = "png";

/** loadPrefix: path prefix to append to date for frame to load */
SSHLayer.loadPrefix = "../data/";

/** loadFrame: hyphenless date of frame to load */
SSHLayer.loadFrame = "19921014";

/** shadeStyle: See the pixelPP() function for details */
SSHLayer.shadeStyle = 1;

// TODO: Add JSON format reader.  Use conversion classes.

/* TODO: Fast shortcuts.

CSS renderer

Video renderer

*/

SSHLayer.initCtx = function() {
  var newUrl;
  if (this.imgFormat == "dat") {
    newUrl = this.loadPrefix + "SSH/ssh_" + this.loadFrame +
      "." + this.imgFormat;
    SSHLayer.loadData = SSHLayer.loadXHRData;
  } else {
    newUrl =
      this.loadPrefix +
      this.imgFormat + "ssh/ssh_" + this.loadFrame +
      "." + this.imgFormat;
    SSHLayer.loadData = SSHLayer.loadImageData;
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

SSHLayer.contExec = function() {
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
      } else {
	this.status.returnType = CothreadStatus.FINISHED;
	this.retVal = RenderLayer.LOAD_ERROR;
      }
    }
    return this.status;
  }

  return this.render.continueCT();
};

SSHLayer.loadXHRData.procData = function(httpRequest, responseText) {
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

SSHLayer.loadImageData.procData = function(image) {
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
  if (SSHLayer.imgFormat == "jpg") {
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
  else if (SSHLayer.imgFormat == "png") {
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
SSHLayer.render.mlColorTbl = (function() {
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

SSHLayer.render.pixelPP = function(value, data, destIdx,
				   osaFac, inv_osaFac) {
  if (value == -128 || isNaN(value)) { // Undefined SSH
    data[destIdx+0] = 0|(data[destIdx+0] * inv_osaFac + 0 * osaFac);
    data[destIdx+1] = 0|(data[destIdx+1] * inv_osaFac + 0 * osaFac);
    data[destIdx+2] = 0|(data[destIdx+2] * inv_osaFac + 0 * osaFac);
    data[destIdx+3] = 0|(data[destIdx+3] * inv_osaFac + 0 * osaFac);
    return;
  }

  var red, green, blue;
  switch (SSHLayer.shadeStyle) {
  case 1: // MATLAB
    value /= 32;
    if (value < -1) value = -1;
    if (value > 1) value = 1;
    value = 0|((value + 1) / 2 * 255);
    value <<= 2;
    red = this.mlColorTbl[value++];
    green = this.mlColorTbl[value++];
    blue = this.mlColorTbl[value++];
    break;
  case 2: // Contour bands
    value += 32;
    value *= (1 << 5);
    if (value & 0x100) value = ~value;
    value &= 0xff;
    red = green = blue = value;
    break;
  default: // Grayscale
    value /= 32;
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
