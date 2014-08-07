/* Composite rendering of 2D RenderLayers, either as a 2D map or
   through a 3D raytrace renderer.  */

// Prevent errors, please...
var execTime = null;

import "oevns";
import "compat";
import "oevmath";
import "projector";
import "cothread";
import "trackslayer";
import "sshlayer";

// BAD variables that need updating

// longitude rotation
var lon_rot = 180;
// globe tilt
var tilt = 0;
// orthographic globe scale
var scale = 1.0;
// perspective altitude
var persp_altitude = 35786;
// perspective field of view
var persp_fov = 17.5;

var Compositor = {};
OEV.Compositor = Compositor;

// Important parameters:

// Raytraced orthographic projection to an equirectangular backbuffer.
Compositor.rayOrtho = 1;

// Raytraced perspective projection to an equirectangular backbuffer.
Compositor.rayPersp = 2;

/* Projection method.  Must either one of the Projector objects or a
   raytracer from the compositor module.  */
Compositor.projector = EquirectMapProjector;

// Backbuffer scaling factor
Compositor.backbufScale = 2;

// Density of the graticule lines in degrees per line
Compositor.gratDensity = 15;

// Display the land mass texture?
Compositor.dispLandMasses = true;

// Display the SSH overlay?
Compositor.dispSSH = true;

/* Perform startup initialization for the whole web viewer.  */
Compositor.init = function() {
  this.drawingContainer = document.getElementById("drawingContainer");
  this.canvas = document.createElement("canvas"); // Front buffer
  // TODO: Perform capabilities check here.
  this.canvas.id = "drawingPad";
  this.canvas.style.cssText = "display: none";
  this.drawingContainer.appendChild(this.canvas);

  this.fitCanvasToCntr();

  // Create a backbuffer to pull pixels from.
  this.backbuf = document.createElement("canvas");
  this.backbuf.id = "compositeBackbuf";

  this.noDouble = false;
  this.ready = false;

  // Initialize the overlays.
  this.projEarthTex.timeout = 15;
  Dates.notifyFunc = makeEventWrapper(Compositor, "finishStartup");
  SSHLayer.loadData.notifyFunc = makeEventWrapper(Compositor, "finishStartup");
  SSHLayer.loadData.timeout = 15;
  SSHLayer.render.timeout = 15;
  TracksLayer.acLoad.notifyFunc = makeEventWrapper(Compositor, "finishStartup");
  TracksLayer.cLoad.notifyFunc = makeEventWrapper(Compositor, "finishStartup");
  TracksLayer.loadData.timeout = 15;
  TracksLayer.render.timeout = 15;

  SSHLayer.loadData.start();
  TracksLayer.loadData.start();

  // Load the land mass background image.
  this.earthTex = new Image();
  this.earthTex.onload = function() {
    Compositor.backbuf.width =
      Compositor.earthTex.width * Compositor.backbufScale;
    Compositor.backbuf.height =
      Compositor.earthTex.height * Compositor.backbufScale;

    // Prepare the Earth texture projection buffer.
    var tmpCanv = document.createElement("canvas");
    tmpCanv.width = Compositor.earthTex.width;
    tmpCanv.height = Compositor.earthTex.height;
    var ctx = tmpCanv.getContext("2d");
    ctx.drawImage(Compositor.earthTex, 0, 0);

    Compositor.projEarthTex.earthTex =
      ctx.getImageData(0, 0, tmpCanv.width, tmpCanv.height);
    Compositor.earthTex = null; // Don't need this anymore
    Compositor.projEarthTex.frontBuf.width = tmpCanv.width;
    Compositor.projEarthTex.frontBuf.height = tmpCanv.height;
    Compositor.ready = true;
    return Compositor.finishStartup();
  };
  this.earthTex.src = "../data/blue_marble/land_ocean_ice_2048.jpg";
  // this.earthTex.src = "../data/blue_marble/land_shallow_topo_2048.jpg";
  // this.earthTex.src = "../data/blue_marble/world.200408.3x5400x2700.jpg";
  // this.earthTex.src = "../data/blue_marble/world.200402.3x5400x2700.jpg";

  return this.finishStartup();
};

