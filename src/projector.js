/* Projection methods.  */

import "oevns";
import "oevmath";
import "viewparams";

/*

Absolute formalism is what's required.  A /projection/ is a pure
mathematical construct for transforming a 2D point to a latitude and a
longitude on a generic globe.  However, practical application of a
projection typically requires more than just this pure definition.

1. Convert a screen coordinate to normalized 2D coordinates,
performing any needed 2D shift and scale operations.  The projections
only work with normalized 2D coordinates.

2. Run the projection on the normalized 2D coordinate.  You'll get a
latitude and a longitude on a generic globe.

3. Convert this generic point to the specific point by applying the
current globe tilt and pole shift (and yaw if specified).

This allows for all possible variations and everything in between.  It
has no holes, no gaps, no loopholes, no margins for error.  However,
it is also not guaranteed to be the most optimal process.  Certain
algorithms are available "precomposed": hand-optimized combinations
designed for maximum performance, in case the compiler is lacking in
this regard, which it almost certainly is.

 */

/**
 * Base class for map projections.  This is an abstract class that
 * specifies the calling convention.  Use one of the concrete classes
 * for the actual projection.
 * @constructor
 */
var Projector = function() {
};

OEV.Projector = Projector;

/**
 * Project a latitude-longitude polar coordinate in degrees to a map
 * coordinate for the current projection.  The coordinates must be
 * normalized before this function call.
 * @abstract
 *
 * @param {Array} polToMap - Input array [ lon, lat ] that will be
 * transformed into the outpt [ x, y ].  The output is in relative map
 * coordinates [-1..1] for both X and Y, specifying where the
 * projected point should appear on the map.  Quadrant I is in the
 * upper right hand corner.  If the map projection is non-square, then
 * the maximum relative coordinates of the shorter axis will not reach
 * +/- 1.
 */
Projector.prototype.project = function(polToMap) {
  throw_new_Error("Must be implemented by a subclass!");
};

/**
 * Convert a projected map coordinate to a latitude-longitude polar
 * coordinate.  The coordinates must be normalized before this
 * function call.  Quadrant I is in the upper right hand corner.
 * @abstract
 *
 * @param {Array} mapToPol - Input array [ x, y ] that will be
 * transformed into the output [ lon, lat ].
 */
Projector.prototype.unproject = function(mapToPol) {
  throw_new_Error("Must be implemented by a subclass!");
};

/**
 * Equirectangular map projector.
 * @type Projector
 */
var EquirectProjector = new Projector();
OEV.EquirectProjector = EquirectProjector;

EquirectProjector.project = function(polToMap) {
  polToMap[1] = polToMap[1] / 180;
  polToMap[0] = polToMap[0] / 180;
};

EquirectProjector.unproject = function(mapToPol) {
  mapToPol[1] = mapToPol[1] * 180;
  mapToPol[0] = mapToPol[0] * 180;
};

/**
 * Mercator map projector.
 * @type Projector
 */
var MercatorProjector = new Projector();
OEV.MercatorProjector = MercatorProjector;

MercatorProjector.project = function(polToMap) {
  var r = 1; // Radius
  polToMap[1] = (r * Math.log(Math.tan(Math.PI / 4 +
				       DEG2RAD * polToMap[1] / 2))) / Math.PI;
  polToMap[0] = polToMap[0] / 180;
};

MercatorProjector.unproject = function(mapToPol) {
  var r = 1; // Radius
  mapToPol[1] = (2 * Math.atan(Math.exp(mapToPol[1] * Math.PI / r)) -
		 Math.PI / 2) * RAD2DEG;
  mapToPol[0] = mapToPol[0] * 180;
};

/**
 * Robinson map projector.
 * @type Projector
 */
var RobinsonProjector = new Projector();
OEV.RobinsonProjector = RobinsonProjector;

RobinsonProjector.table = [
//  PLEN    PDFE         LAT
  [ 1.0000, 0.0000 ], // 00
  [ 0.9986, 0.0620 ], // 05
  [ 0.9954, 0.1240 ], // 10
  [ 0.9900, 0.1860 ], // 15
  [ 0.9822, 0.2480 ], // 20
  [ 0.9730, 0.3100 ], // 25
  [ 0.9600, 0.3720 ], // 30
  [ 0.9427, 0.4340 ], // 35
  [ 0.9216, 0.4958 ], // 40
  [ 0.8962, 0.5571 ], // 45
  [ 0.8679, 0.6176 ], // 50
  [ 0.8350, 0.6769 ], // 55
  [ 0.7986, 0.7346 ], // 60
  [ 0.7597, 0.7903 ], // 65
  [ 0.7186, 0.8435 ], // 70
  [ 0.6732, 0.8936 ], // 75
  [ 0.6213, 0.9394 ], // 80
  [ 0.5722, 0.9761 ], // 85
  [ 0.5322, 1.0000 ]  // 90
];

