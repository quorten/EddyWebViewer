/* Render layer for display of the Sea Surface Height (SSH).  */

import "oevns";
import "renderlayer";
import "csv";
import "ajaxloaders";

/*

SSHLayer for new RenderLayer design:

The RenderLayer is keyed primarily on the render() function.  Data
downloading is handled internally by the render function.  No more
separately managed download/render controller loop.  That was too
difficult to manage.

However, this shifts the difficulty to the inside of the RenderLayer.
First of all, how to you derive the class?  It has to derive both from
an AJAX loader and a RenderLayer.  Multiple inheritance, in other
words.

For this, manual merge will do, I guess.  The existing RenderLayer
class is just a policy demonstration.

Another option is using internal aggregation instead.  The generic
cothread controllers are a great help for this.

The easy way: Start with an AJAX loader and add RenderLayer methods on
top of that.  Rendering is handled in procData.

The hard way: Create a new RenderLayer(), create an internal loader
object (also derived), setup rendering in procData(), and daisychain
the initCtx() and contExec() calls in the topmost object.

I like it the easy way.  So that's the way it will be.

And what about multiple different rendering methods?  Simply create
entirely new objects for each method, then work on the simplifications
later.

 */

var SSHLayer = new ImageLoader();
OEV.SSHLayer = SSHLayer;
RayTracer.call(SSHLayer, null, 1, 1);
SSHLayer.setViewport = RayTracer.prototype.setViewport;

/* Important parameters for SSHLayer: */

// imgFormat: desired image format to use
SSHLayer.imgFormat = "png";

// loadPrefix: path prefix to append to date for frame to load
SSHLayer.loadPrefix = "../data/";

// loadFrame: hyphenless date of frame to load
SSHLayer.loadFrame = "19921014";

// shadeStyle: See the procData() function for details
SSHLayer.shadeStyle = 1;

SSHLayer.initCtx = function() {
  SSHLayer.url =
    SSHLayer.loadPrefix +
    SSHLayer.imgFormat + "ssh/ssh_" + SSHLayer.loadFrame +
    "." + SSHLayer.imgFormat;
  this.backBuf = null;
  RayTracer.prototype.initCtx.call(this);
  return ImageLoader.prototype.initCtx.call(this);
};

SSHLayer.procData = function(image) {
  if (!this.backBuf) this.initBackBuf(image);

  /* Note: Although we're normally not allowed to modify the
     CothreadStatus before a tail data processing function in finished
     in an AJAX loader, here it is okay for us to take a liberation
     from this rule, since the Cothread controller is setup to handle
     this.  */
  return RayTracer.prototype.contExec.call(this);
};

SSHLayer.initBackBuf = function(image) {
  /* Pull the pixels off of the image and fill them into the sshData
     array as floating point numbers.  */
  var tmpCanvas = document.createElement("canvas");
  tmpCanvas.width = image.width;
  tmpCanvas.height = image.height;
  var ctx = tmpCanvas.getContext("2d");
  ctx.drawImage(image, 0, 0);
  /* We no longer need the original image, so free up the associated
     memory.  */
  /* But don't actually do this, because it will mess up the
     ImageLoader cothreading mechanism.  */
  // this.image = null;
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

  this.backBuf = { data: [], width: image.width, height: image.height };
  var i = 0;
  var bad; // Bits After Decimal
  var bbd; // Bits Before Decimal
  if (this.imgFormat == "jpg") {
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

  } else if (this.imgFormat == "png") {
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

  /* this.backBuf.data = new Float32Array(1440 * 721 * 4);
  var sshData = this.backBuf.data;
  var bytePacker = new Uint8Array(this.backBuf.data.buffer);
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

  // this.backBuf.data = csvParse(httpRequest.responseText);
  // httpRequest.onreadystatechange = null;
  // this.httpRequest = null;
};

SSHLayer.colorTbl = (function() {
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
    var index =  0|value;
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
  return colorTbl;
})();

SSHLayer.pixelPP = function(value, data, destIdx,
			    osaFac, inv_osaFac) {
  if (value == -128) { // Undefined SSH
    data[destIdx+0] = 0|(data[destIdx+0] * inv_osaFac + 0 * osaFac);
    data[destIdx+1] = 0|(data[destIdx+1] * inv_osaFac + 0 * osaFac);
    data[destIdx+2] = 0|(data[destIdx+2] * inv_osaFac + 0 * osaFac);
    data[destIdx+3] = 0|(data[destIdx+3] * inv_osaFac + 0 * osaFac);
    return;
  }

  var red, green, blue;
  switch (this.shadeStyle) {
  case 1: // MATLAB
    value /= 32;
    if (value < -1) value = -1;
    if (value > 1) value = 1;
    value = 0|((value + 1) / 2 * 255);
    value <<= 2;
    red = this.colorTbl[value++];
    green = this.colorTbl[value++];
    blue = this.colorTbl[value++];
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
