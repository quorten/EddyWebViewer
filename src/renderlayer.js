/* Abstract class for a render layer.  */

import "cothread";
import "projector";

/**
 * Abstract class for a render layer.  A derived class must be created
 * that has methods that do something useful.
 * @constructor
 */
var RenderLayer = function() {
  /**
   * RenderLayer front buffer (HTML Canvas), used for storing
   * completed renders.  This can either be manually composited into
   * another Canvas or inserted into the document for automatic
   * compositing of render layers.
   * @readonly
   */
  this.frontBuf = document.createElement("canvas");
};

RenderLayer.READY = 0;
RenderLayer.NEED_DATA = 1;

/**
 * Set the limits of this rendering engine's internal caches.
 * Internal caches are very implementation-specific, but they can be
 * generalized to the two parameters that this function accepts.
 *
 * For trivial rendering units, the data cache and render cache will
 * be identical.
 * @abstract
 *
 * @param {integer} dataCache - Data loaded from an external source,
 * measured in implementation-specific entities.
 *
 * @param {integer} renderCache - Maximum size of prerendered images,
 * measured in pixels.
 */
RenderLayer.prototype.setCacheLimits = function(dataCache, renderCache) {
  throw new Error("Must be implemented by a subclass!");
};

/**
 * Load any pending data resources that must be loaded.  This function
 * is cothreaded so that a controlling function can provide
 * responsiveness.  If this function is called when all pending data
 * has been loaded, then it prefetches additional data that is likely
 * to be needed in the near future.
 *
 * Return value: One of the following constants:
 *
 *  * RenderLayer.READY -- All critical data for rendering has been
 *    loaded.
 *
 *  * RenderLayer.NEED_DATA -- Critical data for rendering still needs
 *    to be loaded.  It may still be possible to do a render with only
 *    partial data available, but the render will only display some of
 *    all the necessary data.
 *
 * @abstract
 *
 * @returns the cothread status of the data load operation.
 */
RenderLayer.prototype.loadData = function() {
  throw new Error("Must be implemented by a subclass!");
};

/**
 * Setup the viewport and projection of a render layer.
 * @abstract
 *
 * @param {AbstractPoint} center - The point in the content
 * coordinate space that should appear at the center of the viewport.
 * @param {integer} width - The width of the rendering viewport in
 * pixels.
 * @param {integer} height - The height of the rendering viewport in
 * pixels.
 * @param {Number} aspectXY - X/Y aspect ratio.  This parameter is
 * used to scale the Y axis to preserve the indicated aspect ratio for
 * the normalized coordinates [-1..1].  The normalized Y coordinate is
 * then scaled to be in terms of the actual height of the viewport.
 * @param {Projector} projector - The projector to use for rendering
 * the content into the viewport.
 *
 * @returns One of the following constants:
 *
 *  * RenderLayer.READY -- Changing the viewport was successful and a
 *    render may immediately proceed.
 *
 *  * RenderLayer.NEED_DATA -- The new viewport requires additional
 *    data that needs to be loaded.  It may still be possible to do a
 *    render with only partial data available, but the render will
 *    only display some of all the necessary data.
 */
RenderLayer.prototype.setViewport =
  function(center, width, height, aspectXY, projector) {
  throw new Error("Must be implemented by a subclass!");
};

RenderLayer.FRAME_AVAIL = 0;
RenderLayer.NO_DISP_FRAME = 1;

/**
 * Cothreaded rendering routine.
 * @abstract
 *
 * @returns The cothread status of the render operation.  When the
 * cothread gets preempted before the rendering task is finished, the
 * CothreadStatus preemptCode is one of the following values:
 *
 *  * RenderLayer.FRAME_AVAIL -- A partial frame has been rendered
 *    that is suitable for display.
 *
 *  * RenderLayer.NO_DISP_FRAME -- The partial frame is not suitable
 *    for display.
 */
RenderLayer.prototype.render = function() {
  throw new Error("Must be implemented by a subclass!");
};

/**
 * Cothreaded RayTracer base class.  A raytracer is a per-pixel
 * renderer that maps a pixel on the frontbuffer to the backbuffer
 * using a {@linkcode Projector}.
 *
 * Parameters:
 *
 * "frontBuf" (this.frontBuf) -- The HTML Canvas to use as the front
 * buffer.
 *
 * "backBuf" (this.backBuf) -- The data to use as the back buffer.
 *
 * "backBufType" (this.backBufType) -- The type of data stored in the
 * back buffer:
 *
 * * 0: ImageData structure.
 *
 * * 1: An object similer to an ImageData structure, but the `data`
 *   array is a Number array.  {@linkcode RayTracer#pixelPP} is used
 *   to compute the color value of the pixel to display.
 *
 * @constructor
 *
 * @param {Canvas} frontBuf
 * @param {ImageData} backBuf
 */
