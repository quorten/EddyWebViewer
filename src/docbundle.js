

/* This JavaScript file just includes all JavaScript source files so
   that JSDoc3 can process the files without complaining about
   "import" statements.  */



/* A simple trigonometric lookup table implementation.

The MIT License

Copyright (C) 2011 Jackson Dunstan
Rewritten to JavaScript and modified by Andrew Makousky.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
*/

/**
 *   Make the look up table
 *   @constructor
 *   @param {function} mathFunc - Math function to call to generate
 *   stored values. Must be valid on [0,range).
 *   @param {uint} numDigits - Number of digits places of precision
 *   @param {Number} range - Maximum unique value of function. Must be
 *   greater than zero. Typically set to (2 * Math.PI).
 *   @throws Error If mathFunc is null or invalid on [0,range)
 */
var TrigLUT = function(mathFunc, numDigits, range) {
  /** Table of trig function values */
  this.table = [];

  /** 10^decimals of precision */
  this.pow = Math.pow(10, numDigits);
  var pow = this.pow;

  /** Maximum unique value of function */
  this.range = range;

  var round = 1.0 / pow;
  var len = 1 + this.range * pow;
  var table = this.table = [];

  var theta = 0;
  for (var i = 0; i < len; ++i) {
    table.push(mathFunc(theta));
    theta += round;
  }
};

/** 2 * PI, the number of radians in a circle */
TrigLUT.TWO_PI = 2.0 * Math.PI;

/**
 *   Look up the value of the given number of radians
 *   @param {Number} radians - Radians to look up the value of
 *   @returns The value of the given number of radians
 */
TrigLUT.prototype.val = function(radians) {
  return radians >= 0 ?
    this.table[~~((radians % this.range) * this.pow)] :
    this.table[~~((this.range + radians % this.range) * this.pow)];
};

/**
 *   Look up the value of the given number of radians
 *   @param {Number} radians - Radians to look up the value of. Must
 *   be positive.
 *   @returns The value of the given number of radians
 *   @throws RangeError If radians is not positive
 */
TrigLUT.prototype.valPositive = function(radians) {
  return this.table[~~((radians % this.range) * this.pow)];
};

/**
 *   Look up the value of the given number of radians
 *   @param {Number} radians - Radians to look up the value of. Must
 *   be on (-2pi,2pi).
 *   @returns The value of the given number of radians
 *   @throws RangeError If radians is not on (-2pi,2pi)
 */
TrigLUT.prototype.valNormalized = function(radians) {
  return radians >= 0 ?
    this.table[~~(radians * this.pow)] :
    this.table[~~((this.range + radians) * this.pow)];
};

/**
 *   Look up the value of the given number of radians
 *   @param {Number} radians - Radians to look up the value of. Must
 *   be on [0,2pi).
 *   @returns The value of the given number of radians
 *   @throws RangeError If radians is not on [0,2pi)
 */
TrigLUT.prototype.valNormalizedPositive = function(radians) {
  return this.table[~~(radians * this.pow)];
};


/* Ocean Eddies Web Viewer namespace definition.  */

var oev;
if (!oev)
  oev = {};
else if (typeof oev != "object") {
  throw new Error("Namespace conflict: oev already exists " +
    "and is not an object.");
}


/* JavaScript base class for cothreaded procedures.  */

/**
 * Creates a new Cothread object.
 *
 * A Cothread object is an object that contains the procedures and
 * contextual data necessary for implementing a single cothread of
 * execution.
 *
 * The three main run control functions that a cothreading controller
 * should call are {@linkcode Cothread#start}, {@linkcode Cothread#continueCT},
 * and {@linkcode Cothread#loop}.  Note that none of these functions take any
 * arguments and all of them return a {@linkcode CothreadStatus} object.
 *
 * For function call-like semantics, use the `args` member to pass in
 * arguments and the `retVal` member to retrieve the return value.
 * Another alternative for passing in arguments is to set member
 * fields directly.
 *
 * See the [Cothread tutorial]{@tutorial cothread} for an example on
 * how to use the {@linkcode Cothread} class.
 *
 * @constructor
 *
 * @param {function} startExec - The internal function to execute at
 * initialization of a new Cothread run context.  See the
 * {@linkcode Cothread#startExec} member documentation for details.
 *
 * @param {function} contExec - The internal function to execute when
 * continuing a preempted cothread.  See the {@linkcode Cothread#contExec}
 * member documentation for details.
 */
