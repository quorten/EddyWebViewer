/* A global object that contains the logical grouping of general
   view-related properties.  Also contains helper functions for
   processing mouse events.  */

import "oevns";
// import "projector"; // Circular includes
import "compat";

/**
 * A class that contains a logical grouping of view-related
 * parameters.  If a parameter is given, the given object is an
 * existing ViewParams object that is used to initialize the new
 * ViewParams object.
 * @constructor
 * @param existParams
 */
var ViewParams = function(existParams) {
  if (existParams) { this.init(existParams); return; }

  this.viewport = [ 32, 32 ];
  /** Viewport width / height */
  this.aspectXY = 1;
  /** [ longitude, latitude ] of center of view.  */
  this.polCenter = [ 0, 0 ];
  /** Current projection as a pointer to a Projector object.  */
  this.projector = null; // EquirectProjector;
  /** (Boolean) Clip projected points that exceed +/- 90/180 degrees.  */
  this.clip = true;
  /** 2D scale factor for map rendering.  */
  this.scale = 1;
  /** 1 / scale, used for improving performance.  */
  this.inv_scale = 1;
  /** [ x, y ] location that the 2D center of the projected map is
      shifted to, in relative coordinates.  This position is independent
      of the scale factor.  */
  this.mapCenter = [ 0, 0 ];

  /** Perspective field of view */
  this.perspFOV = 17.5;
  /** Perspective altitude in kilometers */
  this.perspAltitude = 35786;

  /** Zoom speed multiplier for mouse wheel scrolling by lines.  */
  this.lineZoomFac = 1.1 / 3;
  /** Zoom speed multiplier for mouse wheel scrolling by pixels.  */
  this.pixZoomFac = 1.1 / 60;

  /* FIXME: A good default for the pixel zoom factor is wildly
     different across systems.  A GUI configuration option might be a
     tolerable solution.  */
};

OEV.ViewParams = ViewParams;

/**
 * Initialize the current ViewParams object from the given ViewParams
 * object.
 */
ViewParams.prototype.init = function(existParams) {
  this.viewport = [ 32, 32 ];
  this.viewport[0] = existParams.viewport[0];
  this.viewport[1] = existParams.viewport[1];
  this.aspectXY = existParams.aspectXY;
  this.polCenter = [ 0, 0 ];
  this.polCenter[0] = existParams.polCenter[0];
  this.polCenter[1] = existParams.polCenter[1];
  this.projector = existParams.projector;
  this.clip = existParams.clip;
  this.scale = existParams.scale;
  this.inv_scale = existParams.inv_scale;

  this.perspFOV = existParams.perspFOV;
  this.perspAltitude = existParams.perspAltitude;
};

/**
 * A global object that contains the logical grouping of general
 * view-related properties, relevant to the entire application.
 */
var gViewParams = new ViewParams();
OEV.gViewParams = gViewParams;

// -------------------------------------------------------------------

/* Functions to help convert mouse movement events to globe or map
   panning.  */

/**
 * Connect a mouse panning functions to the given element, and call
 * the given callbacks when each mouse event is processed.
 * @param {Element} elmt - The element to connect the event processors
 * to.
 * @param {ViewParams} vp - The ViewParams object that should be
 * modified by the helper functions.
 * @param {function} moveFunc - The callback to call after the
 * `mousemove` or event has been internally processed.  The `event`
 * object is passed as a parameter, and the return value of the
 * callback is the return value of the event handler, which should
 * normally be `false`.
 * @param {function} relFunc - The callback to call after the
 * `mouseup` event has been internally processed.  The `event` object
 * is passed as a parameter, and the return value of the callback is
 * the return value of the event handler, which should normally be
 * `false`.
 * @param {function} zoomFunc - The callback to call after the `wheel`
 * event has been internally processed.  The `event` object is passed
 * as a parameter, and the return value of the callback is the return
 * value of the event handler, which should normally be `false`.
 */
