/* Composite rendering of 2D RenderLayers, either as a 2D map or
   through a 3D raytrace renderer.  */

import "oevns";
import "compat";
import "oevmath";
import "projector";
import "cothread";
import "dates";
import "earthtexlayer";
import "trackslayer";
import "sshlayer";

var Compositor = {};
OEV.Compositor = Compositor;

// Important parameters:

// Density of the graticule lines in degrees per line
Compositor.gratDensity = 15;

// Display the land mass texture?
Compositor.dispLandMasses = true;

// Display the SSH overlay?
Compositor.dispSSH = true;

/* Perform startup initialization for the whole web viewer.  */
Compositor.init = function() {
  // Add all the RenderLayers to the GUI containment.
  this.drawingContainer = document.getElementById("drawingContainer");
  EarthTexLayer.frontBuf.className = "renderLayer";
  this.drawingContainer.appendChild(EarthTexLayer.frontBuf);
  SSHLayer.frontBuf.className = "renderLayer";
  this.drawingContainer.appendChild(SSHLayer.frontBuf);
  TracksLayer.frontBuf.className = "renderLayer";
  this.drawingContainer.appendChild(TracksLayer.frontBuf);

  this.fitViewportToCntr();
  ViewParams.projector = EquirectProjector;
  this.optiRenderImp();

  EarthTexLayer.frontBuf.style.cssText = "display: none";
  SSHLayer.frontBuf.style.cssText = "display: none";
  TracksLayer.frontBuf.style.cssText = "display: none";

  this.noDouble = false;
  this.ready = false;

  /* Preload the required data so that the GUI can indicate these
     steps are in progress.  */
  var finishWrapper = makeEventWrapper(Compositor, "finishStartup");
  Dates.timeout = 15;
  Dates.notifyFunc = finishWrapper;
  SSHLayer.loadData.timeout = 15;
  SSHLayer.loadData.notifyFunc = finishWrapper;
  TracksLayer.loadData.timeout = 15;
  TracksLayer.loadData.notifyFunc = finishWrapper;

  Dates.initCtx();
  EarthTexData.initLoad(15, finishWrapper);
  SSHLayer.loadData.initCtx();
  TracksLayer.loadData.initCtx();

  return this.finishStartup();
};

// Change the viewport in a safe way for all RenderLayers.
Compositor.setViewport = function(width, height) {
  ViewParams.viewport[0] = width;
  ViewParams.viewport[1] = height;
  ViewParams.aspectXY = width / height;
  EarthTexLayer.setViewport(width, height);
  SSHLayer.setViewport(width, height);
  TracksLayer.setViewport(width, height);
};

/* Reset all RenderLayers to their start condition at once, and start
   a render loop if there isn't one already running.  */
Compositor.startRender = function() {
  EarthTexLayer.initCtx();
  SSHLayer.initCtx();
  TracksLayer.initCtx();
  if (!this.renderInProg) {
    this.renderPart = 0;
    return this.finishRenderJobs();
  }
};

/* If there is not a currently running render loop, start one.  */
Compositor.startRenderLoop = function() {
  if (!this.renderInProg) {
    this.renderPart = 0;
    return this.finishRenderJobs();
  }
};

