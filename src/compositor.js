/* Composite rendering of 2D RenderLayers, either as a 2D map or
   through a 3D raytrace renderer.  Also contains main loop and hooks
   to integrate with the GUI, if available.  */

import "oevns";
import "compat";
import "oevmath";
import "projector";
import "viewparams";
import "cothread";
import "dates";
import "earthtexlayer";
import "trackslayer";
import "sshlayer";

var Compositor = {};
OEV.Compositor = Compositor;

// Important parameters:

/** Density of the graticule lines in degrees per line.  */
Compositor.gratDensity = 15;

/** Boolean indicating whether the EarthTexLayer is visible or not.  */
Compositor.landMassVis = true;

/** Boolean indicating whether the SSHLayer is visible or not.  */
Compositor.sshVisible = true;

/** Playback speed in frames per second.  */
Compositor.playSpeed = 2;

/** Event handler that gets called once the Compositor is fully
    loaded.  */
Compositor.onloaded = function() {};

/** Event handler that gets called when the current date is changed
    during playback.  */
Compositor.ondatechange = function() {};

/** Event handler that gets called once playback is forced to stop at
    the end of the data.  */
Compositor.onstop = function() {};

// Internal fields:
// FIXME: These are still kind of ad-hoc.

Compositor.drawingContainer = null;
Compositor.noDouble = false;
Compositor.renderInProg = false;
Compositor.renderPart = 0;
Compositor.stopSignal = false;
Compositor.playMode = false;
Compositor.frameStart = 0;
Compositor.renderStart = 0;
Compositor.datesProg = null;
Compositor.earthTexProg = null;
Compositor.sshProg = null;
Compositor.tracksProg = null;

/** Perform startup initialization for the whole web viewer.  */
Compositor.init = function() {
  // Add all the RenderLayers to the GUI containment.
  /* NOTE: EarthTexLayer was originally the bottom-most layer.  Since
     the SSH and land masses aren't exactly complementary, having the
     SSHLayer on top guarantees that all SSH samples are visible.  */
  this.drawingContainer = document.getElementById("drawingContainer");
  SSHLayer.frontBuf.className = "renderLayer";
  this.drawingContainer.appendChild(SSHLayer.frontBuf);
  EarthTexLayer.frontBuf.className = "renderLayer";
  this.drawingContainer.appendChild(EarthTexLayer.frontBuf);
  TracksLayer.frontBuf.className = "renderLayer";
  this.drawingContainer.appendChild(TracksLayer.frontBuf);

  this.fitViewportToCntr();
  gViewParams.projector = EquirectProjector;
  this.optiRenderImp();

  EarthTexLayer.frontBuf.style.cssText = "visibility: hidden";
  SSHLayer.frontBuf.style.cssText = "visibility: hidden";
  TracksLayer.frontBuf.style.cssText = "visibility: hidden";

  this.noDouble = false;

  /* Preload the required data so that the GUI can indicate these
     steps are in progress.  */
  /* NOTE: Right now, the loading loop does not use I/O notification
     since that can be slow.  This is a great place where feature
     detection would help.  However, such feature detection would be
     very difficult to assess, perhaps not even practical.  */
  // var finishWrapper = makeEventWrapper(Compositor, "finishStartup");
  Dates.timeout = 15;
  // Dates.notifyFunc = finishWrapper;
  SSHLayer.loadData.timeout = 15;
  // SSHLayer.loadData.notifyFunc = finishWrapper;
  TracksLayer.loadData.timeout = 15;
  // TracksLayer.loadData.notifyFunc = finishWrapper;
  TracksLayer.loadData.listenOnProgress = true;
  // TracksLayer.loadData.notifyProgress = true;

  Dates.initCtx();
  EarthTexData.initLoad(15, null /* finishWrapper */);
  SSHLayer.loadData.initCtx();
  TracksLayer.loadData.initCtx();

  /* Setup the loading screen.  */
  var loadingScreen = document.getElementById("loadingScreen");
  this.datesProg = document.createTextNode("Date indexes: 0%");
  loadingScreen.appendChild(this.datesProg);
  loadingScreen.appendChild(document.createElement("br"));
  this.earthTexProg = document.createTextNode("Earth texture: 0%");
  loadingScreen.appendChild(this.earthTexProg);
  loadingScreen.appendChild(document.createElement("br"));
  this.sshProg = document.createTextNode("SSH preload data: 0%");
  loadingScreen.appendChild(this.sshProg);
  loadingScreen.appendChild(document.createElement("br"));
  this.tracksProg = document.createTextNode("Tracks data: 0%");
  loadingScreen.appendChild(this.tracksProg);
  loadingScreen.appendChild(document.createElement("br"));

  return this.finishStartup();
};