var connectMouse = function(elmt, vp, moveFunc, relFunc, zoomFunc) {
  var handlers = makeMouseHandlers(vp, moveFunc, relFunc, zoomFunc);
  elmt.onmousedown = handlers.setMouseDown;
  if (!elmt.setCapture)
    window.onmousemove = handlers.panGlobe;
  else {
    elmt.onmousemove = handlers.panGlobe;
    elmt.onmouseup = handlers.setMouseUp;
  }
  addWheelListener(elmt, handlers.zoomGlobe);
};

OEV.connectMouse = connectMouse;

/**
 * Helper function for {@linkcode connectMouse}, used to prevent
 * memory leaks due to circular closure references.
 */
var makeMouseHandlers = function(vp, moveFunc, relFunc, zoomFunc) {
  var mouseDown = false;
  var buttonDown = 0;
  var topLeft = [ 0, 0 ];
  var firstPoint = [ 0, 0 ];
  var firstProjPoint = [ NaN, NaN ];
  var firstPolCenter = [ NaN, NaN ];
  var curPoint = [ 0, 0 ];
  var curProjPoint = [ NaN, NaN ];

  var oldLonRot;
  var oldTilt;

  var setMouseDown = function(event) {
    mouseDown = true;
    buttonDown = event.button;
    crossSetCapture(this, panGlobe, setMouseUp);
    MousePos_get(firstPoint, event);
    oldLonRot = vp.polCenter[0];
    if (vp.projector == EquirectProjector)
      oldTilt = -vp.mapCenter[1] * 180 / vp.scale;
    else oldTilt = vp.polCenter[1];

    topLeft[0] = this.clientLeft + this.offsetLeft;
    topLeft[1] = this.clientTop + this.offsetTop;
    firstPoint[0] -= topLeft[0];
    firstPoint[1] -= topLeft[1];

    firstProjPoint[0] = ((firstPoint[0] / gViewParams.viewport[0]) * 2 - 1 -
		         gViewParams.mapCenter[0]) *
                        gViewParams.inv_scale;
    firstProjPoint[1] = (-((firstPoint[1] / gViewParams.viewport[1]) * 2 - 1) /
		         gViewParams.aspectXY /* - gViewParams.mapCenter[1] */) *
                        gViewParams.inv_scale;
    gViewParams.projector.unproject(firstProjPoint);
    polShiftOrigin(firstProjPoint, -1);
    firstPolCenter[0] = gViewParams.polCenter[0];
    firstPolCenter[1] = gViewParams.polCenter[1];
  };

  var panGlobe = function(event) {
    if (!mouseDown)
      return;
    MousePos_get(curPoint, event);
    curPoint[0] -= topLeft[0];
    curPoint[1] -= topLeft[1];

    /* First try to unproject the point and compute the
       latitude/longitude difference between the first point and the
       current point.  If this is not possible, then revert back to
       the heuristic scale factor approach.  NOTE: The unprojection
       panning still isn't quite perfect.  */
    var lon, tilt;
    curProjPoint[0] = ((curPoint[0] / gViewParams.viewport[0]) * 2 - 1 -
		       gViewParams.mapCenter[0]) *
                      gViewParams.inv_scale;
    curProjPoint[1] = (-((curPoint[1] / gViewParams.viewport[1]) * 2 - 1) /
		       gViewParams.aspectXY /* - gViewParams.mapCenter[1] */) *
                      gViewParams.inv_scale;
    gViewParams.projector.unproject(curProjPoint);
    gViewParams.polCenter[0] = firstPolCenter[0];
    gViewParams.polCenter[1] = firstPolCenter[1];
    polShiftOrigin(curProjPoint, -1);

    if (!isNaN(firstProjPoint[0]) && !isNaN(curProjPoint[0])) {
      lon = oldLonRot + firstProjPoint[0] - curProjPoint[0];
      tilt = oldTilt + firstProjPoint[1] - curProjPoint[1];
    } else {
      var projScale = 360;
      if (vp.projector == OrthoProjector ||
	  vp.projector == PerspProjector)
	projScale = 180;
      lon = oldLonRot + (firstPoint[0] - curPoint[0]) /
        (vp.viewport[0] * vp.scale) * projScale;
      tilt = oldTilt - (firstPoint[1] - curPoint[1]) /
        (vp.viewport[1] * vp.aspectXY * vp.scale) * projScale;
    }

    lon %= 360;
    if (lon >= 180) lon = -360 + lon;
    else if (lon < -180) lon = 360 + lon;
    if (tilt > 90) tilt = 90;
    if (tilt < -90) tilt = -90;

    if (!isNaN(lon) && !isNaN(tilt)) {
      vp.polCenter[0] = lon;
      /* NOTE: Currently, we don't have a clean way in the GUI for the
	 user to specify whether vertical pan motion should be tilting
	 or 2D shifting, so we use this heuristic that favors fast
	 equirectangular projection.  */
      if (vp.projector == EquirectProjector) {
	vp.mapCenter[1] = -tilt / 180 * vp.scale;
	if (isNaN(vp.mapCenter[1])) vp.mapCenter[1] = 0;
	vp.polCenter[1] = 0;
      } else { vp.mapCenter[1] = 0; vp.polCenter[1] = tilt; }

      return moveFunc(event);
    } /* else
      No change: The calculated latitude and longitude was invalid,
      probably because of an outrageous scale factor.  */

    /* if (ptMSIE <= 6 && ptMSIE > 0)
       event.cancelBubble = true; */
    return false; // Cancel the default, or at least attempt to do so.
  };

  var zoomGlobe = function(event) {
    if (!event) event = window.event;
    var factor = 1;
    if (event.deltaMode == 0x01) { // DOM_DELTA_LINE
      if (event.deltaY < 0)
	factor *= event.deltaY * -vp.lineZoomFac;
      else factor /= event.deltaY * vp.lineZoomFac;
    } else if (event.deltaMode == 0x00) { // DOM_DELTA_PIXEL
      if (event.deltaY < 0)
	factor *= event.deltaY * -vp.pixZoomFac;
      else factor /= event.deltaY * vp.pixZoomFac;
    }

    if (vp.projector != PerspProjector) {
      var oldScale = vp.scale;
      vp.scale *= factor;
      if (vp.scale > 32767)
	{ vp.scale = 32767; factor = vp.scale / oldScale; }
      /* The following limit occurs naturally from these algorithms:
      if (vp.scale < 1e-323)
        { vp.scale = 1e-323; factor = vp.scale / oldScale; } */
      vp.inv_scale = 1 / vp.scale;
      /* Assuming the user wants the 2D center of the view to
	 correspond to the same latitude and longitude...  */
      vp.mapCenter[0] *= factor;
      vp.mapCenter[1] *= factor;
      if (isNaN(vp.mapCenter[0])) vp.mapCenter[0] = 0;
      if (isNaN(vp.mapCenter[1])) vp.mapCenter[1] = 0;
      if (vp.projector == EquirectProjector) {
	vp.mapCenter[0] = 0;
	if (vp.mapCenter[1] < -0.5 * vp.scale)
	  vp.mapCenter[1] = -0.5 * vp.scale;
	else if (vp.mapCenter[1] > 0.5 * vp.scale)
	  vp.mapCenter[1] = 0.5 * vp.scale;
      }
    } else {
      vp.perspFOV /= factor;
      /* if (vp.perspFOV < 0) vp.perspFOV = -vp.perspFOV; */
      if (vp.perspFOV > 179) vp.perspFOV = 179;
    }

    if (!zoomFunc(event) /* && typeof() == "boolean" */) {
      event.preventDefault();
      return false;
    }
    return true;
  };

  var setMouseUp = function(event) {
    mouseDown = false;
    crossReleaseCapture();
    return relFunc(event);
  };

  return {
    setMouseDown: setMouseDown,
    panGlobe: panGlobe,
    zoomGlobe: zoomGlobe
  };
};
