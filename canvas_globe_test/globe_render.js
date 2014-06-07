// Global variables for this module only
var drawingContainer;
var canvas;

var earth_buffer;
var backbuf_scale = 1;
var earth_tex;
var ssh_tex;
var eddyTracks;
var eddy_imgbuf;
var src_data;

var httpRequest;

var rotating = 0;
var render_in_prog = false;
// A render queue that can store up to one pending job.
var render_queue = false;

// GUI parameters

// longitude rotation
var lon_rot = 180;
// globe tilt
var tilt = 0;
// perspective or orthographic projection?
var persp_project = false;
// Equirectangular projection?
var equirect_project = false;
// Wireframe graticule rendering?
var wire_render = false;
// Graticule density in degrees
var grat_density = 15;
// orthographic globe scale
var scale = 1.0;
// perspective altitude
var persp_altitude = 35786;
// perspective field of view
var persp_fov = 17.5;
// Oversampling factor
var osa_factor = 1;
// Render the sea surface height data
var render_ssh = true;
// Render textured land masses
var render_land_tex = true;
// Minimum track length, -1 for any.
var min_track_len = -1;
// Maximum track length, -1 for any.
var max_track_len = -1;

// Convenience variables for rendering.
var DEG2RAD = Math.PI / 180;
var RAD2DEG = 180 / Math.PI;
var inv_180 = 1 / 180;
var inv_360 = 1 / 360;
var inv_osa_factor = 1 / osa_factor;

/* Resize the frontbuffer canvas to fit the CSS allocated space.

   NOTE: Because modern browsers do not provide an event that fires if
   the width or height of a CSS element has changed, this function
   must be called every time the screen is updated via one of the
   render() functions.  */
function fitCanvasToCntr() {
  // var drawingContainer = document.getElementById("drawingContainer");
  // Warning: clientWidth and clientHeight marked as unstable in MDN.
  if (canvas.width == drawingContainer.width &&
      canvas.height == drawingContainer.height)
    return;
  canvas.width = drawingContainer.clientWidth;
  canvas.height = drawingContainer.clientHeight;
  // window.innerWidth, window.innerHeight
}

function initCTModule() {
  /* var */ drawingContainer = document.getElementById("drawingContainer");
  canvas = document.getElementById("drawingPad");
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.id = "drawingPad";
    canvas.style.cssText = "display: none";
    drawingContainer.appendChild(canvas);
  }

  fitCanvasToCntr();

  // Create a backbuffer canvas to pull pixels from.
  earth_buffer = document.createElement("canvas");
  earth_buffer.id = "earth_buffer";
  initOverlay();
}

function finishStartup() {

  if (httpRequest.readyState === 4) {
    if (httpRequest.status === 200) {

      var ajaxDebug = document.getElementById("ajaxDebug");
      if (ajaxDebug)
        ajaxDebug.innerHTML = httpRequest.responseText;

      eddyTracks = JSON.parse(httpRequest.responseText);

      renderEddyTracks();
      refreshOverlay();
      pointerTestInit();
    } else {
      alert("There was a problem with the request.");
    }
  }
}