Compositor.finishStartup = function() {
  var datesStatus = Dates.continueCT();
  var earthTexStatus = EarthTexData.loadData.continueCT();
  var sshStatus = SSHLayer.loadData.continueCT();
  var tracksStatus = TracksLayer.loadData.continueCT();

  this.datesProg.nodeValue = "Date indexes: " +
    (datesStatus.percent * 100 /
     CothreadStatus.MAX_PERCENT).toFixed(0) + "%";
  this.earthTexProg.nodeValue = "Earth texture: " +
    (earthTexStatus.percent * 100 /
     CothreadStatus.MAX_PERCENT).toFixed(0) + "%";
  this.sshProg.nodeValue = "SSH preload data: " +
    (sshStatus.percent * 100 /
     CothreadStatus.MAX_PERCENT).toFixed(0) + "%";
  this.tracksProg.nodeValue = "Tracks data: " +
    (tracksStatus.percent * 100 /
     CothreadStatus.MAX_PERCENT).toFixed(0) + "%";

  if (datesStatus.returnType != CothreadStatus.FINISHED ||
      earthTexStatus.returnType != CothreadStatus.FINISHED ||
      sshStatus.returnType != CothreadStatus.FINISHED ||
      tracksStatus.returnType != CothreadStatus.FINISHED) {
    /* If our progress meters don't send notifications, then we don't
       return on IOWAIT.  Progress meters that send notifications can
       be slow.  Then again, using progress meters at all is slower
       than no progress meters.  */
    /* if (datesStatus.preemptCode == CothreadStatus.IOWAIT ||
	earthTexStatus.preemptCode == CothreadStatus.IOWAIT ||
	sshStatus.preemptCode == CothreadStatus.IOWAIT ||
	tracksStatus.preemptCode == CothreadStatus.IOWAIT)
      return; */
    return window.setTimeout(
	makeEventWrapper(Compositor, "finishStartup"), 2000);
  }

  /* Prevent final initialization from being run twice.  (This is now
     impossible in the current codebase, due to elimination of I/O
     notification.  The old code was buggy, though: it should have
     guaranteed that only one loading loop was active.)  */
  if (Compositor.noDouble)
    return;
  Compositor.noDouble = true;

  /* Connect the front buffers to the GUI now that loading is
     finished.  */
  var loadingScreen = document.getElementById("loadingScreen");
  if (loadingScreen)
    loadingScreen.style.cssText = "visibility: hidden";

  EarthTexLayer.frontBuf.style.cssText = "";
  SSHLayer.frontBuf.style.cssText = "";
  TracksLayer.frontBuf.style.cssText = "";

  this.onloaded();

  /* Now that all the necessary startup data is loaded, we should
     proceed to rendering the first frame.  */
  /* FIXME: The render loop hasn't been designed to suspend and resume
     jobs on IOWAIT.  Sorry.  */
  // var renderWrapper = makeEventWrapper(Compositor, "finishRenderJobs");
  EarthTexLayer.timeout = 15;
  // EarthTexLayer.notifyFunc = renderWrapper;
  SSHLayer.timeout = 15;
  // SSHLayer.notifyFunc = renderWrapper;
  TracksLayer.timeout = 15;
  // TracksLayer.notifyFunc = renderWrapper;
  return this.startRender();
};

/**
 * Reset RenderLayers to their start condition and start a render loop
 * if there isn't one already running.
 * @param {Array} layers - (optional) An array of RenderLayers that
 * indicates which layers should be reset to their start condition.
 * If this parameter is not given, then all layers are reset to their
 * start condition.
 */