// Change projection in a safe way for all RenderLayers.
Compositor.setProjector = function(projector) {
  if (projector == Compositor.rayOrtho || projector == Compositor.rayPersp) {
    this.projector = projector;
    projector = EquirectMapProjector;
  } else
    this.projector = projector;

  if (!Compositor.ready)
    return;
  // Update projected land masses.
  this.projEarthTex.start();
  var width = 1440; height = 721;
  SSHLayer.setViewport(null, width, height, width / height, projector);
  SSHLayer.render.start();
  width = Compositor.backbuf.width;
  height = Compositor.backbuf.height;
  TracksLayer.setViewport(null, width, height, width / height, projector);
  TracksLayer.render.start();
};

// Start rendering for all RenderLayers at once.
Compositor.startRender = function() {
  SSHLayer.render.start();
  TracksLayer.render.start();
};

// Pre-project the Earth texture for faster composing.
Compositor.projEarthTex = new Cothread();

// ... non-ideal
Compositor.projEarthTex.frontBuf = document.createElement("canvas");

Compositor.projEarthTex.initCtx = function() {
  this.ctx = this.frontBuf.getContext("2d");
  // TODO: This should be carried around in a cache-like manner.
  this.destImg = this.ctx.createImageData(this.frontBuf.width,
					  this.frontBuf.height);
  this.destIdx = 0;
  this.aspectXY = this.frontBuf.width / this.frontBuf.height;
  this.x = 0;
  this.y = 0;

  this.status.returnType = CothreadStatus.PREEMPTED;
  this.status.preemptCode = 0;
  this.status.percent = 0;
};

Compositor.projEarthTex.contExec = function() {
  var ctx = this.ctx;
  var destImg = this.destImg;
  var destIdx = this.destIdx;
  var x = this.x;
  var y = this.y;
  var oldY = y;

  var frontBuf_width = destImg.width;
  var frontBuf_height = destImg.height;
  var earthTex = this.earthTex;
  var srcWidth = earthTex.width;
  var srcHeight = earthTex.height;
  var aspectXY = this.aspectXY;
  var inv_aspectXY = 1 / aspectXY;
  var projector_unproject;
  if (Compositor.projector == Compositor.rayOrtho ||
      Compositor.projector == Compositor.rayPersp)
    projector_unproject = EquirectMapProjector.unproject;
  else
    projector_unproject = Compositor.projector.unproject;

  var ctnow = Cothread.now;

  var startTime = ctnow();
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
	destIdx += 4;
	x++;
	continue;
      }
      var latIdx = 0|((polCoord.lat + 90) / 180 * srcHeight);
      var lonIdx = 0|((polCoord.lon + 180) / 360 * srcWidth);
      var index = (latIdx * srcWidth + lonIdx) * 4;

      destImg.data[destIdx++] = earthTex.data[index++];
      destImg.data[destIdx++] = earthTex.data[index++];
      destImg.data[destIdx++] = earthTex.data[index++];
      destImg.data[destIdx++] = earthTex.data[index++];

      x++;
    }
    if (x >= frontBuf_width) {
      x = 0;
      y++;
    }
    if (y % 32 == 0 && ctnow() - startTime >= timeout)
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