RobinsonProjector.project = function(polToMap) {
  var table = RobinsonProjector.table;
  var alat = Math.abs(polToMap[1]);
  var tbIdx1 = 0|Math.floor(alat / 5);
  var tbIdx2 = 0|Math.ceil(alat / 5);
  var interpol = (alat % 5) / 5;
  var plen = (((1 - interpol) * table[tbIdx1][0]) +
	      (interpol * table[tbIdx2][0]));
  var pdfe = (((1 - interpol) * table[tbIdx1][1]) +
	      (interpol * table[tbIdx2][1]));
  polToMap[0] = polToMap[0] * plen / 180;
  if (polToMap[1] < 0)
    polToMap[1] = -pdfe * 0.5072;
  else polToMap[1] = pdfe * 0.5072;
};

RobinsonProjector.unproject = function(mapToPol) {
  var table = RobinsonProjector.table;
  var pdfe = Math.abs(mapToPol[1]) / 0.5072;
  if (pdfe > 1)
    { mapToPol[0] = NaN; mapToPol[1] = NaN; return; }
  var approxIndex = 0|(pdfe * 18);
  while (table[approxIndex][1] < pdfe) approxIndex++;
  while (table[approxIndex][1] > pdfe) approxIndex--;
  var tbIdx1 = approxIndex;
  var tbIdx2 = approxIndex + 1;
  var interpol = 0;
  if (tbIdx2 > 18) tbIdx2 = 18;
  else interpol = ((pdfe - table[tbIdx1][1]) /
		   (table[tbIdx2][1] - table[tbIdx1][1]));
  var plen = table[tbIdx1][0] * (1 - interpol) + table[tbIdx2][0] * interpol;
  if (mapToPol[1] < 0)
    mapToPol[1] = -5 * (tbIdx1 + interpol);
  else mapToPol[1] = 5 * (tbIdx1 + interpol);
  mapToPol[0] = mapToPol[0] / plen * 180;
  if (mapToPol[0] < -180 || mapToPol[0] > 180)
    { mapToPol[0] = NaN; mapToPol[1] = NaN; }
};

/**
 * Sinusoidal map projector.
 * @type Projector
 */
var SinProjector = new Projector();
OEV.SinProjector = SinProjector;

SinProjector.project = function(polToMap) {
  polToMap[0] = polToMap[0] * Math.cos(DEG2RAD * polToMap[1]) / 180;
  polToMap[1] = polToMap[1] / 180;
};

SinProjector.unproject = function(mapToPol) {
  mapToPol[1] = mapToPol[1] * 180;
  mapToPol[0] = mapToPol[0] / Math.cos(DEG2RAD * mapToPol[1]) * 180;
};

/**
 * Mollweide map projector.  Currently, this projector only has an
 * inverse projection method available.
 * @type Projector
 */
var MollweideProjector = new Projector();
OEV.MollweideProjector = MollweideProjector;

MollweideProjector.unproject = function(mapToPol) {
  var theta = Math.asin(mapToPol[1] * Math.sqrt(8) / Math.sqrt(2));
  var theta_2 = 2 * theta;
  mapToPol[1] = RAD2DEG * Math.asin((theta_2 + Math.sin(theta_2)) /
				    Math.PI);
  mapToPol[0] = RAD2DEG * ((Math.PI * mapToPol[0] * Math.sqrt(8)) /
			   (2 * Math.sqrt(2) * Math.cos(theta)));
};

/**
 * Orthographic map projector.
 * @type Projector
 */
var OrthoProjector =  new Projector();
OEV.OrthoProjector = OrthoProjector;

OrthoProjector.project = function(polToMap) {
  if (polToMap[0] < -90 || polToMap[0] > 90)
    { polToMap[0] = NaN; polToMap[1] = NaN; return; }
  var latitude = DEG2RAD * polToMap[1];
  polToMap[1] = Math.sin(latitude);
  polToMap[0] = Math.sin(DEG2RAD * polToMap[0]) * Math.cos(latitude);
};

OrthoProjector.unproject = function(mapToPol) {
  var latitude = Math.asin(mapToPol[1]);
  mapToPol[1] = RAD2DEG * latitude;
  mapToPol[0] = RAD2DEG * Math.asin(mapToPol[0] / Math.cos(latitude));
};

/**
 * Perspective map projector.
 * @type Projector
 */
var PerspProjector = new Projector();
OEV.PerspProjector = PerspProjector;