var Cothread = function(startExec, contExec) {
  "use strict";

  /**
   * Target preemption timeout in milliseconds.
   *
   * If this field is set to zero, then the the cothread is not
   * preemptable.  Exactly how close this timeout is met is up to the
   * cothread implementation.
   *
   * @type integer
   */
  this.timeout = 0;

  /**
   * Initialization code for a new cothread run.
   *
   * This function is primarily intended to reset the cothread context
   * to an initial state.  This function is not preemptable, so no
   * tasks that are expensive in terms of wall clock time should be
   * executed in this function.
   *
   * @function
   * @protected
   * @returns Nothing
   */
  this.startExec = startExec;

  /**
   * Execution code for preemptable body of a cothread.
   *
   * @function
   * @protected
   * @returns {@linkcode CothreadStatus} object
   */
  this.contExec = contExec;

  /**
   * {@linkcode CothreadStatus} object associated with this cothread.
   * @type CothreadStatus
   * @readonly
   */
  this.status = new CothreadStatus(CothreadStatus.FINISHED, 0, 1000);

  /** Argument list to pass to cothread function.  */
  this.args = [];

  /**
   * Return value from finished cothread function.
   * @readonly
   */
  this.retVal = null;
};


/**
 * Set the exit status of a cothread based off of a condition.
 *
 * @param {boolean} condition - If `false`, then the exit status is
 * set to {@linkcode CothreadStatus#FINISHED}.  Otherwise, it is set to
 * {@linkcode CothreadStatus#PREEMPTED}.
 *
 * @returns Nothing
 */
Cothread.prototype.setExitStatus = function(condition) {
  "use strict";
  if (condition)
    this.status.returnType = CothreadStatus.PREEMPTED;
  else
    this.status.returnType = CothreadStatus.FINISHED;
};

/**
 * Begin execution of a new cothread within the given {@linkcode Cothread}
 * context.
 *
 * If there was any existing context from a preempted cothread, it
 * will be reset to an initial state for the new cothread run.
 *
 * @returns {@linkcode CothreadStatus} object
 */
Cothread.prototype.start = function() {
  "use strict";
  this.startExec();
  return this.contExec();
};

/**
 * Continue execution of a preempted cothread, if any.
 *
 * If this cothread has reached the {@linkcode CothreadStatus#FINISHED}
 * state, then this function returns immediately with the current
 * status of the cothread.
 *
 * @returns {@linkcode CothreadStatus} object
 */
Cothread.prototype.continueCT = function() {
  "use strict";
  if (this.status.returnType == CothreadStatus.FINISHED)
    return this.status;
  return this.contExec();
};

/**
 * Continue execution of a preempted cothread or start a new cothread.
 *
 * If this cothread has reached the {@linkcode CothreadStatus.FINISHED}
 * state, a new cothread is started and runs until preemption.
 *
 * @returns {@linkcode CothreadStatus} object
 */
Cothread.prototype.loop = function() {
  "use strict";
  if (this.status.returnType == CothreadStatus.FINISHED)
    this.startExec();
  return this.contExec();
};

/**
 * Used to indicate the return status of a {@linkcode Cothread}.
 *
 * The parameters to this constructor initialize the values of the
 * fields of the same name.
 *
 * @constructor
 * @param {integer} returnType - See {@linkcode CothreadStatus#returnType}
 * @param {integer} preemptCode - See {@linkcode CothreadStatus#preemptCode}
 * @param {integer} percent - See {@linkcode CothreadStatus#percent}
 */
var CothreadStatus = function(returnType, preemptCode, percent) {
  "use strict";

  /**
   * The type of the cothread return status.
   *
   * This should be one of the following values:
   *
   *   {@linkcode CothreadStatus.FINISHED} -- Cothread completed its task.
   *
   *   {@linkcode CothreadStatus.PREEMPTED} -- Cothread was interrupted.
   *
   * @type enumerant
   */
  this.returnType = returnType;

  /**
   * Application-specific, see documentation of derived objects for
   * details.
   * @type integer
   */
  this.preemptCode = preemptCode;

  /**
   * Integer from 0 to {@linkcode CothreadStatus.MAX_PERCENT}
   * indicating progress completed on the cothread.
   * @type integer
   */
  this.percent = percent;
};

/** Enumerant indicating that a cothread has finished.  */
CothreadStatus.FINISHED = 0;

/** Enumerant indicating that a cothread has been preempted.  */
CothreadStatus.PREEMPTED = 1;

/**
 * Maximum value that {@linkcode CothreadStatus#percent} may be.
 * Corresponds to 100%.
 */
CothreadStatus.MAX_PERCENT = 32767;


/* Abstract class for a render layer.  */




/* Projection methods.  */



/* Mathematical definitions of the Ocean Eddies Web Viewer.  */

/** Degrees to radians conversion constant.  */
var DEG2RAD = Math.PI / 180;

/** Radians to degrees conversion constant.  */
var RAD2DEG = 180 / Math.PI;

/**
 * Polar coordinate point.
 * @constructor
 * @param {Number} lat - latitude
 * @param {Number} lon - longitude
 */
var PolarPoint = function(lat, lon) {
  if (typeof lat != "undefined") {
    this.lat = lat;
    this.lon = lon;
  }
};

/**
 * Normalize the polar coordinate measured in degrees so that the
 * latitude is within -90 and 90 and the longitude is within -180 and
 * 180.
 * @param polarPt
 */