Compositor.startRender = function(layers) {
  if (!layers) {
    // If layer is visible, render it.
    if (!EarthTexLayer.frontBuf.style.visibility)
      EarthTexLayer.initCtx();
    if (!SSHLayer.frontBuf.style.visibility)
      SSHLayer.initCtx();
    if (!TracksLayer.frontBuf.style.visibility)
      TracksLayer.initCtx();
  } else {
    for (var i = 0, len = layers.length; i < len; i++) {
      // If layer is visible, render it.
      if (!layers[i].frontBuf.style.visibility)
	layers[i].initCtx();
    }
  }
  if (!this.renderInProg) {
    this.renderPart = 0;
    this.renderStart = this.frameStart = Cothread.now();
    return this.finishRenderJobs();
  }
};

/** If there is not a currently running render loop, start one.  */
Compositor.startRenderLoop = function() {
  if (!this.renderInProg) {
    this.renderPart = 0;
    return this.finishRenderJobs();
  }
};

/** Wrapper function for starting rendering during animation.  This
    function is for internal use only.  */
Compositor.startRenderAnim = function() {
  this.renderStart = Cothread.now();
  if (!SSHLayer.frontBuf.style.visibility)
    SSHLayer.initCtx();
  if (!TracksLayer.frontBuf.style.visibility)
    TracksLayer.initCtx();
  return this.finishRenderJobs();
};

/**
 * Finish any render jobs that may be pending from TracksLayer or
 * SSHLayer.
 */
Compositor.finishRenderJobs = function() {
  var earthTexStatus = EarthTexLayer.status;
  var sshStatus = SSHLayer.status;
  var tracksStatus = TracksLayer.status;
  this.renderInProg = true;

  if (this.fitViewportToCntr()) {
    EarthTexLayer.initCtx();
    SSHLayer.initCtx();
    TracksLayer.initCtx();
  }

  var ctnow = Cothread.now;
  var startTime = ctnow();
  var timeout = 15;

  switch (this.renderPart) {
  case 0:
    this.renderPart = 1;
    if (earthTexStatus.returnType != CothreadStatus.FINISHED) {
      earthTexStatus = EarthTexLayer.continueCT();
      if (ctnow() - startTime >= timeout) break;
    }
  case 1:
    this.renderPart = 2;
    if (sshStatus.returnType != CothreadStatus.FINISHED) {
      sshStatus = SSHLayer.continueCT();
      if (ctnow() - startTime >= timeout) break;
    }
  case 2:
    this.renderPart = 0;
    if (tracksStatus.returnType != CothreadStatus.FINISHED) {
      tracksStatus = TracksLayer.continueCT();
      if (ctnow() - startTime >= timeout) break;
    }
  }

  if (this.stopSignal) {
    this.renderInProg = false;
    this.stopSignal = false;
    if (this.playMode) {
      this.playMode = false;
      this.onstop();
    }
  } else if (earthTexStatus.returnType != CothreadStatus.FINISHED ||
	     sshStatus.returnType != CothreadStatus.FINISHED ||
	     tracksStatus.returnType != CothreadStatus.FINISHED)
    return requestAnimationFrame(
		    makeEventWrapper(Compositor, "finishRenderJobs"));
  else if (earthTexStatus.returnType == CothreadStatus.FINISHED &&
	   sshStatus.returnType == CothreadStatus.FINISHED &&
	   tracksStatus.returnType == CothreadStatus.FINISHED &&
	   this.playMode) {
    if ((this.playSpeed > 0 && Dates.curDate >= Dates.dateList.length - 1) ||
	(this.playSpeed < 0 && Dates.curDate <= 0)) {
      this.playMode = false;
      this.renderInProg = false;
      this.onstop();
      return;
    }

    // Dates.curDate++; // Simpler, but only runs at one speed.

    var frameElap = 1000 / this.playSpeed;
    var curTime = ctnow();
    var nextTime = Math.abs(frameElap) - (curTime - this.renderStart);
    var numFrames = 0|((curTime - this.frameStart) / 1000 * this.playSpeed);
    this.frameStart += numFrames * frameElap;
    Dates.curDate += numFrames;
    if (Dates.curDate < 0) Dates.curDate = 0;
    if (Dates.curDate > Dates.dateList.length - 1)
      Dates.curDate = Dates.dateList.length - 1;
    this.ondatechange();

    this.renderPart = 0;
    /* if (!SSHLayer.frontBuf.style.visibility)
      SSHLayer.initCtx();
    if (!TracksLayer.frontBuf.style.visibility)
      TracksLayer.initCtx();
    return requestAnimationFrame(
                    makeEventWrapper(Compositor, "finishRenderJobs")); */
    if (Math.abs(this.playSpeed) >= 30 || nextTime <= 0)
      return requestAnimationFrame(
	         makeEventWrapper(Compositor, "startRenderAnim"));
    else
      return window.setTimeout(
                 makeEventWrapper(Compositor, "startRenderAnim"),
		 nextTime);
  } else {
    this.renderInProg = false;
  }
};

