/* Projection methods.  */

import "oevmath";

/**
 * Abstract projector class.
 * @constructor
 */
var Projector = function() {
};

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
 * @constructor
 */
var MapProjector = function() {
};

MapProjector.prototype = new Projector();
MapProjector.constructor = MapProjector;

/**
 * Project a latitude-longitude polar coordinate in degrees to a map
 * coordinate for the current projection.  The coordinates must be
 * normalized before this function call.
 * @abstract
 *
 * @param {PolarPoint} polCoord - The latitude-longitude polar
 * coordinate to project.
 *
 * @returns {Point2D} relative map coordinates [-1..1] for both X and
 * Y, specifying where the projected point should appear on the map.
 * Quadrant I is in the upper right hand corner.  If the map
 * projection is non-square, then the maximum relative coordinates of
 * the shorter axis will not reach +/- 1.
 */
MapProjector.prototype.project = function(polCoord) {
  throw new Error("Must be implemented by a subclass!");
};

/**
 * Convert a projected map coordinate to a latitude-longitude polar
 * coordinate.  The coordinates must be normalized before this
 * function call.  Quadrant I is in the upper right hand corner.
 * @abstract
 */
MapProjector.prototype.unproject = function(mapCoord) {
  throw new Error("Must be implemented by a subclass!");
};

/** Equirectangular map projector.  */
var EquirectMapProjector = new MapProjector();

EquirectMapProjector.project = function(polCoord) {
  var mapCoord = {};
  mapCoord.y = polCoord.lat / 180;
  mapCoord.x = polCoord.lon / 180;
  return mapCoord;
};

EquirectMapProjector.unproject = function(mapCoord) {
  var polCoord = {};
  polCoord.lat = mapCoord.y * 180;
  polCoord.lon = mapCoord.x * 180;
  return polCoord;
};

/** Mercator map projector.  */
var MercatorMapProjector = new MapProjector();

MercatorMapProjector.project = function(polCoord) {
  var r = 1; // Radius
  var mapCoord = {};
  mapCoord.y = (r * Math.log(Math.tan(Math.PI / 4 +
				      DEG2RAD * polCoord.lat / 2))) / Math.PI;
  mapCoord.x = polCoord.lon / 180;
  return mapCoord;
};

MercatorMapProjector.unproject = function(mapCoord) {
  var r = 1; // Radius
  var polCoord = {};
  polCoord.lat = 2 * Math.atan(Math.exp(y * Math.PI / r)) - Math.PI / 2;
  polCoord.lon = mapCoord.x * 180;
  return polCoord;
};

/** Robinson map projector.  */
RobinsonMapProjector = new MapProjector();

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

RobinsonMapProjector.project = function(polCoord) {
  var table = RobinsonMapProjector.table;
  var alat = Math.abs(polCoord.lat);
  var tbIdx1 = ~~Math.floor(alat / 5);
  var tbIdx2 = ~~Math.ceil(alat / 5);
  var interpol = (alat % 5) / 5;
  var plen = (((1 - interpol) * table[tbIdx1][0]) +
	      (interpol * table[tbIdx2][0]));
  var pdfe = (((1 - interpol) * table[tbIdx1][1]) +
	      (interpol * table[tbIdx2][1]));
  var mapCoord = {};
  mapCoord.x = polCoord.lon * plen / 180;
  mapCoord.y = pdfe * 0.5072;
  if (polCoord.lat < 0)
    mapCoord.y = -mapCoord.y;
  return mapCoord;
};

RobinsonMapProjector.unproject = function(mapCoord) {
  var table = RobinsonMapProjector.table;
  var pdfe = Math.abs(mapCoord.y) / 0.5072;
  if (pdfe > 1)
    return { lat: NaN, lon: NaN };
  var approxIndex = ~~(pdfe * 18);
  while (table[approxIndex][1] < pdfe) approxIndex++;
  while (table[approxIndex][1] > pdfe) approxIndex--;
  var tbIdx1 = approxIndex;
  var tbIdx2 = approxIndex + 1;
  var interpol = 0;
  if (tbIdx2 > 18) tbIdx2 = 18;
  else
    interpol = ((pdfe - table[tbIdx1][1]) /
		(table[tbIdx2][1] - table[tbIdx1][1]));
  var plen = table[tbIdx1][0] * (1 - interpol) * table[tbIdx2][0] * interpol;
  var polCoord = {};
  polCoord.lat = 5 * (tbIdx1 + interpol);
  if (mapCoord.y < 0)
    polCoord.lat = -polCoord.lat;
  polCoord.lon = mapCoord.x / plen * 180;
  if (polCoord.lon < -180 || polCoord.lon > 180)
    return { lat: NaN, lon: NaN };
  return polCoord;
};

/** Winkel tripel map projection (not usable).  */
W3MapProjector = new MapProjector();

W3MapProjector.project = function(polCoord) {
  var mapCoord = {};
  var a = Math.acos(Math.cos(polCoord.lat) * Math.cos(polCoord.lon / 2));
  var sinc_a = Math.sin(a) / a;
  mapCoord.y = 1 / 2 * (polCoord.lat + Math.sin(polCoord.lat) / sinc_a);
  mapCoord.x = 1 / 2 * (polCoord.lon * Math.cos(polCoord.lat) +
			2 * Math.cos(polCoord.lat) * sin(polCoord.lon / 2) /
			sinc_a);
  return mapCoord;
};

W3MapProjector.unproject = function(mapCoord) {
  // Complicated reverse projection
};