PolarPoint.degNormalize = function(polarPt) {
  polarPt.lat %= 180;
  polarPt.lon %= 360;
  if (polarPt.lat < -90) polarPt.lat += 180;
  if (polarPt.lat > 90) polarPt.lat -= 180;
  if (polarPt.lon < -180) polarPt.lon += 360;
  if (polarPt.lon >= 180) polarPt.lon -= 180;
};

/**
 * Method wrapper to static function.
 */
PolarPoint.prototype.degNormalize = function() {
  return PolarPoint.degNormalize(this);
};

/**
 * Create a new rectangular coordinate vector of unit length from a
 * given polar coordinate.  The polar coordinate must be in radians.
 * The positive pole is aligned with the positive Z axis, and
 * longitude zero points in the direction of the positive X axis.
 * @param polarPt
 */
PolarPoint.toPoint3D = function(polarPt) {
  var destPoint = new Point3D();
  destPoint.x = Math.cos(polarPt.lon);
  destPoint.y = Math.sin(polarPt.lon);
  destPoint.z = Math.sin(polarPt.lat);
  return destPoint;
};

/**
 * Method wrapper to static function.
 */
PolarPoint.prototype.toPoint3D = function() {
  return PolarPoint.toPoint3D(this);
};

/**
 * 2D rectangular coordinates point.
 * @constructor
 * @param x
 * @param y
 */
var Point2D = function(x, y) {
  if (typeof x != "undefined") {
    this.x = x;
    this.y = y;
  }
};

/**
 * Return a new point vector of unit length.
 * @param srcPoint
 */
Point2D.normalize = function(srcPoint) {
  var len = Math.sqrt(srcPoint.x * srcPoint.x +
        srcPoint.y * srcPoint.y);
  var destPoint = new Point2D();
  destPoint.x = srcPoint.x / len;
  destPoint.y = srcPoint.y / len;
  return destPoint;
};

/**
 * Method wrapper to static function.
 */
Point2D.prototype.normalize = function() {
  return Point2D.normalize(this);
};

/**
 * 3D rectangular coordinates point.
 * @constructor
 * @param x
 * @param y
 * @param z
 */
var Point3D = function(x, y, z) {
  if (typeof x != "undefined") {
    this.x = x;
    this.y = y;
    this.z = z;
  }
};

/**
 * Return a new copy of an existing point.
 */
Point3D.prototype.copy = function() {
  return new Point3D(this.x, this.y, this.z);
};

/**
 * Scale the point around the origin.
 * @param srcPoint
 * @param scaleFactor
 */
Point3D.scale = function(srcPoint, scaleFactor) {
  srcPoint.x *= scaleFactor;
  srcPoint.y *= scaleFactor;
  srcPoint.z *= scaleFactor;
};

/**
 * Method wrapper to static function.
 * @param scaleFactor
 */
Point3D.prototype.scale = function(scaleFactor) {
  return Point3D.scale(this, scaleFactor);
};

/**
 * Translate the point by the vector of another point.
 * @param srcPoint
 * @param vectorPt
 */
Point3D.translate = function(srcPoint, vectorPt) {
  srcPoint.x += vectorPt.x;
  srcPoint.y += vectorPt.y;
  srcPoint.z += vectorPt.z;
};

/**
 * Method wrapper to static function.
 * @param vectorPt
 */
Point3D.prototype.translate = function(vectorPt) {
  return Point3D.translate(this, vectorPt);
};

/**
 * Return a new point rotated around the X axis by the angle given in
 * radians.
 * @param srcPoint
 * @param angle
 */
Point3D.rotateX = function(srcPoint, angle) {
  var cosAngle = Math.cos(angle);
  var sinAngle = Math.sin(angle);
  var rotPoint = new Point3D();
  rotPoint.x = srcPoint.x;
  rotPoint.y = cosAngle * srcPoint.y - sinAngle * srcPoint.z;
  rotPoint.z = sinAngle * srcPoint.y + cosAngle * srcPoint.z;
  return rotPoint;
};

/**
 * Method wrapper to static function.
 * @param angle
 */
Point3D.prototype.rotateX = function(angle) {
  return Point3D.rotateX(this, angle);
};

/**
 * Return a new point rotated around the Y axis by the angle given in
 * radians.
 * @param srcPoint
 * @param angle
 */
Point3D.rotateY = function(srcPoint, angle) {
  var cosAngle = Math.cos(angle);
  var sinAngle = Math.sin(angle);
  var rotPoint = new Point3D();
  rotPoint.x = cosAngle * srcPoint.x - sinAngle * srcPoint.z;
  rotPoint.y = srcPoint.y;
  rotPoint.z = sinAngle * srcPoint.x + cosAngle * srcPoint.z;
  return rotPoint;
};

/**
 * Method wrapper to static function.
 * @param angle
 */
