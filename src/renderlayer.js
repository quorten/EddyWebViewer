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
 * Basic usage:
 *
 * ~~~
 * // Replace RenderLayer() with a derived class that does something
 * // useful.
 * var layer = new RenderLayer();
 * document.getElementById("topBody").appendChild(layer.frontBuf);
 * layer.setViewport(gViewParams.viewport[0], gViewParams.viewport[1]);
 * layer.setViewParams(gViewParams);
 * layer.start();
 * // Enter the main loop, wait for finish condition...
 * var status = layer.continueCT();
 * if (status.returnType == CothreadStatus.FINISHED)
 *   return;
 * ~~~
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
 * In some implementations that must load all data before rendering
 * can begin, `CothreadStatus.percent` will indicate the percent
 * downloaded when the preemptCode indicates that data is being
 * downloaded or processed, but when the preemptCode indicates
 * rendering, then the percent is that of the rendering process.
 * RenderLayers with pipelined loading and rendering do not expose
 * this quirk.
 *
 * By convention, most RenderLayer implementations that need to load
 * additional data provide two standard methods, `loadData()` and
 * `render()`, which may or may not be cothreaded.  The return value
 * from `loadData()` and its interpretation is
 * implementation-specific, but for the `render()` method, the return
 * value is always the final return value of the RenderLayer.  Some
 * `loadData()` implementations may be designed in a pipelined manner
 * where rendering can be performed with partially available data
 * while `loadData()` is still fetching more data that needs to be
 * rendered.  Calling `loadData()` directly from an external routine
 * can also be used to preload some data, but the calling convention
 * is implementation-specific.
 *
 * @constructor
 */