/** If a render loop is in progress, force it to halt.  */
Compositor.halt = function() {
  this.stopSignal = true;
};

/** Change the viewport in a safe way for all RenderLayers.  */
Compositor.setViewport = function(width, height) {
  gViewParams.viewport[0] = width;
  gViewParams.viewport[1] = height;
  gViewParams.aspectXY = width / height;
  EarthTexLayer.setViewport(width, height);
  SSHLayer.setViewport(width, height);
  TracksLayer.setViewport(width, height);
};

/**
 * Resize the viewports of the RenderLayers to fit the CSS allocated
 * space.  Returns `true` if the viewport size was changed, `false`
 * otherwise.
 *
 * NOTE: Because modern browsers do not provide an event that fires if
 * the width or height of a CSS element has changed, this function
 * must be called every time the screen is updated via one of the
 * render() functions.
 */
Compositor.fitViewportToCntr = function() {
  // Warning: clientWidth and clientHeight marked as unstable in MDN.
  if (gViewParams.viewport[0] == this.drawingContainer.clientWidth &&
      gViewParams.viewport[1] == this.drawingContainer.clientHeight)
    return false;
  this.setViewport(this.drawingContainer.clientWidth,
		   this.drawingContainer.clientHeight);
  // window.innerWidth, window.innerHeight
  return true;
};

/**
 * Show the SSHLayer if the given parameter is `true`, hide it if it
 *  is `false`.
 * @param show
 */
Compositor.dispSSH = function(show) {
  if (show) {
    this.sshVisible = true;
    SSHLayer.frontBuf.style.visibility = "";
  } else {
    this.sshVisible = false;
    SSHLayer.frontBuf.style.visibility = "hidden";
  }
};

/**
 * Show the EarthTexLayer if the given parameter is `true`, hide it if
 *  it is `false`.
 * @param show
 */
Compositor.dispLandMasses = function(show) {
  if (show) {
    this.landMassVis = true;
    EarthTexLayer.frontBuf.style.visibility = "";
  } else {
    this.landMassVis = false;
    EarthTexLayer.frontBuf.style.visibility = "hidden";
  }
};

/**
 * Switch which RenderLayer implementation is contained within the
 * GUI.
 * @param {String} absName - The abstract name of the RenderLayer to
 * switch, as a string.
 * @param {String} impName - The name of the new RenderLayer
 * implementation to use, as a string.
 */
Compositor.switchRenderLayer = function(absName, impName) {
  var absObj = eval(absName);
  var impObj = eval(impName);
  impObj.frontBuf.className = "renderLayer";
  impObj.frontBuf.style.cssText = absObj.frontBuf.style.cssText;
  this.drawingContainer.replaceChild(impObj.frontBuf, absObj.frontBuf);
  if (gViewParams.viewport[0] != impObj.frontBuf.width ||
      gViewParams.viewport[1] != impObj.frontBuf.height)
    impObj.setViewport(gViewParams.viewport[0], gViewParams.viewport[1]);
  var setAbsVars =
    [ "OEV.", absName, " = ", absName, " = ", impName ].join("");
  eval(setAbsVars);
};

/**
 * Analyze the current rendering parameters and for each RenderLayer,
 * choose the most optimal implementation.
 */
