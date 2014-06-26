/* Composite rendering of 2D RenderLayers, either as a 2D map or
   through a 3D raytrace renderer.  */

import "trackslayer";
import "sshlayer";
import "compat";

var Compositor = {};

/* Perform startup initialization for the whole web viewer.  */
Compositor.init = function() {
  this.drawingContainer = document.getElementById("drawingContainer");
  this.canvas = document.createElement("canvas");
  // TODO: Perform capabilities check here.
  this.canvas.id = "drawingPad";
  this.canvas.style.cssText = "display: none";
  this.drawingContainer.appendChild(this.canvas);

  this.fitCanvasToCntr();

  // Create a backbuffer to pull pixels from.
  this.backbuf = document.createElement("canvas");
  this.backbuf.id = "compositeBackbuf";

  this.ready = false;

  // Initialize the overlays.
  TracksLayer.loadData.timeout = 15;
  TracksLayer.render.timeout = 15;
  SSHLayer.loadData.timeout = 15;
  SSHLayer.render.timeout = 15;

  TracksLayer.loadData.startExec();
  SSHLayer.loadData.startExec();

  TracksLayer.setViewport();
  SSHLayer.setViewport();

  // Load the land mass background image.
  this.earth_tex = new Image();
  this.earth_tex.onload = function() {
    Compositor.backbuf.width = earth_tex.width * backbufScale;
    Compositor.backbuf.height = earth_tex.height * backbufScale;
    Compositor.ready = true;
    return Compositor.finishStartup();
  };
  this.earth_tex.src = "../blue_marble/land_ocean_ice_2048.jpg";
  // this.earth_tex.src = "../blue_marble/land_shallow_topo_2048.jpg";
  // this.earth_tex.src = "../blue_marble/world.200408.3x5400x2700.jpg";
  // this.earth_tex.src = "../blue_marble/world.200402.3x5400x2700.jpg";
};

// Change projection

Compositor.finishStartup = function() {
  var tracksStatus = TracksLayer.loadData.continueCT();
  var sshStatus = SSHLayer.loadData.continueCT();
  if (tracksStatus.returnType != CothreadStatus.FINISHED ||
      sshStatus.returnType != CothreadStatus.FINISHED) {
    if (tracksStatus.preemptCode == CothreadStatus.IOWAIT ||
	sshStatus.preemptCode == CothreadStatus.IOWAIT)
      return;
    return setTimeout(Compositor.finishStartup, 300);
  }
  if (!Compositor.ready)
    return;

  renderEddyTracks();
  refreshOverlay();
  pointerTestInit();
  render_globe();
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

/* Perform one of the 3D raytracing rendering processes.  */
Compositor.render3d = function() {
  return render_globe();
};

/* Simple 2D renderer: Just display the composite of the
   RenderLayers.  */
Compositor.render2d = function() {
  return render_map();
};

/* Finish any render jobs that may be pending from TracksLayer or
   SSHLayer.  */
Compositor.finishRenderJobs = function() {
  var tracksStatus = TracksLayer.render.continueCT();
  var sshStatus = SSHLayer.render.continueCT();

  // Composite!
  Compositor.render3d();

  if (tracksStatus.returnType != CothreadStatus.FINISHED ||
      sshStatus.returnType != CothreadStatus.FINISHED)
    return setTimeout(Compositor.finishRenderJobs, 15);
};

// ----------------------------------------

// TODO: This function should be a tile-based rendering engine that
// gets called from a callback to complete the render.  In general,
// JavaScript cannot support threads.
function render_globe() {
  if (!allocRenderJob(render_globe))
    return;
  Compositor.fitCanvasToCntr();
  if (equirect_project) {
    if (wire_render)
      return render_equi_graticule();
    return render_map();
  }
  if (wire_render)
    return render_ortho_graticule();
  // Project and render the image.
  var ctx = canvas.getContext("2d");
  var dest_data = ctx.createImageData(canvas.width, canvas.height);
  var dest_index = 0;
  var y_center = dest_data.height / 2;
  var x_center = dest_data.width / 2;
  var disp_scale = 1;
  if (!persp_project)
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

	if (!persp_project) {
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
	var src_y = ~~(latitude * src_data.height * inv_180);
	var src_x = ~~(longitude * src_data.width * inv_360);
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
}

/* This function just copies the backbuffer to the frontbuffer, with
   the correct shifting and scaling factors.  */
function render_map() {
  /* Compute the screen scale factor so that it corresponds to
     unwrapping the orthographically projected globe.  The width of
     the equirectangular map is stretched to `screen_scalfac'.  */
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
}

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
    else {
      ctx.moveTo(-par_width, 0); ctx.lineTo(par_width, 0);
    }
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