Point3D.prototype.rotateY = function(angle) {
  return Point3D.rotateY(this, angle);
};

/**
 * Return a new point rotated around the Z axis by the angle given in
 * radians.
 * @param srcPoint
 * @param angle
 */
Point3D.rotateZ = function(srcPoint, angle) {
  var cosAngle = Math.cos(angle);
  var sinAngle = Math.sin(angle);
  var rotPoint = new Point3D();
  rotPoint.x = cosAngle * srcPoint.x - sinAngle * srcPoint.y;
  rotPoint.y = sinAngle * srcPoint.x + cosAngle * srcPoint.y;
  rotPoint.z = srcPoint.z;
  return rotPoint;
};

/**
 * Method wrapper to static function.
 * @param angle
 */
Point3D.prototype.rotateZ = function(angle) {
  return Point3D.rotateZ(this, angle);
};

/**
 * Return a new point vector of unit length.
 * @param srcPoint
 */
Point3D.normalize = function(srcPoint) {
  var len = Math.sqrt(srcPoint.x * srcPoint.x +
        srcPoint.y * srcPoint.y +
        srcPoint.z * srcPoint.z);
  var destPoint = new Point3D();
  destPoint.x = srcPoint.x / len;
  destPoint.y = srcPoint.y / len;
  destPoint.z = srcPoint.z / len;a
  return destPoint;
};

/**
 * Method wrapper to static function.
 */
Point3D.prototype.normalize = function() {
  return Point3D.normalize(this);
};

/**
 * Create a new polar coordinate in radians from the given rectangular
 * coordinate.  The rectangular coordinate vector must be of unit
 * length.
 * @param srcPoint
 */
Point3D.toPolarPoint = function(srcPoint) {
  var polarPt = new PolarPoint();
  polarPt.lat = Math.asin(srcPoint.z);
  polarPt.lon = Math.atan2(srcPoint.y, srcPoint.x);
  return polarPt;
};

/**
 * Method wrapper to static function.
 */
Point3D.prototype.toPolarPoint = function() {
  return Point3D.toPolarPoint(this);
};

/**
 * Similar to {@linkcode Point3D.toPolarPoint}, but the polar axis is
 * the Y axis and longitude zero is aligned with the positive Z
 * axis.
 * @param srcPoint
 */
Point3D.toYPolarPoint = function(srcPoint) {
  var polarPt = new PolarPoint();
  polarPt.lat = Math.asin(srcPoint.y);
  polarPt.lon = Math.atan2(srcPoint.x, srcPoint.z);
  return polarPt;
};

/**
 * Method wrapper to static function.
 */
Point3D.prototype.toYPolarPoint = function() {
  return Point3D.toYPolarPoint(this);
};

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
  [ 0.5322, 1.0000 ] // 90
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
  var plen = table[tbIdx1][0] * (1 - interpol) + table[tbIdx2][0] * interpol;
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

/**
 * Abstract class for a render layer.  A derived class must be created
 * that has methods that do something useful.
 * @constructor
 */
var RenderLayer = function() {
  /**
   * RenderLayer front buffer (HTML Canvas), used for storing
   * completed renders.  This can either be manually composited into
   * another Canvas or inserted into the document for automatic
   * compositing of render layers.
   * @readonly
   */
  this.frontBuf = document.createElement("canvas");
  this.frontBuf.innerHTML = "Sorry, your browser doesn't support the " +
    "&lt;canvas&gt; element.";
};

/**
 * Set the limits of this rendering engine's internal caches.
 * Internal caches are very implementation-specific, but they can be
 * generalized to the two parameters that this function accepts.
 *
 * For trivial rendering units, the data cache and render cache will
 * be identical.
 * @abstract
 *
 * @param {integer} dataCache - Data loaded from an external source,
 * measured in implementation-specific entities.
 *
 * @param {integer} renderCache - Maximum size of prerendered images,
 * measured in pixels.
 */
RenderLayer.prototype.setCacheLimits = function(dataCache, renderCache) {
  throw new Error("Must be implemented by a subclass!");
};

/**
 * Load any pending data resources that must be loaded.  This function
 * is cothreaded so that a controlling function can provide
 * responsiveness.
 * @abstract
 *
 * @returns the cothread status of the data load operation.
 */
RenderLayer.prototype.loadData = function() {
  throw new Error("Must be implemented by a subclass!");
};

RenderLayer.READY = 0;
RenderLayer.NEED_DATA = 1;