Compositor.finishStartup = function() {
  var sshStatus = SSHLayer.loadData.continueCT();
  var tracksStatus = TracksLayer.loadData.continueCT();
  if (tracksStatus.returnType != CothreadStatus.FINISHED ||
      sshStatus.returnType != CothreadStatus.FINISHED) {
    if (tracksStatus.preemptCode == CothreadStatus.IOWAIT ||
	sshStatus.preemptCode == CothreadStatus.IOWAIT)
      return;
    return setTimeout(makeEventWrapper(Compositor, "finishStartup"), 300);
  }
  if (Compositor.noDouble)
    return;
  if (!Compositor.ready)
    return;
  Compositor.noDouble = true;
  SSHLayer.loadData.notifyFunc = makeEventWrapper(Compositor, "finishRenderJobs");

  /* If dates finished loading, then initialize curDate.  */

  var width = 1440; var height = 721;
  var projector;
  if (this.projector == Compositor.rayOrtho ||
      this.projector == Compositor.rayPersp)
    projector = EquirectMapProjector;
  else
    projector = this.projector;
  SSHLayer.setViewport(null, width, height, width / height,
		       projector);
  width = Compositor.backbuf.width;
  height = Compositor.backbuf.height;
  TracksLayer.setViewport(null, width, height, width / height,
			  projector);

  /* Connect the front buffer to the GUI now that loading is
     finished.  */
  var loadingScreen = document.getElementById("loadingScreen");
  if (loadingScreen)
    loadingScreen.style.cssText = "display: none";
  this.canvas.style.cssText = "";
  this.canvas.onmousedown = setMouseDown;
  if (!this.canvas.setCapture)
    window.onmousemove = panGlobe;
  else {
    this.canvas.onmousemove = panGlobe;
    this.canvas.onmouseup = setMouseUp;
  }
  addWheelListener(this.canvas, zoomGlobe);

  /* Now that all the necessary startup data is loaded, we should
     proceed to rendering the first frame.  */
  this.projEarthTex.start();
  SSHLayer.render.start();
  TracksLayer.render.start();
  return this.finishRenderJobs();
};

Compositor.renderInProg = false;

Compositor.finishRenderJobs = function() {
};

/* Finish any render jobs that may be pending from TracksLayer or
   SSHLayer.  If the parameter "fast" is provided and set to true,
   then only redraw the composite without doing any more computations.
   If "noContinue" is provided and set to true, then this function
   will not use setTimeout() to finish the cothreaded rendering
   jobs.  */
Compositor.finishRenderJobs = function(fast, noContinue) {
  var petStatus;
  var sshStatus;
  var tracksStatus;
  if (!fast) {
    if (!noContinue)
      this.renderInProg = true;
    petStatus = this.projEarthTex.continueCT();
    if (this.dispSSH)
      sshStatus = SSHLayer.render.continueCT();
    else
      sshStatus = { returnType: CothreadStatus.FINISHED };
    tracksStatus = TracksLayer.render.continueCT();

    { // Compose the layers.
      var backbuf = this.backbuf;
      var ctx = backbuf.getContext("2d");
      ctx.clearRect(0, 0, backbuf.width, backbuf.height);
      if (this.dispLandMasses)
        ctx.drawImage(this.projEarthTex.frontBuf,
		      0, 0, backbuf.width, backbuf.height);
      if (this.dispSSH)
        ctx.drawImage(SSHLayer.frontBuf,
		      0, 0, backbuf.width, backbuf.height);
      ctx.drawImage(TracksLayer.frontBuf,
		    0, 0, backbuf.width, backbuf.height);
      /* if (this.projector == Compositor.rayOrtho ||
	  this.projector == Compositor.rayPersp ||
	  this.projector == EquirectMapProjector)
	this.renderEquiGraticule(); */
    }
  }

  this.fitCanvasToCntr();
  if (this.projector == Compositor.rayOrtho ||
      this.projector == Compositor.rayPersp)
    this.show3dComposite();
  else this.show2dComposite();

  if (fast || noContinue)
    return;

  /* var renderMethod;
  makeEventWrapper(this, "renderMethod"); // ...
  if (allocRenderJob(renderMethod))
    renderMethod(); */

  if (petStatus.returnType != CothreadStatus.FINISHED ||
      tracksStatus.returnType != CothreadStatus.FINISHED ||
      sshStatus.returnType != CothreadStatus.FINISHED)
    return setTimeout(makeEventWrapper(Compositor, "finishRenderJobs"), 15);
  else {
    this.renderInProg = false;
    // console.log("Done rendering.");
  }
};