PerspProjector.project = function(polToMap) {
  if (polToMap[0] < -90 || polToMap[0] > 90)
    { polToMap[0] = NaN; polToMap[1] = NaN; return; }
  // r must be one: this simplifies the calculations
  var r = 1; // 6371; // radius of the earth in kilometers
  var d = gViewParams.perspAltitude / 6371; // altitude in kilometers
  // focal length in units of the screen dimensions
  var f = 1 / Math.tan(DEG2RAD * gViewParams.perspFOV / 2);
  var latitude = DEG2RAD * polToMap[1];
  var cos_latitude = Math.cos(latitude);
  // Point3D r3src { x, y, z } -> exploded ->
  var r3src_x = Math.sin(DEG2RAD * polToMap[0]) * cos_latitude /* * r */;
  var r3src_y = Math.sin(latitude) /* * r */;
  var r3src_z = Math.cos(DEG2RAD * polToMap[0]) * cos_latitude /* * r */;

  polToMap[0] = r3src_x * f / (-r3src_z + (r + d));
  polToMap[1] = r3src_y * f / (-r3src_z + (r + d));
};

PerspProjector.unproject = function(mapToPol) {
  // Point3D r3src { x, y, z } -> exploded ->
  var r3src_x, r3src_y, r3src_z;

  // r must be one: this simplifies the calculations
  var r = 1; // 6371; // radius of the earth in kilometers
  var d = gViewParams.perspAltitude / 6371; // altitude in kilometers
  // focal length in units of the screen dimensions
  var f = 1 / Math.tan(DEG2RAD * gViewParams.perspFOV / 2);
  var x_pix = mapToPol[0];
  var y_pix = mapToPol[1];

  var w = (Math.pow(x_pix, 2) + Math.pow(y_pix, 2)) / Math.pow(f, 2);

  var a = 1 + w;
  var b = -2 * w * (r + d);
  var c = w * Math.pow(r + d, 2) - 1 /* 1 == Math.pow(r, 2) */;

  r3src_z = (-b + Math.sqrt(Math.pow(b, 2) - 4 * a * c)) / (2 * a);
  if (isNaN(r3src_z))
    { mapToPol[0] = NaN; mapToPol[1] = NaN; return; }
  r3src_x = x_pix / f * (-r3src_z + (r + d));
  r3src_y = y_pix / f * (-r3src_z + (r + d));
  mapToPol[1] = RAD2DEG * Math.asin(r3src_y);
  mapToPol[0] = RAD2DEG * Math.atan2(r3src_x, r3src_z);
};

/**
 * 3D map projectors, with optimized tilt transformations embedded.
 * This class is designed so that common code between the orthographic
 * and perspective projectors can be contained in the same functions.
 *
 * Base class: {@linkcode Projector}
 * @constructor
 */
var TDProjector = function() {
};

OEV.TDProjector = TDProjector;
TDProjector.prototype = new Projector();
TDProjector.prototype.constructor = TDProjector;

/**
 * @param {Array} polToMap - See base class for details.
 * @param {integer} type - Projector type.  Zero for orthographic, one
 * for perspective.
 */
TDProjector.prototype.project = function(polToMap, projType) {
  if (polToMap[0] < -90 || polToMap[0] > 90)
    { polToMap[0] = NaN; polToMap[1] = NaN; return; }

  /* 1. Get the 3D rectangular coordinate of the point.  */
  var longitude = polToMap[0] - gViewParams.polCenter[0];
  var latitude = DEG2RAD * polToMap[1];
  var cos_latitude = Math.cos(latitude);
  // Point3D r3src { x, y, z } -> exploded ->
  var r3src_x = Math.sin(DEG2RAD * longitude) * cos_latitude;
  var r3src_y = Math.sin(latitude);
  var r3src_z = Math.cos(DEG2RAD * longitude) * cos_latitude;

  /* 2. Rotate this coordinate around the x axis by the current globe
     tilt.  */
  // Point3D r3dest { x, y, z } -> exploded ->
  var r3dest_x, r3dest_y, r3dest_z;
  if (gViewParams.polCenter[1] != 0) {
    /* FIXME: This should theoretically be positive, but from testing,
       negative is what works correctly.  Probably due to a problem in
       TracksLayer.  */
    var tilt = -DEG2RAD * gViewParams.polCenter[1];
    var cos_tilt = Math.cos(tilt); var sin_tilt = Math.sin(tilt);
    r3dest_x = r3src_x;
    r3dest_y = r3src_y * cos_tilt - r3src_z * sin_tilt;
    r3dest_z = r3src_y * sin_tilt + r3src_z * cos_tilt;
  } else {
    r3dest_x = r3src_x; r3dest_y = r3src_y; r3dest_z = r3src_z;
  }

  /* 3. Read out the x and y pixel positions of this coordinate.  */
  if (projType == 0) { // Orthographic projection
    polToMap[0] = r3dest_x;
    polToMap[1] = r3dest_y;
  } else { // Perspective projection
    // r must be one: this simplifies the calculations
    var r = 1; // 6371; // radius of the earth in kilometers
    var d = gViewParams.perspAltitude / 6371; // altitude in kilometers
    // focal length in units of the screen dimensions
    var f = 1 / Math.tan(DEG2RAD * gViewParams.perspFOV / 2);
    polToMap[0] = r3dest_x * f / (-r3dest_z + (r + d));
    polToMap[1] = r3dest_y * f / (-r3dest_z + (r + d));
  }
};

