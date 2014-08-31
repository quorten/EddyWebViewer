/* Graticule render layer.  */

import "oevns";
import "renderlayer";
import "projector";
import "viewparams";
import "trackslayer";

/**
 * Pseudo-namespace for objects in `gratlayer.js`.
 * @namespace GratLayerJS
 */

/**
 * This object has many important parameters for GratLayer rendering.
 * However, they do not show up in the JSDocs.  See the source code
 * for these details.
 * @memberof GratLayerJS
 */
var GratParams = {};
OEV.GratParams = GratParams;

/** Density of parallels in degrees per line.  */
GratParams.latDensity = 15;

/** Density of meridians in degrees per line.  */
GratParams.lonDensity = 15;

/********************************************************************/

/**
 * Specialized GratLayer implementation that draws an equirectangular
 * graticule with clipping.
 * @memberof GratLayerJS
 * @type RenderLayer
 */
var EquiGratLayer = new RenderLayer();
OEV.EquiGratLayer = EquiGratLayer;

EquiGratLayer.initCtx = function() {
  this.retVal = 0;
  this.status.returnType = CothreadStatus.PREEMPTED;
  this.status.preemptCode = 0;
  this.status.percent = 0;
};

EquiGratLayer.contExec = function() {
  /* Graticule drawing is so fast that cothreading technically isn't
     necessary.  */
  var ctx = this.frontBuf.getContext("2d");
  var vp = this.vp;
  var width = this.vp.viewport[0];
  var height = this.vp.viewport[1];
  var mcx = this.vp.mapCenter[0];
  var mcy = this.vp.mapCenter[1];
  // ctx.strokeStyle = 'rgba(128, 128, 128, 0.5)';
  ctx.lineWidth = width / 1440 * vp.scale;
  ctx.clearRect(0, 0, width, height);

  /* Find the bounding box of the view.  */
  var vbox = WCTracksLayer.genVBox();
  if (vbox[0] < -90) vbox[0] = -90;
  if (vbox[2] > 90) vbox[2] = 90;
  var lonMid = (vbox[1] + vbox[3]) / 2;
  var lonMin = lonMid - 180, lonMax = lonMid + 180;
  if (vbox[1] < lonMin) vbox[1] = lonMin;
  if (vbox[3] > lonMax) vbox[3] = lonMax;

  /* Determine the region of graticule lines to render.  */
  var latDensity = GratParams.latDensity;
  var firstLat = vbox[0];
  var latPad = vbox[0] % latDensity;
  if (latPad != 0) {
    if (latPad < 0) latPad = -latPad;
    else latPad = latDensity - latPad;
  }
  var startLat = firstLat + latPad;
  var lastLat = vbox[2];

  var lonDensity = GratParams.lonDensity;
  var firstLon = vbox[1];
  var lonPad = vbox[1] % lonDensity;
  if (lonPad != 0) {
    if (lonPad < 0) lonPad = -lonPad;
    else lonPad = lonDensity - lonPad;
  }
  var startLon = firstLon + lonPad;
  var lastLon = vbox[3];
  firstLon -= vp.polCenter[0];
  startLon -= vp.polCenter[0]; lastLon -= vp.polCenter[0];

  /* Render.  */
  ctx.beginPath();
  for (var lat = startLat; lat < lastLat; lat += latDensity) {
    ctx.moveTo((1 + firstLon / 180 * vp.scale + mcx) / 2 * width,
	       (1 - (lat / 180 * vp.scale + mcy) *
		vp.aspectXY) / 2 * height);
    ctx.lineTo((1 + lastLon / 180 * vp.scale + mcx) / 2 * width,
	       (1 - (lat / 180 * vp.scale + mcy) *
		vp.aspectXY) / 2 * height);
  }
  for (var lon = startLon; lon < lastLon; lon += lonDensity) {
    ctx.moveTo((1 + lon / 180 * vp.scale + mcx) / 2 * width,
	       (1 - (firstLat / 180 * vp.scale + mcy) *
		vp.aspectXY) / 2 * height);
    ctx.lineTo((1 + lon / 180 * vp.scale + mcx) / 2 * width,
	       (1 - (lastLat / 180 * vp.scale + mcy) *
		vp.aspectXY) / 2 * height);
  }
  ctx.stroke();

  this.status.returnType = CothreadStatus.FINISHED;
  this.status.preemptCode = RenderLayer.RENDERING;
  this.status.percent = CothreadStatus.MAX_PERCENT;
  return this.status;
};

/********************************************************************/

/**
 * Specialized GratLayer implementation that draws an optimal
 * graticule for Robinson projection.  This implementation is not
 * currently working.
 * @memberof GratLayerJS
 * @type RenderLayer
 */
var RobiGratLayer = new RenderLayer();
OEV.RobiGratLayer = RobiGratLayer;

/********************************************************************/

/**
 * Specialized GratLayer implementation that draws an graticule for
 * orthographic projection using ellipses and lines.
 * @memberof GratLayerJS
 * @type RenderLayer
 */
var OrthoGratLayer = new RenderLayer();
OEV.OrthoGratLayer = OrthoGratLayer;