/**
 * Setup the viewport and projection of a render layer.
 * @abstract
 *
 * @param {AbstractPoint} center - The point in the content
 * coordinate space that should appear at the center of the viewport.
 * @param {integer} width - The width of the rendering viewport in
 * pixels.
 * @param {integer} height - The height of the rendering viewport in
 * pixels.
 * @param {Number} aspectXY - X/Y aspect ratio.  This parameter is
 * used to scale the Y axis to preserve the indicated aspect ratio for
 * the normalized coordinates [-1..1].  The normalized Y coordinate is
 * then scaled to be in terms of the actual height of the viewport.
 * @param {Projector} projector - The projector to use for rendering
 * the content into the viewport.
 *
 * @returns One of the following constants:
 *
 *  * RenderLayer.READY --- Changing the viewport was successful and a
 *    render may immediately proceed.
 *
 *  * RenderLayer.NEED_DATA --- The new viewport requires additional
 *    data that needs to be loaded.
 */
RenderLayer.prototype.setViewport =
  function(center, width, height, aspectXY, projector) {
  throw new Error("Must be implemented by a subclass!");
};

RenderLayer.FRAME_AVAIL = 0;
RenderLayer.NO_DISP_FRAME = 1;

/**
 * Cothreaded rendering routine.
 * @abstract
 *
 * @returns The cothread status of the data load operation.  When the
 * cothread gets preempted before the rendering task is finished, the
 * CothreadStatus preemptCode is one of the following values:
 *
 *  * RenderLayer.FRAME_AVAIL --- A partial frame has been rendered
 *    that is suitable for display.
 *
 *  * RenderLayer.NO_DISP_FRAME --- The partial frame is not suitable
 *    for display.
 */
RenderLayer.prototype.render = function() {
  throw new Error("Must be implemented by a subclass!");
};



/* Render layer for display of the eddy tracks layer.  */



TracksLayer = new RenderLayer();
TracksLayer.IOWAIT = 1;
TracksLayer.PROC_DATA = 2;

TracksLayer.setCacheLimits = function(dataCache, renderCache) {
};

/**
 * Cothreaded data loading function.  The cothreaded function takes no
 * parameters and returns `true' on success, `false' on failure.
 *
 * The CothreadStatus preemptCode may be one of the following values:
 *
 * * TracksLayer.IOWAIT --- The cothread is waiting for an
 *   XMLHttpRequest to finish.  For optimal performance, the
 *   controller should not explicitly call continueCT(), since the
 *   asynchronous calling will be handled by the browser during data
 *   loading.  When the data is finished being loaded, this cothread
 *   will explicitly yield control to the controller.
 *
 * * TracksLayer.PROC_DATA --- The cothread has been preempted when it was
 *   processing data rather than waiting for data.
 */
TracksLayer.loadData = (function() {
  "use strict";

  function alertContents() {
    var httpRequest = TracksLayer.loadData.httpRequest;
    if (!httpRequest)
      return;
    switch (httpRequest.readyState) {
    case 4: // DONE
      if (httpRequest.status == 200) {
 // Call the main loop to continue cothread execution.
 return execTime();
      } else {
 throw new Error("There was a problem with the HTTP request.");
      }
      break;
    case 3: // LOADING
      /* NOTE: In some browsers, doing this can dramatically reduce
	 download speed, so we avoid it.  In the future, we should
	 only do it after a timeout of two seconds.  */
      // Call the main loop to update the download status.
      // return execTime();
      break;
    case 2: // HEADERS_RECEIVED
      TracksLayer.loadData.reqLen = httpRequest.getResponseHeader("Content-Length");
      break;
    }
  }

  function startExec() {
    var url = "../data/tracks/acyc_bu_tracks.json";
    var httpRequest;

    if (window.XMLHttpRequest)
      httpRequest = new XMLHttpRequest();
    else if (window.ActiveXObject) {
      try {
 httpRequest = new ActiveXObject("Msxml2.XMLHTTP");
      }
      catch (e) {
 try {
   httpRequest = new ActiveXObject("Microsoft.XMLHTTP");
 }
 catch (e) {}
      }
    }

    if (!httpRequest) {
      throw new Error("Could not load the data!");
    }

    httpRequest.onreadystatechange = alertContents;
    httpRequest.open("GET", url, true);
    // httpRequest.setRequestHeader("Range", "bytes=0-500");
    httpRequest.send();
    this.reqLen = 0;
    this.readyDataProcess = false;

    this.httpRequest = httpRequest;
  }

  /** This function primarily retrieves the current loading status of
      the XMLHttpRequest.  */
  function contExec() {
    var httpRequest = this.httpRequest;
    var reqLen = this.reqLen;

    if (!httpRequest) {
      this.status.returnType = CothreadStatus.FINISHED;
      this.status.preemptCode = 0;
      return this.status;
    } else if (httpRequest.readyState != 4) {
      this.status.returnType = CothreadStatus.PREEMPTED;
      this.status.preemptCode = TracksLayer.IOWAIT;
      if (reqLen) {
 this.status.percent = httpRequest.responseText.length *
   CothreadStatus.MAX_PERCENT / reqLen;
      } else
 this.status.percent = 0;
      return this.status;
    }
    // (httpRequest.readyState == 4)

    // JSON parsing is slow: Return here and come back later.
    if (!this.readyDataProcess) {
      this.readyDataProcess = true;
      this.status.returnType = CothreadStatus.PREEMPTED;
      this.status.preemptCode = TracksLayer.PROC_DATA;
      return this.status;
    }

    this.status.percent = CothreadStatus.MAX_PERCENT;

    // Process the data here.

    TracksLayer.tracksData = JSON.parse(httpRequest.responseText);
    httpRequest.onreadystatechange = null;
    this.httpRequest = null;

    this.status.returnType = CothreadStatus.FINISHED;
    this.status.preemptCode = 0;

    return this.status;
  }

  return new Cothread(startExec, contExec);
})();

