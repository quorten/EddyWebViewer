// Global variables for this module only
var canvas;
var ctx;

var earth_buffer;
var ec;
var earth_tex;
var ssh_tex;
var eddyTracks;
var src_data;

var httpRequest;

var rotating = 0;
var render_in_prog = false;

// GUI parameters

// longitude rotation
var lon_rot = 180;
// globe tilt
var tilt = 0;
// perspective or orthographic projection?
var persp_project = false;
// Equirectangular projection?
var equirect_project = false;
// orthographic globe scale
var scale = 1.0;
// perspective altitude
var persp_altitude = 35786;
// perspective field of view
var persp_fov = 19.0;
// Render the sea surface height data
var render_ssh = true;
// Render textured land masses
var render_land_tex = true;

function initCTModule() {
  var drawingContainer = document.getElementById('drawingContainer');
  canvas = document.getElementById('drawingPad');
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.id = 'drawingPad';
    canvas.style.cssText = 'display: none';
    drawingContainer.appendChild(canvas);
  }
  ctx = canvas.getContext('2d');

  // Resize canvas to fit CSS allocated space.
  // Warning: clientWidth and clientHeight marked as unstable in MDN.
  canvas.width = drawingContainer.clientWidth;
  canvas.height = drawingContainer.clientHeight;
  // window.innerWidth, window.innerHeight

  // Create a backbuffer canvas to pull pixels from.
  earth_buffer = document.createElement('canvas');
  earth_buffer.id = 'earth_buffer';
  initOverlay();
}

function finishStartup() {

  if (httpRequest.readyState === 4) {
    if (httpRequest.status === 200) {

      var ajaxDebug = document.getElementById('ajaxDebug');
      if (ajaxDebug)
        ajaxDebug.innerHTML = httpRequest.responseText;

      eddyTracks = JSON.parse(httpRequest.responseText);
      // alert(eddyTracks[0].coordinates[0].lon);

      refreshOverlay();
      pointerTestInit();
    } else {
      // alert('There was a problem with the request.');
    }
  }
}