Compositor.finishStartup = function() {
  var datesStatus = Dates.continueCT();
  var earthTexStatus = EarthTexData.loadData.continueCT();
  var sshStatus = SSHLayer.loadData.continueCT();
  var tracksStatus = TracksLayer.loadData.continueCT();
  if (datesStatus.returnType != CothreadStatus.FINISHED ||
      earthTexStatus.returnType != CothreadStatus.FINISHED ||
      sshStatus.returnType != CothreadStatus.FINISHED ||
      tracksStatus.returnType != CothreadStatus.FINISHED) {
    if (datesStatus.preemptCode == CothreadStatus.IOWAIT ||
	earthTexStatus.preemptCode == CothreadStatus.IOWAIT ||
	sshStatus.preemptCode == CothreadStatus.IOWAIT ||
	tracksStatus.preemptCode == CothreadStatus.IOWAIT)
      return;
    return window.setTimeout(
	makeEventWrapper(Compositor, "finishStartup"), 300);
  }

  // Prevent final initialization from being run twice.
  if (Compositor.noDouble)
    return;
  /* if (!Compositor.ready)
    return; */
  Compositor.noDouble = true;

  /* Connect the front buffers to the GUI now that loading is
     finished.  */
  var loadingScreen = document.getElementById("loadingScreen");
  if (loadingScreen)
    loadingScreen.style.cssText = "display: none";

  EarthTexLayer.frontBuf.style.cssText = "";
  SSHLayer.frontBuf.style.cssText = "";
  TracksLayer.frontBuf.style.cssText = "";

  this.drawingContainer.onmousedown = setMouseDown;
  if (!this.drawingContainer.setCapture)
    window.onmousemove = panGlobe;
  else {
    this.drawingContainer.onmousemove = panGlobe;
    this.drawingContainer.onmouseup = setMouseUp;
  }
  addWheelListener(this.drawingContainer, zoomGlobe);

  /* This should probably go in the GUI setup code... */
  window.onorientationchange = window.onresize = function() {
    Compositor.fitViewportToCntr();
    Compositor.startRender();
  };

  /* Now that all the necessary startup data is loaded, we should
     proceed to rendering the first frame.  */
  var renderWrapper = makeEventWrapper(Compositor, "finishRenderJobs");
  EarthTexLayer.timeout = 15;
  EarthTexLayer.notifyFunc = renderWrapper;
  SSHLayer.timeout = 15;
  SSHLayer.notifyFunc = renderWrapper;
  TracksLayer.timeout = 15;
  TracksLayer.notifyFunc = renderWrapper;
  return this.startRender();
};

Compositor.renderInProg = false;

/* Finish any render jobs that may be pending from TracksLayer or
   SSHLayer.  If the parameter "fast" (deprecated) is provided and set
   to true, then only redraw the composite without doing any more
   computations.  If "noContinue" is provided and set to true, then
   this function will not use window.setTimeout() to finish the
   cothreaded rendering jobs.  */
Compositor.finishRenderJobs = function(fast, noContinue) {
  var earthTexStatus = EarthTexLayer.status;
  var sshStatus = SSHLayer.status;
  var tracksStatus = TracksLayer.status;
  this.renderInProg = true;

  if (this.fitViewportToCntr()) {
    if (earthTexStatus.returnType == CothreadStatus.FINISHED)
      EarthTexLayer.initCtx();
    if (sshStatus.returnType == CothreadStatus.FINISHED)
      SSHLayer.initCtx();
    if (tracksStatus.returnType == CothreadStatus.FINISHED)
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
  } else if (earthTexStatus.returnType != CothreadStatus.FINISHED ||
	   sshStatus.returnType != CothreadStatus.FINISHED ||
	   tracksStatus.returnType != CothreadStatus.FINISHED)
    return requestAnimationFrame(
	       makeEventWrapper(Compositor, "finishRenderJobs"));
  else if (earthTexStatus.returnType == CothreadStatus.FINISHED &&
	   sshStatus.returnType == CothreadStatus.FINISHED &&
	   tracksStatus.returnType == CothreadStatus.FINISHED &&
	   this.playMode) {
    if (Dates.curDate >= Dates.dateList.length - 1) {
      this.playMode = false;
      this.renderInProg = false;
      return;
    }
    Dates.curDate++;
    var dateStr = OEV.Dates.dateList[OEV.Dates.curDate];
    document.getElementById('cfg-curDate').value = dateStr;
    SSHLayer.initCtx();
    TracksLayer.initCtx();
    this.renderPart = 0;
    return requestAnimationFrame(
	       makeEventWrapper(Compositor, "finishRenderJobs"));
  } else {
    this.renderInProg = false;
  }
};

/* If a render loop is in progress, force it to halt.  */
Compositor.halt = function() {
  this.stopSignal = true;
};

/* Resize the viewports of the RenderLayers to fit the CSS allocated
   space.  Returns `true` if the viewport size was changed, `false`
   otherwise.

   NOTE: Because modern browsers do not provide an event that fires if
   the width or height of a CSS element has changed, this function
   must be called every time the screen is updated via one of the
   render() functions.  */
Compositor.fitViewportToCntr = function() {
  // Warning: clientWidth and clientHeight marked as unstable in MDN.
  if (ViewParams.viewport[0] == this.drawingContainer.clientWidth &&
      ViewParams.viewport[1] == this.drawingContainer.clientHeight)
    return false;
  this.setViewport(this.drawingContainer.clientWidth,
		   this.drawingContainer.clientHeight);
  // window.innerWidth, window.innerHeight
  return true;
};

