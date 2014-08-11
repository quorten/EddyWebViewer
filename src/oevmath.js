/* Mathematical definitions of the Ocean Eddies Web Viewer.  Many of
   these mathematical definitions turned out to be extra and don't
   have much use in the implementation of the Ocean Eddies Web
   Viewer.  */

import "oevns";

/** Degrees to radians conversion constant.  */
var DEG2RAD = Math.PI / 180;
OEV.DEG2RAD = DEG2RAD;

/** Radians to degrees conversion constant.  */
var RAD2DEG = 180 / Math.PI;
OEV.RAD2DEG = RAD2DEG;

/**
 * Polar coordinate point.  "r" is always 1.
 * @constructor
 * @param {Number} lat - latitude
 * @param {Number} lon - longitude
 */
var PolarPoint = function(lat, lon) {
  if (typeof(lon) != "undefined") {
    this.lat = lat;
    this.lon = lon;
  }
};

OEV.PolarPoint = PolarPoint;

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
 * Convert a PolarPoint in radians to one in degrees.
 */
PolarPoint.radToDeg = function(polarPt) {
  polarPt.lat *= RAD2DEG;
  polarPt.lon *= RAD2DEG;
};

/**
 * Method wrapper to static function.
 */
PolarPoint.prototype.radToDeg = function() {
  return PolarPoint.radToDeg(this);
};

/**
 * Convert a PolarPoint in degrees to one in radians.
 */
PolarPoint.degToRad = function(polarPt) {
  polarPt.lat *= DEG2RAD;
  polarPt.lon *= DEG2RAD;
};

/**
 * Method wrapper to static function.
 */
PolarPoint.prototype.degToRad = function() {
  return PolarPoint.degToRad(this);
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
  destPoint.x = Math.cos(polarPt.lon) * Math.cos(polarPt.lat);
  destPoint.y = Math.sin(polarPt.lon) * Math.cos(polarPt.lat);
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
 * Similar to {@linkcode PolarPoint.toPoint3D}, but the polar axis is
 * the Y axis and longitude zero is aligned with the positive Z axis.
 * @param polarPt
 */
PolarPoint.yppToPoint3D = function(polarPt) {
  var destPoint = new Point3D();
  destPoint.x = Math.sin(polarPt.lon) * Math.cos(polarPt.lat);
  destPoint.y = Math.sin(polarPt.lat);
  destPoint.z = Math.cos(polarPt.lon) * Math.cos(polarPt.lat);
  return destPoint;
};

/**
 * Method wrapper to static function.
 */
PolarPoint.prototype.yppToPoint3D = function() {
  return PolarPoint.yppToPoint3D(this);
};

/**
 * 2D rectangular coordinates point.
 * @constructor
 * @param x
 * @param y
 */
var Point2D = function(x, y) {
  if (typeof(x) != "undefined") {
    this.x = x;
    this.y = y;
  }
};

OEV.Point2D = Point2D;

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
  if (typeof(x) != "undefined") {
    this.x = x;
    this.y = y;
    this.z = z;
  }
};

OEV.Point3D = Point3D;

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
 * the Y axis and longitude zero is aligned with the positive Z axis.
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

/*

Same as:

polarPt = new PolarPoint(polarPt[1], polarPt[0]);
polarPt.degToRad();
var r3src = polarPt.yppToPoint3D();
var r3dest = r3src.copy();
r3dest.rotateX(-fwd * DEG2RAD * ViewParams.polCenter[1]);
var polDest = r3dest.toYPolarPoint();
polDest.radToDeg();
polDest.lon += 180 - fwd * ViewParams.polCenter[0];
polDest.degNormalize();
polarPt[0] = polDest.lon;
polarPt[1] = polDest.lat;

 */

/**
 * Rotate a point to so that it is on a globe with
 * `ViewParams.polCenter` as the center.
 * @param {Array} polarPt - The polar point to transform
 * @param {integer} fwd - +1 if this is for forward transformation, -1
 * if it is for reverse transformation.
 */
var polShiftOrigin = function(polarPt, fwd) {
  if (isNaN(polarPt[0]))
    return;
  /* 1. Get the 3D rectangular coordinate of the given polar
     coordinate.  The camera is looking down the negative z axis.  */
  var r3src_x, r3src_y, r3src_z;

  var latitude = DEG2RAD * polarPt[1];
  var longitude = DEG2RAD * polarPt[0];
  r3src_y = Math.sin(latitude);
  r3src_x = Math.sin(longitude) * Math.cos(latitude);
  r3src_z = Math.cos(longitude) * Math.cos(latitude);

  /* 2. Inverse rotate this coordinate around the x axis by the
     current globe tilt.  */
  var i_tilt = -fwd * DEG2RAD * ViewParams.polCenter[1];
  var cos_tilt = Math.cos(i_tilt); var sin_tilt = Math.sin(i_tilt);
  var r3dest_x, r3dest_y, r3dest_z;
  r3dest_x = r3src_x;
  r3dest_z = r3src_z * cos_tilt - r3src_y * sin_tilt;
  r3dest_y = r3src_z * sin_tilt + r3src_y * cos_tilt;

  /* 3. Measure the latitude and longitude of this coordinate.  */
  latitude = RAD2DEG * Math.asin(r3dest_y);
  longitude = RAD2DEG * Math.atan2(r3dest_x, r3dest_z);

  /* 4. Shift by the longitudinal rotation around the pole.  */
  longitude += 180 - fwd * ViewParams.polCenter[0];

  /* 5. Verify that the coordinates are in bounds.  */
  if (latitude < -90) latitude = -90;
  if (latitude > 90) latitude = 90;
  longitude += (longitude < 0) * 360;
  longitude = longitude % 360.0 - 180;
  polarPt[0] = longitude;
  polarPt[1] = latitude;
};

OEV.polShiftOrigin = polShiftOrigin;