/* Resize the frontbuffer canvas to fit the CSS allocated space.

   NOTE: Because modern browsers do not provide an event that fires if
   the width or height of a CSS element has changed, this function
   must be called every time the screen is updated via one of the
   render() functions.  */
Compositor.fitCanvasToCntr = function() {
  // var drawingContainer = document.getElementById("drawingContainer");
  // Warning: clientWidth and clientHeight marked as unstable in MDN.
  if (this.canvas.width == this.drawingContainer.width &&
      this.canvas.height == this.drawingContainer.height)
    return;
  this.canvas.width = this.drawingContainer.clientWidth;
  this.canvas.height = this.drawingContainer.clientHeight;
  // window.innerWidth, window.innerHeight
}

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
  old_lon_rot = lon_rot;
  old_tilt = tilt;
}

function panGlobe(event) {
  if (!mouseDown)
    return;
  if (ptMSIE <= 6 && ptMSIE > 0)
    event = window.event;

  var ctx = Compositor.canvas.getContext("2d");

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
  if (Compositor.projector != Compositor.rayPersp)
    pan_scale = scale;
  else
    pan_scale = 1; // TODO: Do more complicated calculation
  if (Compositor.projector != Compositor.rayOrtho &&
      Compositor.projector != Compositor.rayPersp) {
    var disp_rad = Math.min(Compositor.canvas.width, Compositor.canvas.height) * scale / 2.0;
    var screen_scalfac = disp_rad * 2 * Math.PI;
    equirect_x_scale = 1;
  }
  lon_rot = old_lon_rot + (firstPoint.x - event.clientX) /
    Compositor.canvas.width / pan_scale * equirect_x_scale * 180;
  tilt = old_tilt - (firstPoint.y - event.clientY) /
    Compositor.canvas.height / pan_scale * 180;

  if (tilt > 90) tilt = 90;
  if (tilt < -90) tilt = -90;
  while (lon_rot < 0) lon_rot += 360;
  while (lon_rot >= 360) lon_rot -= 360;

  var cfg_latLon = document.getElementById("cfg-latLon");
  if (cfg_latLon) {
    var dispLat = tilt;
    var dispLon = lon_rot - 180;
    if (dispLat < 0)
      dispLat = (-dispLat).toFixed(3) + " S";
    else
      dispLat = dispLat.toFixed(3) + " N";
    if (dispLon < 0)
      dispLon = (-dispLon).toFixed(3) + " W";
    else
      dispLon = dispLon.toFixed(3) + " E";
    cfg_latLon.value = dispLat + " " + dispLon;
  }

  Compositor.finishRenderJobs(true);

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
  if (Compositor.projector != Compositor.rayPersp) {
    if (event.deltaMode == 0x01) { // DOM_DELTA_LINE
      if (event.deltaY < 0)
        scale *= (event.deltaY / 3) * -1.1;
      else
        scale /= (event.deltaY / 3) * 1.1;
    } else if (event.deltaMode == 0x00) { // DOM_DELTA_PIXEL
      /* FIXME: a good factor for this is wildly different across
	 systems.  */
      if (event.deltaY < 0)
        scale *= (event.deltaY / 51) * -1.1;
      else
        scale /= (event.deltaY / 51) * 1.1;
    }
    var cfg_scaleFac = document.getElementById("cfg-scaleFac");
    if (cfg_scaleFac) cfg_scaleFac.value = scale.toFixed(3);
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

  // NOTE: allocRenderJob() messes up what `this' points to.
  // if (allocRenderJob(makeEventWrapper(Compositor, "finishRenderJobs")))
    Compositor.finishRenderJobs(true);
  event.preventDefault();
  return false;
}

/* Since this is the main JavaScript file, all other dependent
   JavaScripts will be included before this file.  Close the OEV
   namespace now that there are no more JavaScripts to be
   included.  */
import "oevnsend";