Compositor.optiRenderImp = function() {
  if (gViewParams.projector == EquirectProjector &&
      gViewParams.polCenter[1] == 0) {
    this.switchRenderLayer("EarthTexLayer", "EquiEarthTexLayer");
    if (SSHParams.shadeStyle == 0 &&
	SSHParams.shadeBase == 0 &&
	SSHParams.shadeScale == 4) {
      this.switchRenderLayer("SSHLayer", "EquiGraySSHLayer");
    } else {
      this.switchRenderLayer("SSHLayer", "GenSSHLayer");
    }
  } else {
    this.switchRenderLayer("EarthTexLayer", "GenEarthTexLayer");
    this.switchRenderLayer("SSHLayer", "GenSSHLayer");
  }
};

/**
 * Choose between having the EarthTexLayer as the bottom-most layer or
 * not.
 * @param {Boolean} bottom - If `true`, then the EarthTexLayer is the
 * bottom-most layer.  Otherwise, it is set on top of SSHLayer.
 */
Compositor.bottomEarthTex = function(bottom) {
  if (bottom)
    this.drawingContainer.insertBefore(EarthTexLayer.frontBuf,
				       SSHLayer.frontBuf);
  else
    this.drawingContainer.insertBefore(EarthTexLayer.frontBuf,
				       TracksLayer.frontBuf);
};

/**
 * Assuming the user wants the most optimal equirectangular projection
 * experience, switch between whether gViewParams.mapCenter[1] or
 * gViewParams.polCenter[1] is used to position the center of the
 * screen at the correct latitude.
 * @param {Projector} newProj - The new projection to use.
 * `gViewParams.projector` will be set automatically.
 */
Compositor.switchYPan = function(newProj) {
  if (gViewParams.projector != EquirectProjector &&
      newProj == EquirectProjector) {
    gViewParams.mapCenter[1] =
      -gViewParams.polCenter[1] / 180 * gViewParams.scale;
    gViewParams.polCenter[1] = 0;
  } else if (gViewParams.projector == EquirectProjector) {
    gViewParams.polCenter[1] =
      -gViewParams.mapCenter[1] * 180 / gViewParams.scale;
    gViewParams.mapCenter[1] = 0;
  }
  gViewParams.projector = newProj;
};

// -------------------------------------------------------------------

// TODO: This function should be a tile-based rendering engine that
// gets called from a callback to complete the render.  In general,
// JavaScript cannot support threads.

/* Perform one of the 3D raytracing rendering processes to display the
   backbuffer on the frontbuffer.  */