// NOTE: Verify if HTML 5 style image loading works with IE6.
function initOverlay() {
  // WARNING: Large image loading is slow.
  earth_tex = new Image();
  earth_tex.onload = function () {
    earth_buffer.width = earth_tex.width;
    earth_buffer.height = earth_tex.height;
    ec = earth_buffer.getContext('2d');
    // ec.drawImage(earth_tex, 0, 0, earth_buffer.width, earth_buffer.height);

    ssh_tex = new Image();
    ssh_tex.onload = function() {
      // ec.drawImage(ssh_tex, 0, 0, earth_buffer.width, earth_buffer.height);

      { // Load the eddy tracks.
        // var httpRequest;
        if (window.XMLHttpRequest) // Mozilla, Safari, ...
          httpRequest = new XMLHttpRequest();
        else if (window.ActiveXObject) // IE 8 and older
          httpRequest = new ActiveXObject("Microsoft.XMLHTTP");
          // Plus we would need lots of error handling...
        if (!httpRequest) {
          alert('Could not create an XMLHttpRequest.');
          // return;
        }
        httpRequest.onreadystatechange = finishStartup;
        httpRequest.open('GET', '../web_eddy_viewer_test/eddy_tracks.json', true);
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
    var drawingContainer = document.getElementById('drawingContainer');
    drawingContainer.onkeydown = keyEvent;
    drawingContainer.onmousedown = function() {
      if (!rotating) rotating = window.setTimeout(periodic_render, 10);
      else rotating = 0;
    };
  } */

// Refresh the backbuffer with any possible UI changes taking effect.
function refreshOverlay() {
  ec.clearRect(0, 0, earth_buffer.width, earth_buffer.height);

  if (render_land_tex)
    ec.drawImage(earth_tex, 0, 0, earth_buffer.width, earth_buffer.height);

  if (render_ssh)
    ec.drawImage(ssh_tex, 0, 0, earth_buffer.width, earth_buffer.height);

  // Render the eddy tracks.
  ec.lineWidth = 5;
  ec.strokeStyle = '#ff8000';
  ec.lineJoin = 'round';
  for (var i = 0; i < eddyTracks.length; i++) {
    ec.beginPath();
    var lon = eddyTracks[i].coordinates[0].lon;
    var lat = eddyTracks[i].coordinates[0].lat;
    var map_x = (lon + 180) / 360 * earth_buffer.width;
    var map_y = (90 - lat) / 180 * earth_buffer.height;
    ec.moveTo(map_x, map_y);
    for (var j = 1; j < eddyTracks[i].coordinates.length; j++) {
      lon = eddyTracks[i].coordinates[j].lon;
      lat = eddyTracks[i].coordinates[j].lat;
      map_x = (lon + 180) / 360 * earth_buffer.width;
      map_y = (90 - lat) / 180 * earth_buffer.height;
      ec.lineTo(map_x, map_y);
    }
    ec.stroke();
  }

  /* Draw a V that looks like a heart when projected onto a globe
     to finish off.  */
  /* ec.lineWidth = 20;
  ec.strokeStyle = '#800000';
  ec.beginPath();
  ec.moveTo(0, 0);
  ec.lineTo(earth_buffer.width / 2, earth_buffer.height / 2);
  ec.lineTo(earth_buffer.width, 0);
  ec.stroke();
  ec.strokeStyle = '#00ff00'; */

  try {
    src_data = ec.getImageData(0, 0, earth_buffer.width,
			       earth_buffer.height);
  } catch (e) {
    alert('Error: Cannot read pixels from image buffer.');
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
  mouseDown = true;
  buttonDown = event.button;
  firstPoint.x = event.clientX; firstPoint.y = event.clientY;
  if (!topLeft.x) {
    topLeft.x = firstPoint.x - canvas.width / 2;
    topLeft.y = firstPoint.y - canvas.height / 2;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
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

  var ctx = canvas.getContext('2d');

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
  var equirect_scale_x = 1;
  var equirect_scale_y = 1;
  if (!persp_project)
    pan_scale = scale;
  else
    pan_scale = 1; // TODO: Do more complicated calculation
  if (equirect_project) {
    equirect_scale_x = 2;
    equirect_scale_y = 2 * canvas.height / canvas.width;
  }
  lon_rot = old_lon_rot + (firstPoint.x - event.clientX) /
    canvas.width / pan_scale * equirect_scale_x * 180;
  tilt = old_tilt - (firstPoint.y - event.clientY) /
    canvas.height / pan_scale * equirect_scale_y * 180;

  if (tilt > 90) tilt = 90;
  if (tilt < -90) tilt = -90;
  while (lon_rot < 0) lon_rot += 360;
  while (lon_rot >= 360) lon_rot -= 360;

  var gui_latLon = document.getElementById('gui.latLon');
  if (gui_latLon) {
    gui_latLon.value = tilt.toFixed(3) + ' N ' +
      (lon_rot - 180).toFixed(3) + ' E';
  }

  // TODO: This should use a queue_render_job() function so that
  // multiple events don't get bottled up and make the UI slow.
  render_globe();

  if (ptMSIE <= 6 && ptMSIE > 0)
    event.cancelBubble = true;
  return false; // Cancel the default, or at least attempt to do so.
}

function setMouseUp(event) {
  mouseDown = false;
  render_globe();
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
    var gui_zoomFac = document.getElementById('gui.zoomFac');
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
    var gui_perspFOV = document.getElementById('gui.perspFOV');
    if (gui_perspFOV) gui_perspFOV.value = persp_fov;
  }

  render_globe();
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
    document.getElementById("scriptWrapper") ? "wheel" : // Standardized
    document.onmousewheel !== undefined ? "mousewheel" : // Webkit and IE
    "DOMMouseScroll"; // Assume that remaining browsers are older Firefox

  /* oev. */ addWheelListener = function(elem, callback, useCapture) {
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

function pointerTestInit() {
  var loadingScreen = document.getElementById('loadingScreen');
  if (loadingScreen)
    loadingScreen.style.cssText = 'display: none';
  canvas.style.cssText = '';
  canvas.onmousedown = setMouseDown;
  canvas.onmousemove = panGlobe;
  canvas.onmouseup = setMouseUp;
  // canvas.onwheel = zoomGlobe;
  addWheelListener(canvas, zoomGlobe);

  ctx.font = '12pt Sans';
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#000000';
  ctx.fillText('Calibrate, please!', 10, ~~(canvas.height / 4));
  ctx.fillText('Click on the dot in the center.',
	       10, ~~(canvas.height * 3 / 4));
  ctx.fillRect(~~(canvas.width / 2),
    ~~(canvas.height / 2), 1, 1);
}

// ----------------------------------------

// TODO: This function should be a tile-based rendering engine that
// gets called from a callback to complete the render.  In general,
// JavaScript cannot support threads.
function render_globe() {
  if (equirect_project)
    return render_map();
  if (render_in_prog)
    return;
  render_in_prog = true;
  // Project and render the image.
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
      /* 1. Get the 3D rectangular coordinate of the ray intersection
            with the sphere.  The camera is looking down the negative
            z axis.  */
      var r3src_x, r3src_y, r3src_z;

      if (!persp_project) {
        // Orthographic projection
        r3src_y = (y - y_center) / disp_rad;
        r3src_x = (x - x_center) / disp_rad;
        r3src_z = Math.sin(Math.acos(Math.sqrt(Math.pow(r3src_x, 2) +
                                               Math.pow(r3src_y, 2))));
      } else {
        // Perspective projection
        // r must be one in the current algorithm
        var r = 1; // 6371; // radius of the earth in kilometers
        var d = persp_altitude / 6371; // 35786; // altitude in kilometers
        // focal length in units of the screen dimensions
        var f = 1 / Math.tan(persp_fov * Math.PI / 180 / 2);
        var x_pix = (x - x_center) / disp_rad;
        var y_pix = (y - y_center) / disp_rad;

        var w = (Math.pow(x_pix, 2) + Math.pow(y_pix, 2)) / Math.pow(f, 2);

        var a = 1 + w;
        var b = -2 * w * (r + d);
        var c = w * Math.pow(r + d, 2) - Math.pow(r, 2);

        r3src_z = (-b + Math.sqrt(Math.pow(b, 2) - 4 * a * c)) / (2 * a);
        r3src_x = -x_pix / f * (r3src_z - (r + d));
        r3src_y = -y_pix / f * (r3src_z - (r + d));
      }

      /* 2. Inverse rotate this coordinate around the x axis by the
            current globe tilt.  */
      var i_tilt = -tilt * Math.PI / 180;
      var cos_tilt = Math.cos(i_tilt); var sin_tilt = Math.sin(i_tilt);
      var r3dest_x, r3dest_y, r3dest_z;
      r3dest_x = r3src_x;
      r3dest_z = r3src_z * cos_tilt - r3src_y * sin_tilt;
      r3dest_y = r3src_z * sin_tilt + r3src_y * cos_tilt;

      /* 3. Measure the latitude and longitude of this coordinate.  */
      var latitude = Math.asin(r3dest_y);
      var longitude = Math.atan2(r3dest_x, r3dest_z);

      /* 4. Convert from radians to degrees.  */
      latitude = latitude * 180 / Math.PI;
      longitude = longitude * 180 / Math.PI;

      /* 5. Inverse shift by the longitudinal rotation around the pole.  */
      longitude += lon_rot;

      /* 6. Verify that the coordinates are in bounds.  */
      latitude += 90;
      if (latitude < 0) latitude = 0;
      if (latitude > 180) latitude = 180;
      while (longitude < 0) {
        longitude += 360;
      }
      while (longitude >= 360) {
        longitude -= 360;
      }

      if (!isNaN(latitude) && !isNaN(longitude)) {
        var src_y = ~~(latitude * src_data.height / 180);
        var src_x = ~~(longitude * src_data.width / 360);
        if (src_y == src_data.height)
          src_y -= 1;
        var src_index = (src_data.width * src_y + src_x) * 4;
        dest_data.data[dest_index++] = src_data.data[src_index++];
        dest_data.data[dest_index++] = src_data.data[src_index++];
        dest_data.data[dest_index++] = src_data.data[src_index++];
        dest_data.data[dest_index++] = src_data.data[src_index++];
        continue;
      } else {
        dest_data.data[dest_index++] = 255;
        dest_data.data[dest_index++] = 0;
        dest_data.data[dest_index++] = 0;
        dest_data.data[dest_index++] = 0;
      }
    }
  }

  ctx.putImageData(dest_data, 0, 0);
  render_in_prog = false;
}

/* This function just copies the backbuffer to the frontbuffer, with
   the correct shifting and scaling factors.  */
function render_map() {
  if (render_in_prog)
    return;
  render_in_prog = true;

  var screen_scalfac = canvas.width * scale;
  var x_shift = (180 - lon_rot) / 360 * screen_scalfac - screen_scalfac / 2;
  var y_shift = tilt / 360 * screen_scalfac - screen_scalfac / 4;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(earth_buffer, 0, 0, earth_buffer.width, earth_buffer.height,
		x_shift + canvas.width / 2,
                y_shift + canvas.height / 2,
                screen_scalfac, screen_scalfac / 2);

  // Draw a second image for a continuous wrapped display.
  if (lon_rot == 180) {
    render_in_prog = false;
    return;
  }
  if (lon_rot < 180) x_shift -= screen_scalfac;
  if (lon_rot > 180) x_shift += screen_scalfac;

  /* NOTE: Since JavaScript has a performance disadvantage compared to
     compiled C code, it might actually be faster to just skip all
     these visibility tests.  */
  var real_x_shift = x_shift + canvas.width / 2;
  /* if (real_x_shift + screen_scalfac < 0 || real_x_shift > canvas.width) {
    render_in_prog = false;
    return;
  } */

  ctx.drawImage(earth_buffer, 0, 0, earth_buffer.width, earth_buffer.height,
		real_x_shift,
                y_shift + canvas.height / 2,
                screen_scalfac, screen_scalfac / 2);

  render_in_prog = false;
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