var RenderLayer = function() {
  /* Note: We must be careful to make sure that the base cothread
     initializations take place.  */
  Cothread.call(this, this.initCtx, this.contExec);

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

  /**
   * RenderLayer-local ViewParams object.  Normally, this is a pointer
   * to the global ViewParams object.
   * @protected
   */
  this.vp = gViewParams;
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
 * Change the ViewParams of a render layer.  Using this function
 * rather than setting the ViewParams directly on `this.vp` gives the
 * code a chance to perform application-specific processing related to
 * changing the ViewParams.  Normally, the internal ViewParams is just
 * a pointer to the given ViewParams object, so calling this function
 * every time one view parameter is changed is not necessary.
 *
 * Note that the `setViewport()` method *must* be called for viewport
 * changes to be picked up by the RenderLayer: `setViewParams()` does
 * not attempt to pickup changes to the `viewport` ViewParams member.
 *
 * @param {ViewParams} vp - The new ViewParams object to use.
 */
RenderLayer.prototype.setViewParams = function(vp) {
  this.vp = vp;
};

/********************************************************************/

/**
 * Cothreaded RayTracer base class.  A raytracer is a per-pixel
 * renderer that maps a pixel on the frontbuffer to the backbuffer
 * using a {@linkcode Projector}.  Render results are sent to the
 * frontbuffer member object named `frontBuf`.
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
 * complete.  This value must be greater than zero (at least one
 * sampling pass is required).  The current multipass progressive
 * oversampling algorithm does not use extended precision for the
 * intermediate samples, so a factor greater than 8 is effectively
 * useless.
 *
 * "blockFactor" (this.blockFactor) -- (optional) This indicates the
 * number of continuous scanlines to raytrace before checking the
 * timeout condition.  Setting this to a larger value can help
 * increase raytracing efficiency by reducing the number of possibly
 * expensive Web API calls per iteration.  If set to -1, then
 * preemption never occurs during rendering.  Default value is 8.
 *
 * @constructor
 *
 * @param {ImageData} backBuf
 * @param {integer} backBufType
 * @param {integer} maxOsaPasses
 */
var RayTracer = function(backBuf, backBufType, maxOsaPasses) {
  /* Note: We must be careful to make sure that the base cothread
     initializations take place.  */
  Cothread.call(this, this.initCtx, this.contExec);

  this.frontBuf = document.createElement("canvas");
  this.vp = gViewParams;
  this.backBuf = backBuf;
  this.backBufType = backBufType;
  this.maxOsaPasses = maxOsaPasses;
  this.blockFactor = 8;

  this.mapToPol = [ NaN, NaN ];
};

OEV.RayTracer = RayTracer;
RayTracer.prototype = new Cothread();
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
 * Set the ViewParams of a RayTracer.
 * @param {ViewParams} vp
 */
RayTracer.prototype.setViewParams = function(vp) {
  this.vp = vp;
};

/**
 * Additional post-processing operations to perform on a pixel before
 * display.  This function should directly modify the destination data
 * at the given destination index to set the color value.
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

  /* Non-function-call handling of equirectangular projection shows no
     significant performance gains with JIT JavaScript runtimes.
     Dynamic function inlining must provide sufficient
     auto-optimization.  */
  /* if (this.vp.projector == EquirectProjector &&
      this.vp.polCenter[1] == 0 && this.vp.polCenter[0] == 0)
    this.fastEqui = true;
  else this.fastEqui = false; */

  /* Precomputed quantities that speed up later calculations, used to
     calculate normalized 2D coordinates in `contExec()'.  */
  var vp = this.vp;
  var inv_aspectXY = 1 / vp.aspectXY;
  var inv_scale = vp.inv_scale;
  this.multX = 2 / this.destImg.width * inv_scale;
  this.multY = -2 / this.destImg.height * inv_aspectXY * inv_scale;
  this.addX = (-1 - vp.mapCenter[0]) * inv_scale;
  this.addY = (1 * inv_aspectXY - vp.mapCenter[1]) * inv_scale;

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
  var vp = this.vp;
  var aspectXY = vp.aspectXY;
  var inv_aspectXY = 1 / aspectXY;
  var mcx = vp.mapCenter[0], mcy = vp.mapCenter[1];
  var inv_scale = vp.inv_scale;
  var projector_unproject = vp.projector.unproject;
  var clip = vp.clip;
  var mapToPol = this.mapToPol;
  // var fastEqui = this.fastEqui;
  var maxOsaPasses = this.maxOsaPasses;
  var blockFactor = this.blockFactor;

  var multX = this.multX;
  var multY = this.multY;
  var addX = this.addX;
  var addY = this.addY;

  var osaFac = 1 / osaPass;
  var inv_osaFac = 1 - osaFac;
  var wrapOver = false;

  var ctnow = Cothread.now;

  var startTime = ctnow();
  var timeout = this.timeout;

  while (osaPass <= maxOsaPasses) {
    while (x < destImg_width) {
      var xj = 0, yj = 0; // X and Y jitter for oversampling
      if (osaPass > 1) {
	xj = 0.5 - Math.random();
	yj = 0.5 - Math.random();
      }

      /* Compute normalized coordinates, applying 2D shift and scale
         factors as necessary.  */
      /* mapToPol[0] = (((x + xj) / destImg_width) * 2 - 1 - mcx) * inv_scale;
      mapToPol[1] = (-(((y + yj) / destImg_height) * 2 - 1) *
		     inv_aspectXY - mcy) * inv_scale; */
      mapToPol[0] = (x + xj) * multX + addX;
      mapToPol[1] = (y + yj) * multY + addY;

      // Unproject.
      /* if (fastEqui)
	{ mapToPol[1] *= 180; mapToPol[0] *= 180; }
      else */ projector_unproject(mapToPol);

      // Clip to the projection boundaries, if specified.
      if (clip && (mapToPol[1] < -90 || mapToPol[1] > 90 ||
		   mapToPol[0] < -180 || mapToPol[0] > 180))
	{ mapToPol[0] = NaN; mapToPol[1] = NaN; }

      /* Shift to the given latitude and longitude, and normalize the
         coordinates at the same time.  */
      polShiftOrigin(mapToPol, -1);

      /* Plot the pixel.  */
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
    x = 0; y++;
    /* if (x >= destImg_width)
      { x = 0; y++; } */
    if (y >= destImg_height) {
      destIdx = 0;
      y = 0;
      osaPass++;
      osaFac = 1 / osaPass;
      inv_osaFac = 1 - osaFac;
      wrapOver = true;
    }
    var atBlockPos;
    switch (blockFactor) {
    case 0: atBlockPos = true; break;
    case -1: atBlockPos = false; break;
    default: atBlockPos = (y % blockFactor == 0); break;
    }
    if (atBlockPos && ctnow() - startTime >= timeout)
      break;
  }

  if (!wrapOver)
    ctx.putImageData(destImg, 0, 0, 0, oldY, destImg_width, y - oldY);
  else
    ctx.putImageData(destImg, 0, 0, 0, 0, destImg_width, destImg_height);

  this.setExitStatus(osaPass <= maxOsaPasses);
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

/********************************************************************/

/**
 * Specialized RayTracer that can only handle TDProjectors, that is,
 * orthographic and perspective projections.  The relevant projection
 * code is hand-lined into this RayTracer.  Oversampling is done in a
 * single pass.  This RayTracer also does not support processing of
 * non-pixel-based backbuffers.
 * @constructor
 */
var TDRayTracer = function(backBuf, backBufType, maxOsaPasses) {
  /* Note: We must be careful to make sure that the base cothread
     initializations take place.  */
  Cothread.call(this, this.initCtx, this.contExec);

  this.frontBuf = document.createElement("canvas");
  this.vp = gViewParams;
  this.backBuf = backBuf;
  this.backBufType = backBufType;
  this.maxOsaPasses = maxOsaPasses;
  this.blockFactor = 8;

  // this.mapToPol = [ NaN, NaN ];
  this.perspProject = false;
};

OEV.TDRayTracer = TDRayTracer;
TDRayTracer.prototype = new RayTracer();
TDRayTracer.prototype.constructor = TDRayTracer;

TDRayTracer.prototype.initCtx = function() {
  var vp = this.vp;
  this.ctx = this.frontBuf.getContext("2d");
  this.destIdx = 0;
  this.x = 0;
  this.y = 0;
  if (vp.projector == PerspProjector)
    this.perspProject = true;
  else this.perspProject = false;

  /* Precomputed quantities that speed up later calculations, used to
     calculate normalized 2D coordinates in `contExec()'.  */
  var inv_aspectXY = 1 / vp.aspectXY;
  var inv_scale = vp.inv_scale;
  this.multX = 2 / this.destImg.width * inv_scale;
  this.multY = 2 / this.destImg.height * inv_aspectXY * inv_scale;
  this.addX = (-1 - vp.mapCenter[0]) * inv_scale;
  this.addY = (-1 * inv_aspectXY - vp.mapCenter[1]) * inv_scale;

  this.status.returnType = CothreadStatus.PREEMPTED;
  this.status.preemptCode = 0;
  this.status.percent = 0;
};

TDRayTracer.prototype.contExec = function() {
  var ctx = this.ctx;
  var destImg = this.destImg;
  /* createImageData can sometimes be faster than reusing an ImageData
     object...  */
  /* var destImg = ctx.createImageData(this.frontBuf.width,
				    this.frontBuf.height); */
  var destIdx = this.destIdx;
  var x = this.x;
  var y = this.y;
  var oldY = y;

  var backBuf_width = this.backBuf.width;
  var backBuf_height = this.backBuf.height;
  var backBuf_height_1 = backBuf_height - 1;
  var backBuf_data = this.backBuf.data;
  var destImg_width = destImg.width;
  var destImg_height = destImg.height;
  var destImg_data = destImg.data;
  var vp = this.vp;
  var aspectXY = vp.aspectXY;
  var inv_aspectXY = 1 / aspectXY;
  var mcx = vp.mapCenter[0], mcy = vp.mapCenter[1];
  var inv_scale = vp.inv_scale;
  var perspProject = this.perspProject;
  var latCenter = vp.polCenter[1];
  var lonCenter = vp.polCenter[0];
  // var mapToPol = this.mapToPol;
  var maxOsaPasses = this.maxOsaPasses;
  var blockFactor = this.blockFactor;

  var multX = this.multX;
  var multY = this.multY;
  var addX = this.addX;
  var addY = this.addY;

  var ctnow = Cothread.now;

  var startTime = ctnow();
  var timeout = this.timeout;

  while (y < destImg_height) {
    while (x < destImg_width) {
      // Pixel from combined OSA samples:
      var os_r = 0, os_g = 0, os_b = 0, os_a = 0;
      for (var osaPass = 0; osaPass < maxOsaPasses; osaPass++) {
	var xj = 0, yj = 0; // X and Y jitter for oversampling
	if (osaPass > 0) {
	  xj = 0.5 - Math.random();
	  yj = 0.5 - Math.random();
	}

	/* Compute normalized coordinates, applying 2D shift and scale
	   factors as necessary.  */
	/* The additional negative on `y_pix' is because we compute
	   upside down, then reference the back buffer upside down,
	   thus creating a double negative and the correct result.  */
        /* var x_pix = (((x + xj) / destImg_width) * 2 - 1 - mcx) * inv_scale;
        var y_pix = (- -(((y + yj) / destImg_height) * 2 - 1) *
		     inv_aspectXY - mcy) * inv_scale; */
	var x_pix = (x + xj) * multX + addX;
	var y_pix = (y + yj) * multY + addY;

	/* Perform embedded unprojection and tilt transformation.  */
	/* mapToPol[0] = x_pix; mapToPol[1] = y_pix;
	   if (!perspProject) OrthoTDProjector.unproject(mapToPol);
	   else PerspTDProjector.unproject(mapToPol);
	   var latitude = mapToPol[1], longitude = mapToPol[0]; */

	/* 1. Get the 3D rectangular coordinate of the ray
	   intersection with the sphere.  The camera is looking down
	   the negative z axis.  */
	// Point3D r3src { x, y, z } -> exploded ->
	var r3src_x, r3src_y, r3src_z;

	if (!perspProject) { // Orthographic projection
	  r3src_x = x_pix;
	  r3src_y = y_pix;
	  r3src_z = Math.sin(Math.acos(Math.sqrt(Math.pow(r3src_x, 2) +
						 Math.pow(r3src_y, 2))));
	  if (isNaN(r3src_z))
	    continue;
	} else { // Perspective projection
	  // r must be one: this simplifies the calculations
	  var r = 1; // 6371; // radius of the earth in kilometers
	  var d = vp.perspAltitude / 6371; // altitude in kilometers
	  // focal length in units of the screen dimensions
	  var f = 1 / Math.tan(DEG2RAD * vp.perspFOV / 2);
	  // var x_pix = x_pix;
	  // var y_pix = y_pix;

	  var w = (Math.pow(x_pix, 2) + Math.pow(y_pix, 2)) / Math.pow(f, 2);

	  var a = 1 + w;
	  var b = -2 * w * (r + d);
	  var c = w * Math.pow(r + d, 2) - 1 /* 1 == Math.pow(r, 2) */;

	  r3src_z = (-b + Math.sqrt(Math.pow(b, 2) - 4 * a * c)) / (2 * a);
	  if (isNaN(r3src_z))
	    continue;
	  r3src_x = x_pix / f * (-r3src_z + (r + d)) /* / r */;
	  r3src_y = y_pix / f * (-r3src_z + (r + d)) /* / r */;
	}

	/* 2. Inverse rotate this coordinate around the x axis by the
	   current globe tilt.  */
	var tilt = DEG2RAD * latCenter;
	var cos_tilt = Math.cos(tilt); var sin_tilt = Math.sin(tilt);
	// Point3D r3src { x, y, z } -> exploded ->
	var r3dest_x, r3dest_y, r3dest_z;
	r3dest_x = r3src_x;
	r3dest_y = r3src_y * cos_tilt - r3src_z * sin_tilt;
	r3dest_z = r3src_y * sin_tilt + r3src_z * cos_tilt;

	/* 3. Measure the latitude and longitude of this coordinate.  */
	var latitude = RAD2DEG * Math.asin(r3dest_y) + 90;
	var longitude = RAD2DEG * Math.atan2(r3dest_x, r3dest_z);

	/* 4. Shift by the longitudinal rotation around the pole.  For
	   the sake of the normalization calculation below, move the
	   prime meridian to 180 degrees.  */
	longitude += 180 + lonCenter;

	/* 5. Verify that the coordinates are in bounds.  */
	if (latitude < 0) latitude = 0;
	if (latitude > 180) latitude = 180;
	longitude += (longitude < 0) * 360;
	longitude = longitude % 360.0;

	/* Plot the pixel.  */
	var latIdx = 0|(latitude * inv_180 * backBuf_height_1);
	var lonIdx = 0|(longitude * inv_360 * backBuf_width);
	var backBufIdx = (latIdx * backBuf_width + lonIdx) * 4;
	os_r += backBuf_data[backBufIdx+0];
	os_g += backBuf_data[backBufIdx+1];
	os_b += backBuf_data[backBufIdx+2];
	os_a += backBuf_data[backBufIdx+3];
      }
      if (maxOsaPasses > 1) {
	os_r = 0|(os_r / maxOsaPasses);
	os_g = 0|(os_g / maxOsaPasses);
	os_b = 0|(os_b / maxOsaPasses);
	os_a = 0|(os_a / maxOsaPasses);
      }
      destImg_data[destIdx+0] = os_r;
      destImg_data[destIdx+1] = os_g;
      destImg_data[destIdx+2] = os_b;
      destImg_data[destIdx+3] = os_a;
      destIdx += 4;
      x++;
      /* if (ctnow() - startTime >= timeout)
	 break; */
    }
    if (x >= destImg_width)
      { x = 0; y++; }
    var atBlockPos;
    switch (blockFactor) {
    case 0: atBlockPos = true; break;
    case -1: atBlockPos = false; break;
    default: atBlockPos = (y % blockFactor == 0); break;
    }
    if (atBlockPos && ctnow() - startTime >= timeout)
      break;
  }

  ctx.putImageData(destImg, 0, 0, 0, oldY, destImg_width, y - oldY);

  this.setExitStatus(y < destImg_height);
  this.status.preemptCode = RenderLayer.RENDERING;
  this.status.percent = y * CothreadStatus.MAX_PERCENT / destImg_height;

  this.destIdx = destIdx;
  this.x = x;
  this.y = y;
  return this.status;
};

/********************************************************************/

/**
 * Generic specialized RenderLayer for equirectangular backbuffers:
 * Copies the backbuffer to the frontbuffer with tiling.  You will
 * need to provide implementations for `initCtx()' and `loadData()' in
 * a derived class or object.  `loadData()' should initialize a member
 * named `backBuf' within itself.  This is used to initialize
 * `this.backBuf' in this object.
 *
 * Base class: {@linkcode RenderLayer}
 *
 * Parameters:
 *
 * "fixLat" (this.fixLat) -- This one is a bit hard to explain, so
 * read carefully.  Suppose you have an equirectangular backbuffer
 * that is 5 pixels high, and those 5 pixels are specified to evenly
 * cover the range -90 to 90 degrees latitude, inclusive.  Thus, the
 * latitude values of each coordinate are [ -90, -45, 0, 45, 90 ].
 * Now suppose the *reference* point for these coordinates is the
 * *top* edge of the respective pixel.  If the image height is
 * measured from the *top* edge of the *top* pixel to the *bottom*
 * edge of the *bottom* pixel, then the map is presumed to have a
 * height of 225 degrees latitude, which is incorrect.  If this option
 * is set to `true`, then the positioning algorithms are modified to
 * provide compensation for this measurement style.  Otherwise, the
 * distance from the top edge of the top pixel to the bottom edge of
 * the bottom pixel is assumed to be exactly 180 degrees latitude.
 * @constructor
 */
var EquiRenderLayer = function() {
  /* Note: We must be careful to make sure that the base cothread
     initializations take place.  */
  Cothread.call(this, this.initCtx, this.contExec);

  this.frontBuf = document.createElement("canvas");
  this.backBuf = null;
};

OEV.EquiRenderLayer = EquiRenderLayer;
EquiRenderLayer.prototype = new RenderLayer();
EquiRenderLayer.prototype.constructor = EquiRenderLayer;

/**
 * Example `initCtx()' implementation.  Currently, it doesn't do
 * anything useful.
 */
EquiRenderLayer.prototype.initCtx = function() {
  /* Check if data needs to be loaded here.  */

  this.status.returnType = CothreadStatus.PREEMPTED;
  this.status.preemptCode = 0;
  this.status.percent = 0;
};

EquiRenderLayer.prototype.contExec = function() {
  // Load the back buffer if it has not yet been loaded.
  if (this.loadData.status.returnType != CothreadStatus.FINISHED) {
    var status = this.loadData.continueCT();
    this.status.returnType = CothreadStatus.PREEMPTED;
    this.status.preemptCode = status.preemptCode;
    this.status.percent = status.percent;
    if (status.returnType == CothreadStatus.FINISHED) {
      if (this.loadData.retVal == 200 ||
	  this.loadData.retVal == ImageLoader.SUCCESS) {
	if (this.loadData.backBuf) {
	  this.backBuf = this.loadData.backBuf;
	  this.loadData.backBuf = null;
	}
	this.retVal = 0;
      } else {
	this.status.returnType = CothreadStatus.FINISHED;
	this.retVal = RenderLayer.LOAD_ERROR;
	return this.status;
      }
    } else return this.status;
  }

  // Otherwise, render.
  return this.render();
};

EquiRenderLayer.prototype.render = function() {
  var ctx = this.frontBuf.getContext("2d");
  var vp = this.vp;
  ctx.clearRect(0, 0, this.frontBuf.width, this.frontBuf.height);

  /* This loop allows for tile rendering a left and right copy of the
     SSH image.  */
  for (var i = 0; i < 3; i++) {
    /* Convert the map center from relative coordinates to the
       coordinate space of the destination canvas.  */
    var fbwidth = this.frontBuf.width;
    var fbheight = this.frontBuf.height;
    var x = ((vp.mapCenter[0] + 1) / 2 +
	     -vp.polCenter[0] * vp.scale / 360) * fbwidth;
    var y = (-vp.mapCenter[1] * vp.aspectXY + 1) / 2 *
      fbheight;

    /* Find the coordinates on the destination canvas where the left,
       top, right, and bottom edges of the image lie.  */
    var width = fbwidth * vp.scale;
    var height = fbheight * vp.scale * vp.aspectXY / 2;
    if (this.fixLat) {
      var fix = height / this.backBuf.height;
      height += 1 * fix; y += 0.5 * fix;
    }
    if (i == 1) x -= width;
    if (i == 2) x += width;
    var left = x - width / 2;
    var top = y - height / 2;
    var right = x + width / 2;
    var bottom = y + height / 2;

    /* Skip rendering entirely if the image is invisible.  */
    if (left < fbwidth && top < fbheight && right >= 0 && bottom >= 0) {
      /* Compute any necessary clipping on the source image.
	 (Clipping could actually be skipped entirely, since the
	 underlying canvas implementation will clip as necessary, but
	 the clipping code is included here for robustness.)  */
      var bbwidth = this.backBuf.width;
      var bbheight = this.backBuf.height;
      var srcleft, srctop, srcright, srcbottom;
      if (left < 0) {
	srcleft = -left / width * bbwidth;
	left = 0;
      } else srcleft = 0;
      if (top < 0) {
	srctop = -top / height * bbheight;
	top = 0;
      } else srctop = 0;
      if (right > fbwidth) {
	srcright = bbwidth + (fbwidth - right) / width * bbwidth;
	right = fbwidth;
      } else srcright = bbwidth;
      if (bottom > fbheight) {
	srcbottom = bbheight + (fbheight - bottom) / height * bbheight;
	bottom = fbheight;
      } else srcbottom = bbheight;

      var realWidth = right - left, realHeight = bottom - top;
      if (realWidth > 0 && realHeight > 0)
	ctx.drawImage(this.backBuf,
		      srcleft, srctop,
		      srcright - srcleft, srcbottom - srctop,
		      left, top, realWidth, realHeight);
    }
  }

  this.status.returnType = CothreadStatus.FINISHED;
  this.status.preemptCode = RenderLayer.RENDERING;
  this.status.percent = CothreadStatus.MAX_PERCENT;
  return this.status;
};

/********************************************************************/

/**
 * Generic specialized CSS rendering routine for equirectangular
 * backbuffers: Uses CSS to position the backbuffer as an HTML element
 * within a "frontbuffer" container element.  You will
 * need to provide implementations for `initCtx()' and `loadData()' in
 * a derived class or object.  `loadData()' should initialize a member
 * named `backBuf' within itself.  This is used to initialize
 * `this.backBuf' in this object.
 *
 * This rendering routine still has a few off-by-one-pixel problems.
 *
 * Base class: {@linkcode RenderLayer}
 *
 * Parameters:
 *
 * "fixLat" (this.fixLat) -- This one is a bit hard to explain, so
 * read carefully.  Suppose you have an equirectangular backbuffer
 * that is 5 pixels high, and those 5 pixels are specified to evenly
 * cover the range -90 to 90 degrees latitude, inclusive.  Thus, the
 * latitude values of each coordinate are [ -90, -45, 0, 45, 90 ].
 * Now suppose the *reference* point for these coordinates is the
 * *top* edge of the respective pixel.  If the image height is
 * measured from the *top* edge of the *top* pixel to the *bottom*
 * edge of the *bottom* pixel, then the map is presumed to have a
 * height of 225 degrees latitude, which is incorrect.  If this option
 * is set to `true`, then the positioning algorithms are modified to
 * provide compensation for this measurement style.  Otherwise, the
 * distance from the top edge of the top pixel to the bottom edge of
 * the bottom pixel is assumed to be exactly 180 degrees latitude.
 * @constructor
 */
var EquiCSSRenderLayer = function() {
  /* Note: We must be careful to make sure that the base cothread
     initializations take place.  */
  Cothread.call(this, this.initCtx, this.contExec);

  this.frontBuf = document.createElement("div");
  this.frontBuf.appendChild(document.createElement("div"));
  this.backBuf = null;
};

OEV.EquiCSSRenderLayer = EquiCSSRenderLayer;
EquiCSSRenderLayer.prototype = new RenderLayer();
EquiCSSRenderLayer.prototype.constructor = EquiCSSRenderLayer;

EquiCSSRenderLayer.prototype.setViewport = function(width, height) {
  var inner = this.frontBuf.firstChild;
  var fbstyle = this.frontBuf.style;
  fbstyle.width = width + "px";
  fbstyle.height = height + "px";
  var cssText = "";
  /* NOTE: You must have the "ie-inline-block" class defined in your
     HTML for this to work.  */
  var className = document.getElementById("topBody").className;
  if (className == "ie6" || className =="ie7")
    inner.className = "ie-inline-block";
  else cssText = "display: inline-block; ";
  cssText += "position: relative; width: " + width +
    "px; height: " + height + "px; overflow: hidden";
  inner.style.cssText = cssText;
};

/**
 * Example `initCtx()' implementation.  Currently, it doesn't do
 * anything useful.
 */
EquiCSSRenderLayer.prototype.initCtx = function() {
  /* Check if data needs to be loaded here.  */

  this.status.returnType = CothreadStatus.PREEMPTED;
  this.status.preemptCode = 0;
  this.status.percent = 0;
};

EquiCSSRenderLayer.prototype.contExec = function() {
  // Load the back buffer if it has not yet been loaded.
  if (this.loadData.status.returnType != CothreadStatus.FINISHED) {
    var status = this.loadData.continueCT();
    this.status.returnType = CothreadStatus.PREEMPTED;
    this.status.preemptCode = status.preemptCode;
    this.status.percent = status.percent;
    if (status.returnType == CothreadStatus.FINISHED) {
      if (this.loadData.retVal == 200 ||
	  this.loadData.retVal == ImageLoader.SUCCESS) {
	if (this.loadData.backBuf) {
	  this.backBuf = this.loadData.backBuf;
	  this.loadData.backBuf = null;
	}
	var inner = this.frontBuf.firstChild;
	if (inner.hasChildNodes())
	  inner.removeChild(inner.firstChild);
	inner.appendChild(this.backBuf);
	this.retVal = 0;
      } else {
	this.status.returnType = CothreadStatus.FINISHED;
	this.retVal = RenderLayer.LOAD_ERROR;
	return this.status;
      }
    } else return this.status;
  }

  // Otherwise, render.
  return this.render();
};

EquiCSSRenderLayer.prototype.render = function() {
  /* Convert the map center from relative coordinates to the
     coordinate space of the destination canvas.  */
  var vp = this.vp;
  var fbwidth = vp.viewport[0];
  var fbheight = vp.viewport[1];
  var x = ((vp.mapCenter[0] + 1) / 2 +
	   -vp.polCenter[0] * vp.scale / 360) * fbwidth;
  var y = (-vp.mapCenter[1] * vp.aspectXY + 1) / 2 *
    fbheight;

  /* Find the coordinates on the destination canvas where the left,
     top, right, and bottom edges of the image lie.  */
  var width = fbwidth * vp.scale;
  var height = fbheight * vp.scale * vp.aspectXY / 2;
  if (this.fixLat && this.backBuf.naturalHeight) {
    var fix = height / this.backBuf.naturalHeight;
    height += 1 * fix; y += 0.5 * fix;
  }
  var left = x - width / 2;
  var top = y - height / 2;
  var right = x + width / 2;
  var bottom = y + height / 2;

  this.backBuf.style.cssText =
    "position: absolute; left: " + left + "px; top: " + top + "px";
  this.backBuf.width = width;
  this.backBuf.height = height;

  this.status.returnType = CothreadStatus.FINISHED;
  this.status.preemptCode = RenderLayer.RENDERING;
  this.status.percent = CothreadStatus.MAX_PERCENT;
  return this.status;
};