Compositor.show3dComposite = function() {
  // FIXME
  var osa_factor = 1;
  var inv_osa_factor = 1;
  var backbufCtx = this.backbuf.getContext("2d");
  var src_data = backbufCtx.getImageData(0, 0, this.backbuf.width,
					 this.backbuf.height);

  var ctx = this.canvas.getContext("2d");
  var dest_data = ctx.createImageData(this.canvas.width, this.canvas.height);
  var dest_index = 0;
  var y_center = dest_data.height / 2;
  var x_center = dest_data.width / 2;
  var disp_scale = 1;
  if (this.projector != this.rayPersp)
    disp_scale = scale;
  /* display radius */
  var disp_rad = Math.min(dest_data.height, dest_data.width) * disp_scale / 2.0;
  for (var y = 0; y < dest_data.height; y++) {
    for (var x = 0; x < dest_data.width; x++) {
      for (var of = 0; of < osa_factor; of++) {
	// X and Y jitter for oversampling.
	var xj, yj;
	if (of == 0)
	  xj = yj = 0;
	else {
	  xj = 0.5 - Math.random();
	  yj = 0.5 - Math.random();
	}

	/* 1. Get the 3D rectangular coordinate of the ray intersection
	   with the sphere.  The camera is looking down the negative
	   z axis.  */
	var r3src_x, r3src_y, r3src_z;

	if (this.projector != this.rayPersp) {
	  // Orthographic projection
	  r3src_y = (y + yj - y_center) / disp_rad;
	  r3src_x = (x + xj - x_center) / disp_rad;
	  r3src_z = Math.sin(Math.acos(Math.sqrt(Math.pow(r3src_x, 2) +
						 Math.pow(r3src_y, 2))));
	  if (isNaN(r3src_z))
	    continue;
	} else {
	  // Perspective projection
	  // r must be one: this simplifies the calculations
	  var r = 1; // 6371; // radius of the earth in kilometers
	  var d = persp_altitude / 6371; // 35786; // altitude in kilometers
	  // focal length in units of the screen dimensions
	  var f = 1 / Math.tan(persp_fov * DEG2RAD / 2);
	  var x_pix = (x + xj - x_center) / disp_rad;
	  var y_pix = (y + yj - y_center) / disp_rad;

	  var w = (Math.pow(x_pix, 2) + Math.pow(y_pix, 2)) / Math.pow(f, 2);

	  var a = 1 + w;
	  var b = -2 * w * (r + d);
	  var c = w * Math.pow(r + d, 2) - 1 /* 1 == Math.pow(r, 2) */;

	  /* Divide by the radius at the intersection so that there is a
	     normalized coordinate that ranges from -1..1.  (Don't
	     actually need to do this since r == 1.)  */
	  r3src_z = (-b + Math.sqrt(Math.pow(b, 2) - 4 * a * c)) / (2 * a);
	  if (isNaN(r3src_z))
	    continue;
	  r3src_x = x_pix / f * (-r3src_z + (r + d));
	  r3src_y = y_pix / f * (-r3src_z + (r + d));
	}

	/* 2. Inverse rotate this coordinate around the x axis by the
	   current globe tilt.  */
	var i_tilt = -tilt * DEG2RAD;
	var cos_tilt = Math.cos(i_tilt); var sin_tilt = Math.sin(i_tilt);
	var r3dest_x, r3dest_y, r3dest_z;
	r3dest_x = r3src_x;
	r3dest_z = r3src_z * cos_tilt - r3src_y * sin_tilt;
	r3dest_y = r3src_z * sin_tilt + r3src_y * cos_tilt;

	/* 3. Measure the latitude and longitude of this coordinate.  */
	var latitude = Math.asin(r3dest_y);
	var longitude = Math.atan2(r3dest_x, r3dest_z);

	/* 4. Convert from radians to degrees.  */
	latitude = latitude * RAD2DEG;
	longitude = longitude * RAD2DEG;

	/* 5. Inverse shift by the longitudinal rotation around the pole.  */
	longitude += lon_rot;

	/* 6. Verify that the coordinates are in bounds.  */
	latitude += 90;
	if (latitude < 0) latitude = 0;
	if (latitude > 180) latitude = 180;
	/* while (longitude < 0) {
	  longitude += 360;
	}
	while (longitude >= 360) {
	  longitude -= 360;
	} */
	longitude += (longitude < 0) * 360;
	longitude = longitude % 360.0;

	/* Plot the pixel.  */
	var src_y = 0|(latitude * src_data.height * inv_180);
	var src_x = 0|(longitude * src_data.width * inv_360);
	if (src_y == src_data.height)
	  src_y -= 1;
	var src_index = (src_data.width * src_y + src_x) * 4;
	dest_data.data[dest_index+0] +=
	  src_data.data[src_index++] * inv_osa_factor;
	dest_data.data[dest_index+1] +=
	  src_data.data[src_index++] * inv_osa_factor;
	dest_data.data[dest_index+2] +=
	  src_data.data[src_index++] * inv_osa_factor;
	dest_data.data[dest_index+3] +=
	  src_data.data[src_index++] * inv_osa_factor;
      }
      dest_index += 4;
    }
  }

  ctx.putImageData(dest_data, 0, 0);
};

/* Simple 2D renderer: Just bitblt the composite of the RenderLayers
   onto the frontbuffer with the correct shifting and scaling
   factors.  */