TracksLayer.setViewport = function(center, width, height,
       aspectXY, projector) {
  // RenderLayer.call(center, width, height, projection);
  this.frontBuf.width = width;
  this.frontBuf.height = height;

  this.aspectXY = aspectXY;
  this.center = center;
  this.projector = projector;

  return RenderLayer.READY;
};

var backbufScale = 1;
var minTrackLen = 0, maxTrackLen = -1;
var numericDates = [];
var dateIndex = 0;
var inv_180 = 1 / 180, inv_360 = 1 / 360;

TracksLayer.render = (function() {
  "use strict";

  function startExec() {
    var frontBuf = TracksLayer.frontBuf;
    var edc = frontBuf.getContext("2d");
    this.edc = edc;

    edc.clearRect(0, 0, frontBuf.width, frontBuf.height);
    edc.lineWidth = backbufScale;
    edc.strokeStyle = "#800080";
    edc.lineJoin = "round";

    this.i = 0;
  }

  function contExec() {
    var edc = this.edc;
    var i = this.i;

    /* Data format: [list of tracks]
       track: [ list of eddies ]
       eddy: [ latitude, longitude, date_index, eddy_index ]
     */
    var tracksData = TracksLayer.tracksData;
    var numTracks = tracksData.length;
    var frontBuf_width = TracksLayer.frontBuf.width;
    var frontBuf_height = TracksLayer.frontBuf.height;
    var aspectXY = TracksLayer.aspectXY;
    // var projector = TracksLayer.projector;
    var projector_project = TracksLayer.projector.project;

    var lDate_now = Date.now;

    var lastTime = lDate_now();
    var timeout = this.timeout;
    for (; lDate_now() - lastTime < timeout && i < numTracks; i++) {
      if (minTrackLen > 0 || maxTrackLen != -1) {
 // Determine the length of the eddy in weeks.
 var numEddies = tracksData[i].length;
 var firstDateIdx = tracksData[i][0][2];
 var lastDateIdx = tracksData[i][numEddies-1][2];
 var trackLen = numericDates[lastDateIdx] - numericDates[firstDateIdx];

 if (trackLen < minTrackLen)
   continue;
 if (maxTrackLen != -1 && trackLen > maxTrackLen)
   continue;
      }

      edc.beginPath();
      // var lat = tracksData[i][0][0];
      // var lon = tracksData[i][0][1];
      // var mapX = (lon + 180) * inv_360 * frontBuf_width;
      // var mapY = (90 - lat) * inv_180 * frontBuf_heightY;
      var polCoord = { lat: tracksData[i][0][0], lon: tracksData[i][0][1] };
      var mapCoord = projector_project(polCoord);
      edc.moveTo((mapCoord.x + 1) * 0.5 * frontBuf_width,
   (-mapCoord.y * aspectXY + 1) * 0.5 * frontBuf_height);
      for (var j = 1; j < tracksData[i].length; j++) {
 // lat = tracksData[i][j][0];
 // lon = tracksData[i][j][1];
 // mapX = (lon + 180) * inv_360 * frontBuf_width;
 // mapY = (90 - lat) * inv_180 * frontBuf_height;
 polCoord = { lat: tracksData[i][j][0], lon: tracksData[i][j][1] };
 mapCoord = projector_project(polCoord);
 edc.lineTo((mapCoord.x + 1) * 0.5 * frontBuf_width,
     (-mapCoord.y * aspectXY + 1) * 0.5 * frontBuf_height);
 if (tracksData[i][j][2] == dateIndex)
   edc.arc(mapX, mapY, 2 * backbufScale, 0, 2 * Math.PI, false);
      }
      edc.stroke();
    }

    this.setExitStatus(i < numTracks);
    this.status.preemptCode = 0;
    this.status.percent = i * CothreadStatus.MAX_PERCENT / numTracks;

    this.i = i;
    return this.status;
  }

  return new Cothread(startExec, contExec);
})();


/* Render layer for display of the Sea Surface Height (SSH).  */



SSHLayer = new RenderLayer();
SSHLayer.IOWAIT = 1;
SSHLayer.PROC_DATA = 2;

/*

Load the data
Process the data into an image
Done

 */
/* Note: This algorithm needs a newline at the end of the file.  It
   also does not handle files with non-Unix line endings.  */