// NOTE: Verify if HTML 5 style image loading works with IE6.
// Works with Firefox 3.6.
function initOverlay() {
  // WARNING: Large image loading is slow.
  earth_tex = new Image();
  earth_tex.onload = function () {
    earth_buffer.width = earth_tex.width * backbuf_scale;
    earth_buffer.height = earth_tex.height * backbuf_scale;

    ssh_tex = new Image();
    ssh_tex.onload = function() {
      eddy_imgbuf = document.createElement("canvas");
      eddy_imgbuf.width = earth_buffer.width;
      eddy_imgbuf.height = earth_buffer.height;

      { // Load the eddy tracks.
        // var httpRequest;
        if (window.XMLHttpRequest) // Mozilla, Safari, ...
          httpRequest = new XMLHttpRequest();
        else if (window.ActiveXObject) // IE 8 and older
          httpRequest = new ActiveXObject("Microsoft.XMLHTTP");
          // Plus we would need lots of error handling...
        if (!httpRequest) {
          alert("Could not create an XMLHttpRequest.");
          // return;
        }
        httpRequest.onreadystatechange = finishStartup;
        httpRequest.open("GET", "../web_eddy_viewer_test/eddy_tracks.json", true);
        httpRequest.send();
      }
    }
    ssh_tex.src = "../web_eddy_viewer_test/test_grs2rgb.png";
  }
  /* NOTE: The equirectangular map projection of the Earth land
     masses was from Wikipedia:
     http://en.wikipedia.org/wiki/File:Equirectangular_projection_SW.jpg

     The PNG version had the black surrounding border trimmed off.
  */
  earth_tex.src = "../canvas_globe_test/Equirectangular_projection_SW.png";
}

  /* {
    var drawingContainer = document.getElementById("drawingContainer");
    drawingContainer.onkeydown = keyEvent;
    drawingContainer.onmousedown = function() {
      if (!rotating) rotating = window.setTimeout(periodic_render, 10);
      else rotating = 0;
    };
  } */

/* Compute the great circle distance between two latitude-longitude
   polar coordinates.  */
function gCircLen(p1, p2) {
  var dlat = Math.abs((p2.lat - p1.lat) * DEG2RAD);
  var dlon = Math.abs((p2.lon - p1.lon) * DEG2RAD);
  var dsigma = 2 * Math.asin(Math.sqrt(Math.pow(Math.sin(dlat / 2), 2) +
				       Math.cos(p1.lat * DEG2RAD) *
				       Math.cos(p2.lat * DEG2RAD) *
				       Math.pow(Math.sin(dlon / 2), 2)));
  var r = 6371; // mean radius of Earth in kilometers
  return r * dsigma;
}

function renderEddyTracks() {
  var edc = eddy_imgbuf.getContext("2d");
  edc.clearRect(0, 0, eddy_imgbuf.width, eddy_imgbuf.height);
  edc.lineWidth = backbuf_scale;
  edc.strokeStyle = "#800080";
  edc.lineJoin = "round";
  for (var i = 0; i < eddyTracks.length; i++) {
    if (min_track_len > 0 || max_track_len != -1) {
      /* Compute the length of the track to determine if it should be
         drawn.  */
      var track_len = 0;
      for (var j = 1; j < eddyTracks[i].coordinates.length; j++) {
	track_len += gCircLen(eddyTracks[i].coordinates[j-1],
			      eddyTracks[i].coordinates[j]);
      }
      /* NOTE: Since some of the eddy tracks are considerably
         twisted, we only compute the straight line distance from the
         beginning of the track to the end of the track.  */
      /* var track_len = gCircLen(eddyTracks[i].coordinates[0],
	   eddyTracks[i].coordinates[eddyTracks[i].coordinates.length-1]); */
      if (track_len < min_track_len)
	continue;
      if (max_track_len != -1 && track_len > max_track_len)
	continue;
    }

    edc.beginPath();
    var lon = eddyTracks[i].coordinates[0].lon;
    var lat = eddyTracks[i].coordinates[0].lat;
    var map_x = (lon + 180) * inv_360 * earth_buffer.width;
    var map_y = (90 - lat) * inv_180 * earth_buffer.height;
    edc.moveTo(map_x, map_y);
    for (var j = 1; j < eddyTracks[i].coordinates.length; j++) {
      lon = eddyTracks[i].coordinates[j].lon;
      lat = eddyTracks[i].coordinates[j].lat;
      map_x = (lon + 180) * inv_360 * earth_buffer.width;
      map_y = (90 - lat) * inv_180 * earth_buffer.height;
      edc.lineTo(map_x, map_y);
    }
    edc.stroke();
  }
}