Compositor.show2dComposite = function() {
  /* Compute the screen scale factor so that it corresponds to
     unwrapping the orthographically projected globe.  The width of
     the equirectangular map is stretched to `screen_scalfac'.  */
  var canvas = this.canvas;
  var earth_buffer = this.backbuf;
  var disp_rad = Math.min(canvas.width, canvas.height) * scale / 2.0;
  var screen_scalfac = disp_rad * 2 * Math.PI;
  var x_shift = (180 - lon_rot) * inv_360 * screen_scalfac - screen_scalfac / 2;
  var y_shift = tilt * inv_360 * screen_scalfac - screen_scalfac / 4;

  var ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;
  ctx.mozImageSmoothingEnabled = false;
  ctx.drawImage(earth_buffer, 0, 0, earth_buffer.width, earth_buffer.height,
		x_shift + canvas.width / 2,
                y_shift + canvas.height / 2,
                screen_scalfac, screen_scalfac / 2);

  // For now, don't bother with the following fancy stuff...
  return;

  // Draw a second image for a continuous wrapped display.
  /* if (lon_rot == 180) {
    return;
  } */
  // if (lon_rot < 180) x_shift -= screen_scalfac;
  // if (lon_rot > 180) x_shift += screen_scalfac;
  x_shift -= screen_scalfac;

  /* NOTE: Since JavaScript has a performance disadvantage compared to
     compiled C code, it might actually be faster to just skip all
     these visibility tests.  */
  var real_x_shift = x_shift + canvas.width / 2;
  /* if (real_x_shift + screen_scalfac < 0 || real_x_shift > canvas.width) {
    return;
  } */

  ctx.drawImage(earth_buffer, 0, 0, earth_buffer.width, earth_buffer.height,
		real_x_shift,
                y_shift + canvas.height / 2,
                screen_scalfac, screen_scalfac / 2);

  /* Draw a third image for continuous wrapping when zoomed out less
     than 100%.  */
  x_shift += screen_scalfac * 2;

  /* NOTE: Since JavaScript has a performance disadvantage compared to
     compiled C code, it might actually be faster to just skip all
     these visibility tests.  */
  var real_x_shift = x_shift + canvas.width / 2;
  /* if (real_x_shift + screen_scalfac < 0 || real_x_shift > canvas.width) {
    return;
  } */

  ctx.drawImage(earth_buffer, 0, 0, earth_buffer.width, earth_buffer.height,
		real_x_shift,
                y_shift + canvas.height / 2,
                screen_scalfac, screen_scalfac / 2);
};

// ----------------------------------------

// Special function for rendering an equirectangular graticule only.
Compositor.renderEquiGraticule = function() {
  var ctx = this.backbuf.getContext("2d");
  var width = this.backbuf.width;
  var height = this.backbuf.height;
  var gratDensity = this.gratDensity;
  ctx.strokeStyle = "rgba(128, 128, 128, 0.5)";
  ctx.lineWidth = this.backbufScale;

  for (var lat = 0; lat < 180; lat += gratDensity) {
    ctx.moveTo(0, (lat / 180) * height);
    ctx.lineTo(width, (lat / 180) * height);
  }
  for (var lon = 0; lon < 360; lon += gratDensity) {
    ctx.moveTo((lon / 360) * width, 0);
    ctx.lineTo((lon / 360) * width, height);
  }
  ctx.stroke();
};

/* Even more special function for rendering an equirectangular
   graticule with screen scaling and shifting.  */
function render_equi_graticule() {
  /* Compute the screen scale factor so that it corresponds to
     unwrapping the orthographically projected globe.  The width of
     the equirectangular map is stretched to `screen_scalfac'.  */
  var disp_rad = Math.min(canvas.width, canvas.height) * scale / 2.0;
  var screen_scalfac = disp_rad * 2 * Math.PI;
  var x_shift = (180 - lon_rot) * inv_360 * screen_scalfac - screen_scalfac / 2;
  var y_shift = tilt * inv_360 * screen_scalfac - screen_scalfac / 4;

  render_map();

  var ctx = canvas.getContext("2d");
  ctx.strokeStyle = 'rgba(128, 128, 128, 0.5)';
  ctx.lineWidth = scale;
  ctx.translate(x_shift + canvas.width / 2, y_shift + canvas.height / 2);

  ctx.beginPath();
  for (var lat = 0; lat < 180; lat += grat_density) {
    ctx.moveTo(0, (lat / 180) * screen_scalfac / 2);
    ctx.lineTo(screen_scalfac, (lat / 180) * screen_scalfac / 2);
  }
  for (var lon = 0; lon < 360; lon += grat_density) {
    ctx.moveTo((lon / 360) * screen_scalfac, 0);
    ctx.lineTo((lon / 360) * screen_scalfac, screen_scalfac / 2);
  }
  ctx.stroke();

  // Draw a second image for a continuous wrapped display.
  if (lon_rot == 180) {
    return;
  }
  if (lon_rot < 180) x_shift -= screen_scalfac;
  if (lon_rot > 180) x_shift += screen_scalfac;

  /* NOTE: Since JavaScript has a performance disadvantage compared to
     compiled C code, it might actually be faster to just skip all
     these visibility tests.  */
  var real_x_shift = x_shift + canvas.width / 2;
  /* if (real_x_shift + screen_scalfac < 0 || real_x_shift > canvas.width) {
    return;
  } */

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.translate(real_x_shift, y_shift + canvas.height / 2);

  ctx.beginPath();
  for (var lat = 0; lat < 180; lat += grat_density) {
    ctx.moveTo(0, (lat / 180) * screen_scalfac / 2);
    ctx.lineTo(screen_scalfac, (lat / 180) * screen_scalfac / 2);
  }
  for (var lon = 0; lon < 360; lon += grat_density) {
    ctx.moveTo((lon / 360) * screen_scalfac, 0);
    ctx.lineTo((lon / 360) * screen_scalfac, screen_scalfac / 2);
  }
  ctx.stroke();
}