OrthoGratLayer.initCtx = function() {
  this.retVal = 0;
  this.status.returnType = CothreadStatus.PREEMPTED;
  this.status.preemptCode = 0;
  this.status.percent = 0;
};

OrthoGratLayer.contExec = function() {
  /* Graticule drawing is so fast that cothreading technically isn't
     necessary.  */
  var ctx = this.frontBuf.getContext("2d");
  var vp = this.vp;
  var y_center = this.frontBuf.height / 2;
  var x_center = this.frontBuf.width / 2;
  var disp_scale = vp.scale;
  /* display radius */
  var disp_rad = this.frontBuf.width * disp_scale / 2.0;

  var lon_rot = vp.polCenter[0];
  var tilt = vp.polCenter[1];
  var latDensity = GratParams.latDensity;
  var lonDensity = GratParams.lonDensity;

  // ctx.fillStyle = '#ffffff';
  // ctx.strokeStyle = '#000000';
  ctx.lineWidth = this.frontBuf.width / 720 * vp.scale;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, this.frontBuf.width, this.frontBuf.height);

  // Draw the outermost bounding circle.
  ctx.beginPath();
  ctx.arc(x_center, y_center, disp_rad, 0, 2 * Math.PI, false);
  ctx.stroke();

  // Draw all the latitude lines.
  for (var lat = -90; lat < 90; lat += latDensity) {
    var pole_height = disp_rad * Math.cos(tilt * DEG2RAD);
    // The parallel ellipse's width and height.
    var par_width = disp_rad * Math.cos(lat * DEG2RAD);
    var par_height = Math.sin(tilt * DEG2RAD);
    // The ascent of the parallel along the pole.
    var par_ascent = Math.sin(lat * DEG2RAD);

    // Clip to the visible boundary line.
    var angle;
    if (tilt >= 0) angle = 90 - tilt;
    else angle = -90 - tilt;
    angle *= DEG2RAD;
    var lon1 = Math.asin(Math.tan(DEG2RAD * lat) / Math.tan(angle));
    if (lon1 > 0) lon1 = -lon1;
    var lon2 = -lon1;

    /* NOTE: These mathematics are a bit goofy because we compute and
       display upside-down.  */

    if (isNaN(lon1)) {
      /* No intersections.  Skip if this is entirely on the back
	 side.  */
      if ((tilt > 0 && lat > 0) || (tilt < 0 && lat < 0))
	continue;
      lon2 = 0; lon1 = 2 * Math.PI;
    } else {
      if ((tilt > 0 && lat < 0) || (tilt < 0 && lat > 0)) {
	lon1 = -Math.PI - lon1;
	lon2 = 0 - lon2;
      } else {
	lon1 = -Math.PI - lon1;
	lon2 = 0 - lon2;
	var temp = lon1; lon1 = lon2; lon2 = temp;
	lon1 += DEG2RAD * 180; lon2 += DEG2RAD * 180;
      }
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.translate(x_center, y_center + pole_height * par_ascent);
    if (par_height != 0)
      ctx.scale(1, par_height);
    ctx.beginPath();
    if (par_height != 0)
      ctx.arc(0, 0, par_width, lon2, lon1, false);
    else { ctx.moveTo(-par_width, 0); ctx.lineTo(par_width, 0); }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.stroke();
  }

  // Draw all the longitude lines.
  for (var lon = -lon_rot; lon < -lon_rot + 360; lon += lonDensity) {
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
    if (lon_x_scale != 0)
      ctx.transform(1, lon_z_scale / lon_x_scale * Math.sin(tilt * DEG2RAD), 0,
		    1, 0, 0);

    // Clip to the visible boundary line.
    var angle;
    if (tilt >= 0) angle = 90 - tilt;
    else angle = -90 - tilt;
    angle *= DEG2RAD;
    var lat1 = Math.atan2(Math.sin(DEG2RAD * (lon - 90)) * Math.sin(angle),
			  Math.cos(angle));
    var lat2 = Math.atan2(Math.sin(DEG2RAD * (lon + 90)) * Math.sin(angle),
			  Math.cos(angle));
    // var lat1 = -Math.PI / 2, lat2 = Math.PI / 2;
    if (tilt > 0)
      lat1 = lat2 - DEG2RAD * 180;
    if (tilt < 0) {
      var temp = lat1; lat1 = lat2; lat2 = temp;
      lat2 = lat1 + DEG2RAD * 180;
    }
    if (lat1 > lat2) {
      /* Don't bother rendering: it's not visible anyways.  */
      continue;
    }

    ctx.beginPath();
    if (lon_x_scale != 0) {
      ctx.scale(lon_x_scale, lon_height);
      ctx.arc(0, 0, disp_rad, lat1, lat2, false);
    } else if (lon_height != 0) {
      ctx.scale(1, lon_height);
      ctx.moveTo(0, -disp_rad); ctx.lineTo(0, disp_rad);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.stroke();
  }

  this.status.returnType = CothreadStatus.FINISHED;
  this.status.preemptCode = RenderLayer.RENDERING;
  this.status.percent = CothreadStatus.MAX_PERCENT;
  return this.status;
};

/********************************************************************/

/**
 * Pointer to the current GratLayer implementation.
 * @memberof GratLayerJS
 */
var GratLayer = OEV.GratLayer = EquiGratLayer;
