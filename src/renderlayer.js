/* Abstract class for a render layer.  */

import "oevns";
import "cothread";
import "oevmath";
import "projector";
import "viewparams";

/**
 * Cothreaded abstract class for a render layer.  A derived class must
 * be created that has methods that do something useful.
 *
 * Basically, this class is a single cothread, and when called as a
 * cothreaded function by a cothread controller, it will produce an
 * updated render in `this.frontBuf`.  Normally, `this.retVal` will be
 * zero, but if there is an error while loading new data, it may be
 * `RenderLayer.LOAD_ERROR`.  The `CothreadStatus.preemptCode` will be
 * set to one of the following values:
 *
 * * `CothreadStatus.IOWAIT` -- The `RenderLayer` is waiting for more
 *   data.
 * * `CothreadStatus.PROC_DATA` -- The `RenderLayer` has downloaded
 *   all necessary data, but was preempted while performing
 *   preprocessing steps that must be completed before rendering the
 *   data.
 * * `RenderLayer.RENDERING` -- The `RenderLayer` was preempted during
 *   rendering.
 *
 * @constructor
 */
var RenderLayer = function() {
  /**
   * RenderLayer front buffer (HTML Canvas by default), used for
   * storing completed renders.  This doesn't have to be an HTML
   * Canvas, it could actually be any element, as long as it works
   * well with the rest of the application.  The element can either be
   * manually composited into another Canvas or inserted into the
   * document for automatic compositing of render layers.
   * @readonly
   */
  this.frontBuf = document.createElement("canvas");
};

OEV.RenderLayer = RenderLayer;
RenderLayer.prototype = new Cothread();
RenderLayer.prototype.constructor = RenderLayer;

RenderLayer.LOAD_ERROR = 1;
RenderLayer.RENDERING = 3;

/**
 * Setup the viewport of a render layer.  Using this function rather
 * than setting the width and height directly on `this.frontBuf` gives
 * the code a chance to perform application-specific processing
 * related to resizing the viewport.
 *
 * @param {integer} width - The width of the rendering viewport in
 * pixels.
 * @param {integer} height - The height of the rendering viewport in
 * pixels.
 */
RenderLayer.prototype.setViewport = function(width, height) {
  this.frontBuf.width = width;
  this.frontBuf.height = height;
};

/**
 * Cothreaded RayTracer base class.  A raytracer is a per-pixel
 * renderer that maps a pixel on the frontbuffer to the backbuffer
 * using a {@linkcode Projector}.
 *
 * Parameters:
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
 * @param {ImageData} backBuf
 * @param {integer} backBufType
 * @param {integer} maxOsaPasses
 */
var RayTracer = function(backBuf, backBufType, maxOsaPasses) {
  this.frontBuf = document.createElement("canvas");
  this.backBuf = backBuf;
  this.backBufType = backBufType;
  this.maxOsaPasses = maxOsaPasses;

  this.mapToPol = [ NaN, NaN ];
};

OEV.RayTracer = RayTracer;
RayTracer.prototype = new RenderLayer();
RayTracer.prototype.constructor = RayTracer;

/**
 * Update the viewport of a RayTracer.
 * @param {integer} width
 * @param {integer} height
 */
RayTracer.prototype.setViewport = function(width, height) {
  this.frontBuf.width = width;
  this.frontBuf.height = height;
  if (!this.destImg ||
      width != this.destImg.width ||
      height != this.destImg.height) {
    this.destImg = this.frontBuf.getContext("2d").
      getImageData(0, 0, width, height);
  }
};

/**
 * Additional post-processing operations to perform on a pixel before
 * display.
 * @function
 * @param {Number} value - If the source data is a `Number` array,
 * then this is the numeric value of the input.
 * @param {ImageData} data - The destination data.
 * @param {integer} destIdx - Index into `data` of the RGBA pixel to
 * process.
 * @param {Number} osaFac - The factor to multiply the new color value
 * by when summing the new and existing color values for oversampling.
 * @param {Number} inv_osaFac - The factor to multiply the existing
 * color value by when summing the new and existing color values for
 * oversampling.
 */
RayTracer.prototype.pixelPP = function(value, data, destIdx,
				       osaFac, inv_osaFac) {
  if (value < -1) value = -1;
  if (value > 1) value = 1;
  value = 0|((value + 1) / 2 * 255);
  data[destIdx+0] = 0|(data[destIdx+0] * inv_osaFac + value * osaFac);
  data[destIdx+1] = 0|(data[destIdx+1] * inv_osaFac + value * osaFac);
  data[destIdx+2] = 0|(data[destIdx+2] * inv_osaFac + value * osaFac);
  data[destIdx+3] = 0|(data[destIdx+3] * inv_osaFac + 255 * osaFac);
};