/* Special rendering for an orthographic graticule: Render by
   computing the series of ellipses to draw to the screen.  */
function render_ortho_graticule() {
  var ctx = canvas.getContext("2d");
  var y_center = canvas.height / 2;
  var x_center = canvas.width / 2;
  var disp_scale = 1;
  if (!persp_project)
    disp_scale = scale;
  /* display radius */
  var disp_rad = Math.min(canvas.height, canvas.width) * disp_scale / 2.0;

  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#000000';
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Draw the outermost bounding circle.
  ctx.beginPath();
  ctx.arc(x_center, y_center, disp_rad, 0, 2 * Math.PI, false);
  ctx.stroke();

  // Draw all the latitude lines.
  for (var lat = -90; lat < 90; lat += grat_density) {
    var pole_height = disp_rad * Math.cos(tilt * DEG2RAD);
    // The parallel ellipse's width and height.
    var par_width = disp_rad * Math.cos(lat * DEG2RAD);
    var par_height = Math.sin(tilt * DEG2RAD);
    // The ascent of the parallel along the pole.
    var par_ascent = Math.sin(lat * DEG2RAD);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.translate(x_center, y_center + pole_height * par_ascent);
    if (par_height != 0)
      ctx.scale(1, par_height);
    ctx.beginPath();
    if (par_height != 0)
      ctx.arc(0, 0, par_width, 0, 2 * Math.PI, false);
    else
      ctx.moveTo(-par_width, 0); ctx.lineTo(par_width, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.stroke();
  }

  // Draw all the longitude lines.
  for (var lon = -lon_rot; lon < -lon_rot + 180; lon += grat_density) {
    /* Computing the 2D rotation and dimensions of the longitude
       ellipses requires 3D transformations.  */

    /* The key property to recognize is that the center of each
       ellipse will always coincide with the center of the screen.
       Another key is that the angle of the major axis of the ellipse
       will be the line that traces right through the equator line of
       a given longitude circle.  */

    // 1. Rotate the ellipse by its longitude in 3D.

    // 2. Squash the ellipse by its tilt in 3D.

    var lon_x_scale = Math.sin(lon * DEG2RAD);
    var lon_z_scale = Math.cos(lon * DEG2RAD);
    var lon_height = Math.cos(tilt * DEG2RAD);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.translate(x_center, y_center);
    // Shear transform by the z component.
    // Shear: y = y + x_dist * shear_factor
    // shear_factor = lon_z_scale * Math.sin(tilt * DEG2RAD);
    if (!isNaN(lon_z_scale / lon_x_scale))
      ctx.transform(1, lon_z_scale / lon_x_scale * Math.sin(tilt * DEG2RAD), 0,
		    1, 0, 0);
    ctx.beginPath();


    if (lon_x_scale != 0) {
      ctx.scale(lon_x_scale, lon_height);
      ctx.arc(0, 0, disp_rad, 0, 2 * Math.PI, false);
    } else if (lon_height != 0) {
      ctx.scale(1, lon_height);
      ctx.moveTo(0, -disp_rad); ctx.lineTo(0, disp_rad);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.stroke();
  }
}

// -------------------------------------------------------------------

/* Since this is the main JavaScript file, all other dependent
   JavaScripts will be included before this file.  Close the OEV
   namespace now that there are no more JavaScripts to be
   included.  */
import "oevnsend";