/**
 * @param {Array} mapToPol - See base class for details.
 * @param {integer} type - Projector type.  Zero for orthographic, one
 * for perspective.
 */
TDProjector.prototype.unproject = function(mapToPol, projType) {
  /* 1. Get the 3D rectangular coordinate of the ray intersection
     with the sphere.  The camera is looking down the negative
     z axis.  */
  // Point3D r3src { x, y, z } -> exploded ->
  var r3src_x, r3src_y, r3src_z;

  if (projType == 0) { // Orthographic projection
    r3src_x = mapToPol[0];
    r3src_y = mapToPol[1];
    r3src_z = Math.sin(Math.acos(Math.sqrt(Math.pow(r3src_x, 2) +
					   Math.pow(r3src_y, 2))));
    if (isNaN(r3src_z))
      { mapToPol[0] = NaN; mapToPol[1] = NaN; return; }
  } else { // Perspective projection
    // r must be one: this simplifies the calculations
    var r = 1; // 6371; // radius of the earth in kilometers
    var d = gViewParams.perspAltitude / 6371; // altitude in kilometers
    // focal length in units of the screen dimensions
    var f = 1 / Math.tan(DEG2RAD * gViewParams.perspFOV / 2);
    var x_pix = mapToPol[0];
    var y_pix = mapToPol[1];

    var w = (Math.pow(x_pix, 2) + Math.pow(y_pix, 2)) / Math.pow(f, 2);

    var a = 1 + w;
    var b = -2 * w * (r + d);
    var c = w * Math.pow(r + d, 2) - 1 /* 1 == Math.pow(r, 2) */;

    r3src_z = (-b + Math.sqrt(Math.pow(b, 2) - 4 * a * c)) / (2 * a);
    if (isNaN(r3src_z))
      { mapToPol[0] = NaN; mapToPol[1] = NaN; return; }
    r3src_x = x_pix / f * (-r3src_z + (r + d)) /* / r */;
    r3src_y = y_pix / f * (-r3src_z + (r + d)) /* / r */;
  }

  /* 2. Inverse rotate this coordinate around the x axis by the
     current globe tilt.  */
  var tilt = DEG2RAD * gViewParams.polCenter[1];
  var cos_tilt = Math.cos(tilt); var sin_tilt = Math.sin(tilt);
  // Point3D r3src { x, y, z } -> exploded ->
  var r3dest_x, r3dest_y, r3dest_z;
  r3dest_x = r3src_x;
  r3dest_y = r3src_y * cos_tilt - r3src_z * sin_tilt;
  r3dest_z = r3src_y * sin_tilt + r3src_z * cos_tilt;

  /* 3. Measure the latitude and longitude of this coordinate.  */
  var latitude = RAD2DEG * Math.asin(r3dest_y);
  var longitude = RAD2DEG * Math.atan2(r3dest_x, r3dest_z);

  /* 4. Shift by the longitudinal rotation around the pole.  For the
     sake of the normalization calculation below, move the prime
     meridian to 180 degrees.  */
  longitude += 180 + gViewParams.polCenter[0];

  /* 5. Verify that the coordinates are in bounds.  */
  if (latitude < -90) latitude = -90;
  if (latitude > 90) latitude = 90;
  longitude += (longitude < 0) * 360;
  longitude = longitude % 360.0 - 180;
  mapToPol[0] = longitude;
  mapToPol[1] = latitude;
};

/**
 * Orthographic map projector with optimized tilt transformation
 * embedded.
 * @type TDProjector
 */
var OrthoTDProjector = new TDProjector();
OEV.OrthoTDProjector = OrthoTDProjector;

OrthoTDProjector.project = function(polToMap) {
  return TDProjector.prototype.project(polToMap, 0);
};

OrthoTDProjector.unproject = function(mapToPol) {
  return TDProjector.prototype.unproject(mapToPol, 0);
};

/**
 * Perspective map projector with optimized tilt transformation
 * embedded.
 * @type TDProjector
 */
var PerspTDProjector = new TDProjector();
OEV.PerspTDProjector = PerspTDProjector;

PerspTDProjector.project = function(polToMap) {
  return TDProjector.prototype.project(polToMap, 1);
};

PerspTDProjector.unproject = function(mapToPol) {
  return TDProjector.prototype.unproject(mapToPol, 1);
};