/* Switch which RenderLayer implementation is contained within the
   GUI.  */
Compositor.switchRenderLayer = function(absName, impName) {
  impName.frontBuf.className = "renderLayer";
  this.drawingContainer.replaceChild(impName.frontBuf, absName.frontBuf);
  if (ViewParams.viewport[0] != impName.frontBuf.width ||
      ViewParams.viewport[1] != impName.frontBuf.height)
    impName.setViewport(ViewParams.viewport[0], ViewParams.viewport[1]);
};

/* Analyze the current rendering parameters and for each RenderLayer,
   choose the most optimal implementation.  */
Compositor.optiRenderImp = function() {
  if (ViewParams.projector == EquirectProjector &&
      ViewParams.polCenter[1] == 0) {
    this.switchRenderLayer(EarthTexLayer, EquiEarthTexLayer);
    OEV.EarthTexLayer = EarthTexLayer = EquiEarthTexLayer;
    if (SSHParams.shadeStyle == 0 &&
	SSHParams.shadeBase == 0 &&
	SSHParams.shadeScale == 4) {
      this.switchRenderLayer(SSHLayer, EquiGraySSHLayer);
      OEV.SSHLayer = SSHLayer = EquiGraySSHLayer;
      /* For this special case, the land masses must be rendered on
	 top of the SSHLayer.  */
      this.drawingContainer.insertBefore(EarthTexLayer.frontBuf,
					 TracksLayer.frontBuf);
    } else {
      this.switchRenderLayer(SSHLayer, GenSSHLayer);
      OEV.SSHLayer = SSHLayer = GenSSHLayer;
    }
  } else {
    this.switchRenderLayer(EarthTexLayer, GenEarthTexLayer);
    OEV.EarthTexLayer = EarthTexLayer = GenEarthTexLayer;
    this.switchRenderLayer(SSHLayer, GenSSHLayer);
    OEV.SSHLayer = SSHLayer = GenSSHLayer;
  }
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

var mouseDown = false;
var buttonDown = 0;
var firstPoint = {};
var topLeft = { x: 0, y: 0 };
var ptMSIE = 0; // msieVersion();
firstPoint.x = 0; firstPoint.y = 0;

var old_lon_rot;
var old_tilt;

function setMouseDown(event) {
  /* if (ptMSIE <= 6 && ptMSIE > 0)
    event = window.event; */

  if (this.setCapture)
    this.setCapture();
  else
    window.onmouseup = setMouseUp;

  mouseDown = true;
  buttonDown = event.button;
  firstPoint.x = event.clientX; firstPoint.y = event.clientY;
  /* if (!topLeft.x) {
    topLeft.x = firstPoint.x - canvas.width / 2;
    topLeft.y = firstPoint.y - canvas.height / 2;
    var ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  } */
  old_lon_rot = ViewParams.polCenter[0];
  if (ViewParams.projector == EquirectProjector)
    old_tilt = ViewParams.mapCenter[1];
  else old_tilt = ViewParams.polCenter[1];
}

function panGlobe(event) {
  if (!mouseDown)
    return;
  if (ptMSIE <= 6 && ptMSIE > 0)
    event = window.event;

  /* var disp_rad = Math.min(canvas.height, canvas.width) * scale / 2.0;
  var first_ang_x = Math.asin((firstPoint.x - canvas.width / 2) / disp_rad);
  var first_ang_y = Math.asin((firstPoint.y - canvas.width / 2) / disp_rad);
  var cur_ang_x = Math.asin((event.clientX - canvas.width / 2) / disp_rad);
  var cur_ang_y = Math.asin((event.clientY - canvas.width / 2) / disp_rad);

  if (isNaN(first_ang_x) || isNaN(first_ang_y) ||
      isNaN(cur_ang_x) || isNaN(cur_ang_y))
    return;

  lon_rot = old_lon_rot + first_ang_y - cur_ang_y;
  tilt = old_tilt - (first_ang_x - cur_ang_x); */

  var pan_scale;
  var equirect_x_scale = 1;
  if (ViewParams.projector != Compositor.rayPersp)
    pan_scale = ViewParams.scale;
  else
    pan_scale = 1; // TODO: Do more complicated calculation
  if (ViewParams.projector != Compositor.rayOrtho &&
      ViewParams.projector != Compositor.rayPersp) {
    var disp_rad = ViewParams.viewport[0] * ViewParams.scale / 2.0;
    var screen_scalfac = disp_rad * 2 * Math.PI;
    equirect_x_scale = 1;
  }
  ViewParams.polCenter[0] = old_lon_rot + (firstPoint.x - event.clientX) /
    ViewParams.viewport[0] / pan_scale * equirect_x_scale * 180;
  if (ViewParams.projector == EquirectProjector)
    ViewParams.mapCenter[1] = old_tilt - (-(firstPoint.y - event.clientY)) /
      ViewParams.viewport[1] / pan_scale * 180 / 180 * ViewParams.scale;
  else ViewParams.polCenter[1] = old_tilt - (firstPoint.y - event.clientY) /
	 ViewParams.viewport[1] / pan_scale * 180;

  /* if (tilt > 90) tilt = 90;
  if (tilt < -90) tilt = -90; */
  while (ViewParams.polCenter[0] < 0) ViewParams.polCenter[0] += 360;
  while (ViewParams.polCenter[0] >= 360) ViewParams.polCenter[0] -= 360;

  var cfg_latLon = document.getElementById("cfg-latLon");
  if (cfg_latLon) {
    var dispLat = -ViewParams.mapCenter[1] * 180 / ViewParams.scale;
    var dispLon = ViewParams.polCenter[0];
    if (dispLat < 0)
      dispLat = (-dispLat).toFixed(3) + " S";
    else
      dispLat = dispLat.toFixed(3) + " N";
    if (dispLon >= 180)
      dispLon -= 360;
    if (dispLon < 0)
      dispLon = (-dispLon).toFixed(3) + " W";
    else
      dispLon = dispLon.toFixed(3) + " E";
    cfg_latLon.value = dispLat + " " + dispLon;
  }

  Compositor.startRender();

  /* if (ptMSIE <= 6 && ptMSIE > 0)
    event.cancelBubble = true; */
  return false; // Cancel the default, or at least attempt to do so.
}

function setMouseUp(event) {
  mouseDown = false;
  Compositor.finishRenderJobs(true);
  window.onmouseup = null;
  return false;
}

function zoomGlobe(event) {
  if (ViewParams.projector != Compositor.rayPersp) {
    if (event.deltaMode == 0x01) { // DOM_DELTA_LINE
      if (event.deltaY < 0)
        ViewParams.scale *= (event.deltaY / 3) * -1.1;
      else
        ViewParams.scale /= (event.deltaY / 3) * 1.1;
    } else if (event.deltaMode == 0x00) { // DOM_DELTA_PIXEL
      /* FIXME: a good factor for this is wildly different across
	 systems.  */
      if (event.deltaY < 0)
        ViewParams.scale *= (event.deltaY / 51) * -1.1;
      else
        ViewParams.scale /= (event.deltaY / 51) * 1.1;
    }
    var cfg_scaleFac = document.getElementById("cfg-scaleFac");
    if (cfg_scaleFac) cfg_scaleFac.value = ViewParams.scale.toFixed(3);
  } else {
    if (event.deltaMode == 0x01) { // DOM_DELTA_LINE
      if (event.deltaY < 0)
        persp_fov /= -(event.deltaY / 3) * 1.1;
      else
        persp_fov *= (event.deltaY / 3) * 1.1;
    } else if (event.deltaMode == 0x00) { // DOM_DELTA_PIXEL
      if (event.deltaY < 0)
        persp_fov /= -(event.deltaY / 53) * 1.1;
      else
        persp_fov *= (event.deltaY / 53) * 1.1;
    }
    var cfg_perspFOV = document.getElementById("cfg-perspFOV");
    if (cfg_perspFOV) cfg_perspFOV.value = persp_fov;
  }
  ViewParams.inv_scale = 1 / ViewParams.scale;

  // NOTE: allocRenderJob() messes up what `this' points to.
  // if (allocRenderJob(makeEventWrapper(Compositor, "finishRenderJobs")))
  Compositor.startRender();
  event.preventDefault();
  return false;
}

// -------------------------------------------------------------------

/* Since this is the main JavaScript file, all other dependent
   JavaScripts will be included before this file.  Close the OEV
   namespace now that there are no more JavaScripts to be
   included.  */
import "oevnsend";