// Refresh the backbuffer with any possible UI changes taking effect.
function refreshOverlay() {
  var ec = earth_buffer.getContext("2d");
  ec.clearRect(0, 0, earth_buffer.width, earth_buffer.height);

  if (render_land_tex)
    ec.drawImage(earth_tex, 0, 0, earth_buffer.width, earth_buffer.height);

  if (render_ssh)
    ec.drawImage(ssh_tex, 0, 0, earth_buffer.width, earth_buffer.height);

  ec.drawImage(eddy_imgbuf, 0, 0, earth_buffer.width, earth_buffer.height);

  /* Draw a V that looks like a heart when projected onto a globe
     to finish off.  */
  /* ec.lineWidth = 20;
  ec.strokeStyle = "#800000";
  ec.beginPath();
  ec.moveTo(0, 0);
  ec.lineTo(earth_buffer.width / 2, earth_buffer.height / 2);
  ec.lineTo(earth_buffer.width, 0);
  ec.stroke();
  ec.strokeStyle = "#00ff00"; */

  try {
    src_data = ec.getImageData(0, 0, earth_buffer.width,
			       earth_buffer.height);
  } catch (e) {
    alert("Error: Cannot read pixels from image buffer.");
    throw new Error("unable to access image data: " + e);
  }
}

// ----------------------------------------

/* Return Microsoft Internet Explorer (major) version number, or 0 for
   others.  This function works by finding the "MSIE " string and
   extracting the version number following the space, up to the
   semicolon.  */
function msieVersion() {
  var ua = window.navigator.userAgent;
  var msie = ua.indexOf("MSIE ");

  if (msie > 0)
    return parseFloat (ua.substring(msie + 5, ua.indexOf(";", msie)));
  return 0; // is a different browser
}

var mouseDown = false;
var buttonDown = 0;
var firstPoint = {};
var topLeft = {};
var ptMSIE = msieVersion();
firstPoint.x = 0; firstPoint.y = 0;

var old_lon_rot;
var old_tilt;

