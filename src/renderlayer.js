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
 * "maxOsaPasses" (this.maxOsaPasses) -- The maximum number of
 * oversampling passes to perform before the raytrace is considered
 * complete.  The current multipass progressive oversampling algorithm
 * does not use extended precision for the intermediate samples, so a
 * factor greater than 8 is effectively useless.
 *
 * @constructor
 *
 * @param {Canvas} frontBuf
 * @param {ImageData} backBuf
 * @param {integer} backBufType
 * @param {integer} maxOsaPasses
 */
var RayTracer = function(frontBuf, backBuf, backBufType, maxOsaPasses) {
  this.frontBuf = frontBuf;
  this.backBuf = backBuf;
  this.backBufType = backBufType;
  this.maxOsaPasses = maxOsaPasses;

  if (this.frontBuf)
    this.resizeFrontBuf();
  this.mapToPol = [ NaN, NaN ];
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
  if (!this.destImg ||
      frontBuf.width != this.destImg.width ||
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
 * @param {ImageData} destIdx - Index into `data` of the RGBA pixel to
 * process.
 * @param osaFac - See example code
 * @param inv_osaFac - See example code
 */
RayTracer.prototype.pixelPP = function(value, data, destIdx,
				       osaFac, inv_osaFac) {
  if (value < -1) value = -1;
  if (value > 1) value = 1;
  value = ~~((value + 1) / 2 * 255);
  data[destIdx+0] = ~~(data[destIdx+0] * inv_osaFac + value * osaFac);
  data[destIdx+1] = ~~(data[destIdx+1] * inv_osaFac + value * osaFac);
  data[destIdx+2] = ~~(data[destIdx+2] * inv_osaFac + value * osaFac);
  data[destIdx+3] = ~~(data[destIdx+3] * inv_osaFac + 255 * osaFac);
};

RayTracer.prototype.startExec = function() {
  this.ctx = this.frontBuf.getContext("2d");
  this.destIdx = 0;
  this.x = 0;
  this.y = 0;
  this.osaPass = 1;
};

RayTracer.prototype.contExec = function() {
  var ctx = this.ctx;
  var destImg = this.destImg;
  var destIdx = this.destIdx;
  var x = this.x;
  var y = this.y;
  var oldY = y;
  var osaPass = this.osaPass;

  var backBufType = this.backBufType;
  var backBuf_width = this.backBuf.width;
  var backBuf_height = this.backBuf.height;
  var backBuf_data = this.backBuf.data;
  var destImg_width = destImg.width;
  var destImg_height = destImg.height;
  var destImg_data = destImg.data;
  var aspectXY = this.aspectXY;
  var inv_aspectXY = 1 / aspectXY;
  var projector_unproject = this.projector.unproject;
  var mapToPol = this.mapToPol;
  var maxOsaPasses = this.maxOsaPasses;

  var osaFac = 1 / osaPass;
  var inv_osaFac = 1 - osaFac;
  var wrapOver = false;

  var lDate_now = Date.now;

  var startTime = lDate_now();
  var timeout = this.timeout;

  while (osaPass <= maxOsaPasses) {
    while (x < destImg_width) {
      var xj = 0, yj = 0; // X and Y jitter
      if (osaPass > 1) {
	xj = 0.5 - Math.random();
	yj = 0.5 - Math.random();
      }
      mapToPol[0] = ((x + xj) / destImg_width) * 2 - 1;
      mapToPol[1] = (((y + yj) / destImg_height) * 2 - 1) * inv_aspectXY;
      projector_unproject(mapToPol);
      if (isNaN(mapToPol[0]) ||
	  mapToPol[1] < -90 || mapToPol[1] > 90 ||
	  mapToPol[0] < -180 || mapToPol[0] >= 180) {
	destImg_data[destIdx+0] = ~~(destImg_data[destIdx+0] * inv_osaFac +
				     0 * osaFac);
	destImg_data[destIdx+1] = ~~(destImg_data[destIdx+1] * inv_osaFac +
				     0 * osaFac);
	destImg_data[destIdx+2] = ~~(destImg_data[destIdx+2] * inv_osaFac +
				     0 * osaFac);
	destImg_data[destIdx+3] = ~~(destImg_data[destIdx+3] * inv_osaFac +
				     0 * osaFac);
	destIdx += 4;
	x++;
	continue;
      }
      var latIdx = ~~((mapToPol[1] + 90) / 180 * (backBuf_height - 1));
      var lonIdx = ~~((mapToPol[0] + 180) / 360 * backBuf_width);

      if (backBufType == 1) {
	var value = backBuf_data[latIdx*backBuf_width+lonIdx];
	this.pixelPP(value, destImg_data, destIdx, osaFac, inv_osaFac);
	destIdx += 4;
      } else {
	var backBufIdx = (latIdx * backBuf_width + lonIdx) * 4;
	destImg_data[destIdx+0] = ~~(destImg_data[destIdx+0] * inv_osaFac +
				     backBuf_data[backBufIdx++] * osaFac);
	destImg_data[destIdx+1] = ~~(destImg_data[destIdx+1] * inv_osaFac +
				     backBuf_data[backBufIdx++] * osaFac);
	destImg_data[destIdx+2] = ~~(destImg_data[destIdx+2] * inv_osaFac +
				     backBuf_data[backBufIdx++] * osaFac);
	destImg_data[destIdx+3] = ~~(destImg_data[destIdx+3] * inv_osaFac +
				     backBuf_data[backBufIdx++] * osaFac);
	destIdx += 4;
      }

      x++;
      /* if (lDate_now() - startTime >= timeout)
	 break; */
    }
    if (x >= destImg_width) {
      x = 0;
      y++;
    }
    if (y >= destImg_height) {
      destIdx = 0;
      y = 0;
      osaPass++;
      osaFac = 1 / osaPass;
      inv_osaFac = 1 - osaFac;
      wrapOver = true;
    }
    if (y % 32 == 0 && lDate_now() - startTime >= timeout)
      break;
  }

  this.setExitStatus(osaPass <= maxOsaPasses);
  if (!wrapOver)
    ctx.putImageData(destImg, 0, 0, 0, oldY, destImg_width, y - oldY);
  else
    ctx.putImageData(destImg, 0, 0, 0, 0, destImg_width, destImg_height);
  this.status.preemptCode = RenderLayer.FRAME_AVAIL;
  this.status.percent = ((y + destImg_height * (osaPass - 1)) *
			 CothreadStatus.MAX_PERCENT /
			 (destImg_height * maxOsaPasses));

  this.destIdx = destIdx;
  this.x = x;
  this.y = y;
  this.osaPass = osaPass;
  return this.status;
};