function csvParse(csvText) {
  var tgtArray = [];
  var i = 0;
  var rowEnd;

  while ((rowEnd = csvText.indexOf('\n', i)) != -1) {
    var taEnd = tgtArray.push([]) - 1;
    var commaIdx;

    while ((commaIdx = csvText.indexOf(',', i)) < rowEnd &&
    commaIdx != -1) {
      tgtArray[taEnd].push(csvText.substring(i, commaIdx));
      i = commaIdx + 1
    }

    if (csvText[rowEnd-1] != ',') {
      // Parse the last entry in the row.
      tgtArray[taEnd].push(csvText.substring(i, rowEnd))
    }
    i = rowEnd + 1
  }

  return tgtArray;
}


SSHLayer.setCacheLimits = function(dataCache, renderCache) {
};

/**
 * Cothreaded data loading function.  This function only initiates
 * loading of one SSH frame at initialization and the cothread loop
 * only tells whether the image has been fully loaded or not.
 */
SSHLayer.loadData = (function() {
  "use strict";

  function alertContents() {
    var httpRequest = SSHLayer.loadData.httpRequest;
    if (!httpRequest)
      return;
    switch (httpRequest.readyState) {
    case 4: // DONE
      if (httpRequest.status == 200) {
 // Call the main loop to continue cothread execution.
 return execTime();
      } else {
 throw new Error("There was a problem with the HTTP request.");
      }
      break;
    case 3: // LOADING
      /* NOTE: In some browsers, doing this can dramatically reduce
	 download speed, so we avoid it.  In the future, we should
	 only do it after a timeout of two seconds.  */
      // Call the main loop to update the download status.
      // return execTime();
      break;
    case 2: // HEADERS_RECEIVED
      SSHLayer.loadData.reqLen = httpRequest.getResponseHeader("Content-Length");
      break;
    }
  }

  function startExec() {
    var url = "../data/SSH/ssh_19930303.dat";
    var httpRequest;

    if (window.XMLHttpRequest)
      httpRequest = new XMLHttpRequest();
    else if (window.ActiveXObject) {
      try {
 httpRequest = new ActiveXObject("Msxml2.XMLHTTP");
      }
      catch (e) {
 try {
   httpRequest = new ActiveXObject("Microsoft.XMLHTTP");
 }
 catch (e) {}
      }
    }

    if (!httpRequest) {
      throw new Error("Could not load the data!");
    }

    httpRequest.onreadystatechange = alertContents;
    httpRequest.open("GET", url, true);
    // httpRequest.setRequestHeader("Range", "bytes=0-500");
    httpRequest.send();
    this.reqLen = 0;
    this.readyDataProcess = false;

    this.httpRequest = httpRequest;
  }

  /** This function primarily retrieves the current loading status of
      the XMLHttpRequest.  */
  function contExec() {
    var httpRequest = this.httpRequest;
    var reqLen = this.reqLen;

    if (!httpRequest) {
      this.status.returnType = CothreadStatus.FINISHED;
      this.status.preemptCode = 0;
      return this.status;
    } else if (httpRequest.readyState != 4) {
      this.status.returnType = CothreadStatus.PREEMPTED;
      this.status.preemptCode = SSHLayer.IOWAIT;
      if (reqLen) {
 this.status.percent = httpRequest.responseText.length *
   CothreadStatus.MAX_PERCENT / reqLen;
      } else
 this.status.percent = 0;
      return this.status;
    }
    // (httpRequest.readyState == 4)

    // JSON parsing is slow: Return here and come back later.
    if (!this.readyDataProcess) {
      this.readyDataProcess = true;
      this.status.returnType = CothreadStatus.PREEMPTED;
      this.status.preemptCode = SSHLayer.PROC_DATA;
      return this.status;
    }

    this.status.percent = CothreadStatus.MAX_PERCENT;

    // Process the data here.

    SSHLayer.sshData = csvParse(httpRequest.responseText);
    httpRequest.onreadystatechange = null;
    this.httpRequest = null;

    this.status.returnType = CothreadStatus.FINISHED;
    this.status.preemptCode = 0;

    return this.status;
  }

  return new Cothread(startExec, contExec);
})();

SSHLayer.setViewport = function(center, width, height,
       aspectXY, projector) {
  // RenderLayer.call(center, width, height, projection);
  this.frontBuf.width = width;
  this.frontBuf.height = height;
  this.aspectXY = aspectXY;

  this.center = center;
  this.projector = projector;

  return RenderLayer.READY;
};

var backbufScale = 1;
var minTrackLen = 0, maxTrackLen = -1;
var numericDates = [];
var dateIndex = 0;
var inv_180 = 1 / 180, inv_360 = 1 / 360;