RayTracer.prototype.initCtx = function() {
  this.ctx = this.frontBuf.getContext("2d");
  this.destIdx = 0;
  this.x = 0;
  this.y = 0;
  this.osaPass = 1;

  this.status.returnType = CothreadStatus.PREEMPTED;
  this.status.preemptCode = 0;
  this.status.percent = 0;
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
  var aspectXY = ViewParams.aspectXY;
  var inv_aspectXY = 1 / aspectXY;
  var projector_unproject = ViewParams.projector.unproject;
  var mapToPol = this.mapToPol;
  var maxOsaPasses = this.maxOsaPasses;

  var osaFac = 1 / osaPass;
  var inv_osaFac = 1 - osaFac;
  var wrapOver = false;

  var ctnow = Cothread.now;

  var startTime = ctnow();
  var timeout = this.timeout;

  while (osaPass <= maxOsaPasses) {
    while (x < destImg_width) {
      var xj = 0, yj = 0; // X and Y jitter
      if (osaPass > 1) {
	xj = 0.5 - Math.random();
	yj = 0.5 - Math.random();
      }

      /* Compute normalized coordinates, applying 2D shift and scale
         factors as necessary.  */
      mapToPol[0] = (((x + xj) / destImg_width) * 2 - 1 -
		     ViewParams.mapCenter[0]) * ViewParams.inv_scale;
      mapToPol[1] = (-(((y + yj) / destImg_height) * 2 - 1) *
		     inv_aspectXY - ViewParams.mapCenter[1]) *
	ViewParams.inv_scale;

      // Unproject.
      projector_unproject(mapToPol);

      // Clip to the projection boundaries, if specified.
      if (ViewParams.clip && (mapToPol[1] < -90 || mapToPol[1] > 90 ||
			      mapToPol[0] < -180 || mapToPol[0] > 180))
	{ mapToPol[0] = NaN; mapToPol[1] = NaN; }

      // Shift to the given latitude and longitude.
      polShiftOrigin(mapToPol, -1);

      if (isNaN(mapToPol[0]) ||
	  mapToPol[1] < -90 || mapToPol[1] > 90 ||
	  mapToPol[0] < -180 || mapToPol[0] >= 180) {
	destImg_data[destIdx+0] = 0|(destImg_data[destIdx+0] * inv_osaFac +
				     0 * osaFac);
	destImg_data[destIdx+1] = 0|(destImg_data[destIdx+1] * inv_osaFac +
				     0 * osaFac);
	destImg_data[destIdx+2] = 0|(destImg_data[destIdx+2] * inv_osaFac +
				     0 * osaFac);
	destImg_data[destIdx+3] = 0|(destImg_data[destIdx+3] * inv_osaFac +
				     0 * osaFac);
	destIdx += 4;
	x++;
	continue;
      }
      var latIdx = 0|((-mapToPol[1] + 90) / 180 * (backBuf_height - 1));
      var lonIdx = 0|((mapToPol[0] + 180) / 360 * backBuf_width);

      if (backBufType == 1) {
	var value = backBuf_data[latIdx*backBuf_width+lonIdx];
	this.pixelPP(value, destImg_data, destIdx, osaFac, inv_osaFac);
	destIdx += 4;
      } else {
	var backBufIdx = (latIdx * backBuf_width + lonIdx) * 4;
	destImg_data[destIdx+0] = 0|(destImg_data[destIdx+0] * inv_osaFac +
				     backBuf_data[backBufIdx++] * osaFac);
	destImg_data[destIdx+1] = 0|(destImg_data[destIdx+1] * inv_osaFac +
				     backBuf_data[backBufIdx++] * osaFac);
	destImg_data[destIdx+2] = 0|(destImg_data[destIdx+2] * inv_osaFac +
				     backBuf_data[backBufIdx++] * osaFac);
	destImg_data[destIdx+3] = 0|(destImg_data[destIdx+3] * inv_osaFac +
				     backBuf_data[backBufIdx++] * osaFac);
	destIdx += 4;
      }

      x++;
      /* if (ctnow() - startTime >= timeout)
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
    /* Note: Previously, in the interest of throughput, we mandated
       completion of a certain number of rows per cothread interval.
       However, we now disable that requirement in the interest of
       maintaining browser responsiveness.  */
    if (/* y % 32 == 0 && */ ctnow() - startTime >= timeout)
      break;
  }

  this.setExitStatus(osaPass <= maxOsaPasses);
  if (!wrapOver)
    ctx.putImageData(destImg, 0, 0, 0, oldY, destImg_width, y - oldY);
  else
    ctx.putImageData(destImg, 0, 0, 0, 0, destImg_width, destImg_height);
  this.status.preemptCode = RenderLayer.RENDERING;
  this.status.percent = ((y + destImg_height * (osaPass - 1)) *
			 CothreadStatus.MAX_PERCENT /
			 (destImg_height * maxOsaPasses));

  this.destIdx = destIdx;
  this.x = x;
  this.y = y;
  this.osaPass = osaPass;
  return this.status;
};