function setMouseDown(event) {
  if (ptMSIE <= 6 && ptMSIE > 0)
    event = window.event;

  if (this.setCapture) {
    this.setCapture();
  }
  else
    window.onmouseup = setMouseUp;

  mouseDown = true;
  buttonDown = event.button;
  firstPoint.x = event.clientX; firstPoint.y = event.clientY;
  if (!topLeft.x) {
    topLeft.x = firstPoint.x - canvas.width / 2;
    topLeft.y = firstPoint.y - canvas.height / 2;
    var ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  old_lon_rot = lon_rot;
  old_tilt = tilt;
}

function panGlobe(event) {
  if (!mouseDown)
    return;
  if (ptMSIE <= 6 && ptMSIE > 0)
    event = window.event;

  var ctx = canvas.getContext("2d");

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
  if (!persp_project)
    pan_scale = scale;
  else
    pan_scale = 1; // TODO: Do more complicated calculation
  if (equirect_project) {
    var disp_rad = Math.min(canvas.width, canvas.height) * scale / 2.0;
    var screen_scalfac = disp_rad * 2 * Math.PI;
    equirect_x_scale = 1;
  }
  lon_rot = old_lon_rot + (firstPoint.x - event.clientX) /
    canvas.width / pan_scale * equirect_x_scale * 180;
  tilt = old_tilt - (firstPoint.y - event.clientY) /
    canvas.height / pan_scale * 180;

  if (tilt > 90) tilt = 90;
  if (tilt < -90) tilt = -90;
  while (lon_rot < 0) lon_rot += 360;
  while (lon_rot >= 360) lon_rot -= 360;

  var gui_latLon = document.getElementById("gui.latLon");
  if (gui_latLon) {
    gui_latLon.value = tilt.toFixed(3) + " N " +
      (lon_rot - 180).toFixed(3) + " E";
  }

  render_globe();

  if (ptMSIE <= 6 && ptMSIE > 0)
    event.cancelBubble = true;
  return false; // Cancel the default, or at least attempt to do so.
}

function setMouseUp(event) {
  mouseDown = false;
  render_globe();
  window.onmouseup = null;
  return false;
}

function zoomGlobe(event) {
  if (!persp_project) {
    if (event.deltaMode == 0x01) { // DOM_DELTA_LINE
      if (event.deltaY < 0)
        scale *= (event.deltaY / 3) * -1.1;
      else
        scale /= (event.deltaY / 3) * 1.1;
    } else if (event.deltaMode == 0x00) { // DOM_DELTA_PIXEL
      if (event.deltaY < 0)
        scale *= (event.deltaY / 53) * -1.1;
      else
        scale /= (event.deltaY / 53) * 1.1;
    }
    var gui_zoomFac = document.getElementById("gui.zoomFac");
    if (gui_zoomFac) gui_zoomFac.value = scale;
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
    var gui_perspFOV = document.getElementById("gui.perspFOV");
    if (gui_perspFOV) gui_perspFOV.value = persp_fov;
  }

  render_globe();
  event.preventDefault();
  return false;
}

/* creates an "addWheelListener" method
   example: oev.addWheelListener(elem, function(e) {
     console.log(e.deltaY); e.preventDefault(); } ); */
(function(window, document) {

  var prefix = "", _addEventListener, onwheel, support;

  // Detect the event model.
  if (window.addEventListener) {
    _addEventListener = "addEventListener";
  } else {
    _addEventListener = "attachEvent";
    prefix = "on";
  }

  // Detect an available wheel event.
  support = "onwheel" in
    document.createElement("div") ? "wheel" : // Standardized
    document.onmousewheel !== undefined ? "mousewheel" : // Webkit and IE
    "DOMMouseScroll"; // Assume that remaining browsers are older Firefox

  /* oev. */ document.addWheelListener = function(elem, callback, useCapture) {
    _addWheelListener(elem, support, callback, useCapture);

    // Handle MozMousePixelScroll in older Firefox.
    if( support == "DOMMouseScroll" ) {
      _addWheelListener(elem, "MozMousePixelScroll", callback, useCapture);
    }
  };

  function _addWheelListener(elem, eventName, callback, useCapture) {
    elem[_addEventListener](prefix + eventName, support == "wheel" ?
      callback : function(originalEvent) {
	!originalEvent && (originalEvent = window.event);

	// Create a normalized event object.
	var event = {
	  // Keep a reference to the original event object.
	originalEvent: originalEvent,
	target: originalEvent.target || originalEvent.srcElement,
	type: "wheel",
	deltaMode: originalEvent.type == "MozMousePixelScroll" ? 0 : 1,
	deltaX: 0,
	delatZ: 0,
	preventDefault: function() {
	    originalEvent.preventDefault ?
	    originalEvent.preventDefault() :
	    originalEvent.returnValue = false;
	  }
	};

	// Calculate deltaY (and deltaX) according to the event.
	if (support == "mousewheel") {
	  event.deltaY = - 1/40 * originalEvent.wheelDelta;
	  // Webkit also support wheelDeltaX
	  originalEvent.wheelDeltaX && (event.deltaX = - 1/40 *
					originalEvent.wheelDeltaX);
	} else {
	  event.deltaY = originalEvent.detail;
	}

	// It's time to fire the callback.
	return callback(event);

      }, useCapture || false);
  }

 })(window, document);

/* NOTE: Avoid assigning directly to the window object, this may not
   work well on all browsers.  */
(function() {
  var lastTime = 0;
  var vendors = ['webkit', 'moz'];
  for(var x = 0; x < vendors.length && !window.requestAnimationFrame; ++x) {
    window.requestAnimationFrame = window[vendors[x]+'RequestAnimationFrame'];
    window.cancelAnimationFrame = window[vendors[x]+'CancelAnimationFrame'] ||
      window[vendors[x]+'CancelRequestAnimationFrame'];
  }

  if (!window.requestAnimationFrame)
    window.requestAnimationFrame = function(callback) {
      return setTimeout(callback, 20);
    };
    /* window.requestAnimationFrame = function(callback, element) {
      var currTime = new Date().getTime();
      var timeToCall = Math.max(0, 16 - (currTime - lastTime));
      var id = window.setTimeout(
	function() { callback(currTime + timeToCall); },
				 timeToCall);
      lastTime = currTime + timeToCall;
      return id;
    }; */

  if (!window.cancelAnimationFrame)
    window.cancelAnimationFrame = function(id) {
      clearTimeout(id);
    };
 }());

function pointerTestInit() {
  var loadingScreen = document.getElementById("loadingScreen");
  if (loadingScreen)
    loadingScreen.style.cssText = "display: none";
  canvas.style.cssText = "";
  canvas.onmousedown = setMouseDown;
  if (!canvas.setCapture) {
    window.onmousemove = panGlobe;
  }
  else {
    canvas.onmousemove = panGlobe;
    canvas.onmouseup = setMouseUp;
    /* Sadly, "loosecapture" does not work on Firefox, even though
       setCapture() does.  */
  }
  document.addWheelListener(canvas, zoomGlobe);
  // window.onkeydown = keyEvent;

  var ctx = canvas.getContext("2d");
  ctx.font = "12pt Sans";
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#000000";
  ctx.fillText("Calibrate, please!", 10, ~~(canvas.height / 4));
  ctx.fillText("Click on the dot in the center.",
	       10, ~~(canvas.height * 3 / 4));
  ctx.fillRect(~~(canvas.width / 2),
    ~~(canvas.height / 2), 1, 1);
}

/* Try to allocate a new render job.  This will either preempt an
   existing job or deny rendering if preemption is disabled.  Returns
   true if the render job can proceed, false if rendering is
   denied.  */
function allocRenderJob() {
  if (render_in_prog) {
    render_queue = true;
    return false;
  }
  render_in_prog = true;
  requestAnimationFrame(freeRenderJob);
  return true;
}

function freeRenderJob() {
  render_in_prog = false;
  if (render_queue) {
    render_queue = false;
    return render_globe();
  }
}

// ----------------------------------------

// TODO: This function should be a tile-based rendering engine that
// gets called from a callback to complete the render.  In general,
// JavaScript cannot support threads.
function render_globe() {
  if (!allocRenderJob())
    return;
  fitCanvasToCntr();
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
  ctx.drawImage(earth_buffer, 0, 0, earth_buffer.width, earth_buffer.height,
		x_shift + canvas.width / 2,
                y_shift + canvas.height / 2,
                screen_scalfac, screen_scalfac / 2);

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
  ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.strokeStyle = 'rgba(128, 128, 128, 0.5)';
  ctx.lineWidth = scale;
  // ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.translate(x_shift + canvas.width / 2, y_shift + canvas.height / 2);
  // ctx.fillRect(0, 0, screen_scalfac, screen_scalfac / 2);

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
  // ctx.fillRect(0, 0, screen_scalfac, screen_scalfac / 2);

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

function periodic_render() {
  if (!rotating)
    return;
  lon_rot += 5;
  render_globe();
  if (rotating)
    return rotating = setTimeout(periodic_render, 10);
}

function keyEvent (event) {
  /* if (event.defaultPrevented) {
    return; // Should do nothing if the key event was already consumed.
  } */

  switch (event.code) {
    case "KeyA":
      lon_rot -= 5;
      break;
    case "KeyD":
      lon_rot += 5;
      break;
    case "KeyS":
      lat_rot -= 5;
      break;
    case "KeyW":
      lat_rot += 5;
      break;
    default:
      return;
  }

  render_globe();
}
