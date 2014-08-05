/* Projection methods.  */

import "oevns";
import "oevmath";

/**
 * Abstract projector class.
 * @constructor
 */
var Projector = function() {
};

OEV.Projector = Projector;

/**
 * Abstract projection function.  See a derived class for details.
 * @abstract
 */
Projector.prototype.project = function() {
  throw new Error("Must be implemented by a subclass!");
};

/**
 * Abstract inverse projection function.  See a derived class for
 * details.
 * @abstract
 */
Projector.prototype.unproject = function() {
  throw new Error("Must be implemented by a subclass!");
};

/**
 * Base class for 2D map projections.  This is an abstract class that
 * specifies the calling convention.  Use one of the concrete classes
 * for the actual projection.
 *
 * Base class: {@linkcode Projector}
 * @constructor
 */
var MapProjector = function() {
};

OEV.MapProjector = MapProjector;
MapProjector.prototype = new Projector();
MapProjector.prototype.constructor = MapProjector;

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
MapProjector.prototype.project = function(polToMap) {
  throw new Error("Must be implemented by a subclass!");
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
MapProjector.prototype.unproject = function(mapToPol) {
  throw new Error("Must be implemented by a subclass!");
};

/**
 * Equirectangular map projector.
 * @type MapProjector
 */
var EquirectMapProjector = new MapProjector();
OEV.EquirectMapProjector = EquirectMapProjector;

EquirectMapProjector.project = function(polToMap) {
  polToMap[1] = polToMap[1] / 180;
  polToMap[0] = polToMap[0] / 180;
};

EquirectMapProjector.unproject = function(mapToPol) {
  mapToPol[1] = mapToPol[1] * 180;
  mapToPol[0] = mapToPol[0] * 180;
};

/**
 * Mercator map projector.
 * @type MapProjector
 */
var MercatorMapProjector = new MapProjector();
OEV.MercatorMapProjector = MercatorMapProjector;

MercatorMapProjector.project = function(polToMap) {
  var r = 1; // Radius
  polToMap[1] = (r * Math.log(Math.tan(Math.PI / 4 +
				       DEG2RAD * polToMap[1] / 2))) / Math.PI;
  polToMap[0] = polToMap[0] / 180;
};

MercatorMapProjector.unproject = function(mapToPol) {
  var r = 1; // Radius
  mapToPol[1] = (2 * Math.atan(Math.exp(mapToPol[1] * Math.PI / r)) -
		 Math.PI / 2) * RAD2DEG;
  mapToPol[0] = mapToPol[0] * 180;
};

/**
 * Robinson map projector.
 * @type MapProjector
 */
var RobinsonMapProjector = new MapProjector();
OEV.RobinsonMapProjector = RobinsonMapProjector;

RobinsonMapProjector.table = [
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

RobinsonMapProjector.project = function(polToMap) {
  var table = RobinsonMapProjector.table;
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
  else
    polToMap[1] = pdfe * 0.5072;
};

RobinsonMapProjector.unproject = function(mapToPol) {
  var table = RobinsonMapProjector.table;
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
  else
    mapToPol[1] = 5 * (tbIdx1 + interpol);
  mapToPol[0] = mapToPol[0] / plen * 180;
  if (mapToPol[0] < -180 || mapToPol[0] > 180) {
    mapToPol[0] = NaN; mapToPol[1] = NaN;
  }
};

/**
 * 3D map projectors.  This class is designed simply so that common
 * code between the orthographic and perspective projectors can be
 * contained in the same functions.
 *
 * Base class: {@linkcode MapProjector}
 * @constructor
 */
var TDMapProjector = function() {
};

OEV.TDMapProjector = TDMapProjector;
TDMapProjector.prototype = new MapProjector();
TDMapProjector.prototype.constructor = TDMapProjector;

TDMapProjector.prototype.project = function(polToMap) {
  throw new Error("Not implemented!");
};

// PARAMETERS: var tilt, lon_rot;

var lon_rot = 0;
var tilt = 45;
var persp_fov = 17.5;
var persp_altitude = 35786;

/**
 * @param {Array} mapToPol - See base class for details.
 * @param {integer} type - Projector type.  Zero for orthographic, one
 * for perspective.
 */
TDMapProjector.prototype.unproject = function(mapToPol, projType) {
  /* 1. Get the 3D rectangular coordinate of the ray intersection
     with the sphere.  The camera is looking down the negative
     z axis.  */
  var r3src_x, r3src_y, r3src_z;

  if (projType == 0) { // Orthographic projection
    r3src_y = mapToPol[1];
    r3src_x = mapToPol[0];
    r3src_z = Math.sin(Math.acos(Math.sqrt(Math.pow(r3src_x, 2) +
					   Math.pow(r3src_y, 2))));
    if (isNaN(r3src_z))
      { mapToPol[0] = NaN; mapToPol[1] = NaN; return; }
  } else { // Perspective projection
    // r must be one: this simplifies the calculations
    var r = 1; // 6371; // radius of the earth in kilometers
    var d = persp_altitude / 6371; // altitude in kilometers
    // focal length in units of the screen dimensions
    var f = 1 / Math.tan(DEG2RAD * persp_fov / 2);
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
  }

  /* 2. Inverse rotate this coordinate around the x axis by the
     current globe tilt.  */
  var i_tilt = -DEG2RAD * tilt;
  var cos_tilt = Math.cos(i_tilt); var sin_tilt = Math.sin(i_tilt);
  var r3dest_x, r3dest_y, r3dest_z;
  r3dest_x = r3src_x;
  r3dest_z = r3src_z * cos_tilt - r3src_y * sin_tilt;
  r3dest_y = r3src_z * sin_tilt + r3src_y * cos_tilt;

  /* 3. Measure the latitude and longitude of this coordinate.  */
  var latitude = RAD2DEG * Math.asin(r3dest_y);
  var longitude = RAD2DEG * Math.atan2(r3dest_x, r3dest_z);

  /* 4. Shift by the longitudinal rotation around the pole.  */
  longitude += 180 + lon_rot;

  /* 5. Verify that the coordinates are in bounds.  */
  if (latitude < -90) latitude = -90;
  if (latitude > 90) latitude = 90;
  longitude += (longitude < 0) * 360;
  longitude = longitude % 360.0 - 180;
  mapToPol[0] = longitude;
  mapToPol[1] = latitude;
};

// TODO: Fix this projector member variable problem.

/**
 * Orthographic map projector.
 * @type TDMapProjector
 */
var OrthoMapProjector =  new TDMapProjector();
OEV.OrthoMapProjector = OrthoMapProjector;
OrthoMapProjector.unproject = function(mapToPol) {
  return TDMapProjector.prototype.unproject(mapToPol, 0);
};

/**
 * Perspective map projector.
 * @type TDMapProjector
 */
var PerspMapProjector = new TDMapProjector();
OEV.PerspMapProjector = PerspMapProjector;
PerspMapProjector.unproject = function(mapToPol) {
  return TDMapProjector.prototype.unproject(mapToPol, 1);
};