SSHLayer.render = (function() {
  "use strict";

  function startExec() {
    var frontBuf = SSHLayer.frontBuf;
    var ctx = frontBuf.getContext("2d");
    this.ctx = ctx;
    var destImg = ctx.createImageData(frontBuf.width, frontBuf.height);
    this.destImg = destImg;
    this.destIdx = 0;

    // Generate the color table.
    var grad = [ [ 0x00, 0x00, 0x7f ],
   [ 0x00, 0x00, 0xff ],
   [ 0x00, 0x7f, 0xff ],
   [ 0x00, 0xff, 0xff ],
   [ 0x7f, 0xff, 0x7f ],
   [ 0xff, 0xff, 0x00 ],
   [ 0xff, 0x7f, 0x00 ],
   [ 0xff, 0x00, 0x00 ],
   [ 0x7f, 0x00, 0x00 ] ];

    var colorTbl = [];
    for (var i = 0; i < 256; i++) {
 var value = i / 256 * 8;
 var index = ~~value;
 var ix2 = index + 1;
 if (ix2 > 8) ix2 = 8;
 var interpol = value % 1;
 colorTbl.push((1 - interpol) * grad[index][0] +
        interpol * grad[ix2][0]);
 colorTbl.push((1 - interpol) * grad[index][1] +
        interpol * grad[ix2][1]);
 colorTbl.push((1 - interpol) * grad[index][2] +
        interpol * grad[ix2][2]);
 colorTbl.push(255);
    }
    this.colorTbl = colorTbl;

    ctx.clearRect(0, 0, frontBuf.width, frontBuf.height);

    this.x = 0;
    this.y = 0;
  }

  function contExec() {
    var ctx = this.ctx;
    var destImg = this.destImg;
    var destIdx = this.destIdx;
    var x = this.x;
    var y = this.y;
    var oldY = y;
    var colorTbl = this.colorTbl;

    var sshData = SSHLayer.sshData;
    var frontBuf_width = SSHLayer.frontBuf.width;
    var frontBuf_height = SSHLayer.frontBuf.height;
    var src_width = sshData[0].length;
    var src_height = sshData.length;
    var aspectXY = SSHLayer.aspectXY;
    var inv_aspectXY = 1 / aspectXY;
    // var projector = SSHLayer.projector;
    var projector_unproject = SSHLayer.projector.unproject;

    var lDate_now = Date.now;

    var lastTime = lDate_now();
    var timeout = this.timeout;

    while (this.y < frontBuf_height) {
      while (this.x < frontBuf_width) {
 var mapCoord = { x: (x / frontBuf_width) * 2 - 1,
    y: -((y / frontBuf_height) * 2 - 1) * inv_aspectXY };
 // var polCoord = projector_unproject(mapCoord);
 var polCoord = { lat: mapCoord.y * 180, lon: mapCoord.x * 180 };
 /* if (!isNaN(polCoord.lat) && !isNaN(polCoord.lon) &&
	    polCoord.lat > -90 && polCoord.lat < 90 &&
	    polCoord.lon > -180 && polCoord.lon < 180) */
   /* SSH strangeness: The SSH data measures from the international
	     date line, not the prime meridian?  */
   var latIdx = ~~((((((-((y / frontBuf_height) * 2 - 1) * inv_aspectXY) * 180) + 90) / 180) % 1) * src_height);
   var lonIdx = ~~(((((((x / frontBuf_width) * 2 - 1) * 180) + 180 + 180) / 360) % 1) * src_width);
   var value = sshData[latIdx][lonIdx] / 32;
   // var value = sshData[~~((((((-((this.y / frontBuf_height) * 2 - 1) * inv_aspectXY) * 180) + 90) / 180) % 1) * src_height)][~~(((((((this.x / frontBuf_width) * 2 - 1) * 180) + 180 + 180) / 360) % 1) * src_width)] / 32;

   if (value > 1) value = 1;
   if (value < -1) value = -1;
   value = (~~((value + 1) / 2 * 255)) /* << 2 */;

   destImg.data[destIdx++] = value;//colorTbl[value++];
   destImg.data[destIdx++] = value;//colorTbl[value++];
   destImg.data[destIdx++] = value;//colorTbl[value++];
   destImg.data[destIdx++] = value;//colorTbl[value++];
 this.x++;
 /* if (lDate_now() - lastTime >= timeout)
	  break; */
      }
      if (this.x >= frontBuf_width) {
 this.x = 0;
 this.y++;
      }
      if (this.y % 32 == 0 && lDate_now() - lastTime >= timeout)
 break;
    }

    y = this.y;
    x = this.x;
    this.setExitStatus(y < frontBuf_height);
    ctx.putImageData(destImg, 0, 0, 0, oldY, frontBuf_width, y - oldY);
    this.status.preemptCode = 0;
    this.status.percent = y * CothreadStatus.MAX_PERCENT / frontBuf_height;

    this.destIdx = destIdx;
    this.x = x;
    this.y = y;
    return this.status;
  }

  return new Cothread(startExec, contExec);
})();