var RayTracer = function(frontBuf, backBuf) {
  this.frontBuf = frontBuf;
  this.backBuf = backBuf;
  if (this.frontBuf)
    this.resizeFrontBuf();
};

RayTracer.prototype = new Cothread();
RayTracer.constructor = RayTracer;

/**
 * If the width or height of the front buffer has changed, call this
 * function to resize the ImageData structure used to store the
 * intermediate raytrace render.
 */
RayTracer.prototype.resizeFrontBuf = function() {
  var frontBuf = this.frontBuf;
  if (frontBuf.width != this.destImg.width ||
      frontBuf.height != this.destImg.height) {
    this.destImg = frontBuf.getContext("2d").
      getImageData(0, 0, frontBuf.width, frontBuf.height);
  }
};

/**
 * Additional post-processing operations to perform on a pixel before
 * display.
 * @function
 * @param {Number} value - If the source data is a `Number` array,
 * then this is the numeric value of the input.
 * @param {ImageData} data - The destination data.
 * @param {ImageData} destIdx - Index into `data` of pixel to
 * process.
 */
RayTracer.prototype.pixelPP = function(value, data, destIdx) {
  value = ~~((value + 1) / 2 * 255);
  data[destIdx++] = value;
  data[destIdx++] = value;
  data[destIdx++] = value;
  data[destIdx++] = 255;
};

RayTracer.prototype.startExec = function() {
  this.ctx = this.frontBuf.getContext("2d");
  this.destIdx = 0;
  this.x = 0;
  this.y = 0;
  var osaPass = 1;
  var osaFac = 1 / osaPass;
  result = ~~(orig * (1 - osaFac) + add * osaFac);
  if (osaPass > 1)
    xj = 2;
};

RayTracer.prototype.contExec = function() {
  var ctx = this.ctx;
  var destImg = this.destImg;
  var destIdx = this.destIdx;
  var x = this.x;
  var y = this.y;
  var oldY = y;

  var backBuf_width = this.backBuf.width;
  var backBuf_height = this.backBuf.height;
  var frontBuf_width = this.frontBuf.width;
  var frontBuf_height = this.frontBuf.height;
  var aspectXY = this.aspectXY;
  var inv_aspectXY = 1 / aspectXY;
  var projector_unproject = this.projector.unproject;

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
	destImg.data[destIdx++] = 0;
	destImg.data[destIdx++] = 0;
	destImg.data[destIdx++] = 0;
	destImg.data[destIdx++] = 0;
	x++;
	continue;
      }
      var latIdx = ~~((polCoord.lat + 90) / 180 * src_height);
      var lonIdx = ~~((polCoord.lon + 180) / 360 * src_width);
      var value = sshData[latIdx*src_width+lonIdx];
      // var value = sshData[y*src_width+x];

      if (isNaN(value) || value == -128) {
	destImg.data[destIdx++] = 0;
	destImg.data[destIdx++] = 0;
	destImg.data[destIdx++] = 0;
	destImg.data[destIdx++] = 0;
	x++;
	continue;
      }

      if (SSHLayer.shadeStyle == 1) { // MATLAB
	value /= 32;
	if (value > 1) value = 1;
	if (value < -1) value = -1;
	value = ~~((value + 1) / 2 * 255);
	value <<= 2;
	destImg.data[destIdx++] = colorTbl[value++];
	destImg.data[destIdx++] = colorTbl[value++];
	destImg.data[destIdx++] = colorTbl[value++];
	destImg.data[destIdx++] = colorTbl[value++];
      } else if (SSHLayer.shadeStyle == 2) { // Contour bands
	value += 32;
	value *= (1 << 5);
	if (value & 0x100) value = ~value;
	value &= 0xff;
	destImg.data[destIdx++] = value;
	destImg.data[destIdx++] = value;
	destImg.data[destIdx++] = value;
	destImg.data[destIdx++] = 255;
      } else { // Grayscale
	value /= 32;
	if (value > 1) value = 1;
	if (value < -1) value = -1;
	value = ~~((value + 1) / 2 * 255);
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
};
