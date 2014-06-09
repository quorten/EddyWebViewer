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
 * 180.  */
PolarPoint.degNormalize = function(polarPt) {
  polarPt.lat %= 180;
  polarPt.lon %= 360;
  if (polarPt.lat < -90) polarPt.lat += 180;
  if (polarPt.lat > 90) polarPt.lat -= 180;
  if (polarPt.lon < -180) polarPt.lon += 360;
  if (polarPt.lon >= 180) polarPt.lon -= 180;
};

/** Method wrapper to static function.  */
PolarPoint.prototype.degNormalize = function() {
  return PolarPoint.degNormalize(this);
};

/**
 * Create a new rectangular coordinate vector of unit length from a
 * given polar coordinate.  The polar coordinate must be in radians.
 * The positive pole is aligned with the positive Z axis, and
 * longitude zero points in the direction of the positive X axis.
 */
PolarPoint.toPoint3D = function(polarPt) {
  var destPoint = new Point3D();
  destPoint.x = Math.cos(polarPt.lon);
  destPoint.y = Math.sin(polarPt.lon);
  destPoint.z = Math.sin(polarPt.lat);
  return destPoint;
};

/** Method wrapper to static function.  */
PolarPoint.prototype.toPoint3D = function() {
  return PolarPoint.toPoint3D(this);
};

/**
 * 2D rectangular coordinates point.
 * @constructor
 */
var Point2D = function(x, y) {
  if (typeof x != "undefined") {
    this.x = x;
    this.y = y;
  }
};

/** Return a new point vector of unit length.  */
Point2D.normalize = function(srcPoint) {
  var len = Math.sqrt(srcPoint.x * srcPoint.x +
		      srcPoint.y * srcPoint.y);
  var destPoint = new Point2D();
  destPoint.x = srcPoint.x / len;
  destPoint.y = srcPoint.y / len;
  return destPoint;
};

/** Method wrapper to static function.  */
Point2D.prototype.normalize = function() {
  return Point2D.normalize(this);
};

/**
 * 3D rectangular coordinates point.
 * @constructor
 */
var Point3D = function(x, y, z) {
  if (typeof x != "undefined") {
    this.x = x;
    this.y = y;
    this.z = z;
  }
};

/** Return a new copy of an existing point.  */
Point3D.prototype.copy = function() {
  return new Point3D(this.x, this.y, this.z);
};

/** Scale the point around the origin.  */
Point3D.scale = function(srcPoint, scaleFactor) {
  srcPoint.x *= scaleFactor;
  srcPoint.y *= scaleFactor;
  srcPoint.z *= scaleFactor;
};

/** Method wrapper to static function.  */
Point3D.prototype.scale = function(scaleFactor) {
  return Point3D.scale(this, scaleFactor);
};

/** Translate the point by the vector of another point.  */
Point3D.translate = function(srcPoint, vectorPt) {
  srcPoint.x += vectorPt.x;
  srcPoint.y += vectorPt.y;
  srcPoint.z += vectorPt.z;
};

/** Method wrapper to static function.  */
Point3D.prototype.translate = function(vectorPt) {
  return Point3D.translate(this, vectorPt);
};

/** Return a new point rotated around the X axis by the angle given in
    radians.  */
Point3D.rotateX = function(srcPoint, angle) {
  var cosAngle = Math.cos(angle);
  var sinAngle = Math.sin(angle);
  var rotPoint = new Point3D();
  rotPoint.x = srcPoint.x;
  rotPoint.y = cosAngle * srcPoint.y - sinAngle * srcPoint.z;
  rotPoint.z = sinAngle * srcPoint.y + cosAngle * srcPoint.z;
  return rotPoint;
};

/** Method wrapper to static function.  */
Point3D.prototype.rotateX = function(angle) {
  return Point3D.rotateX(this, angle);
};

/** Return a new point rotated around the Y axis by the angle given in
    radians.  */
Point3D.rotateY = function(srcPoint, angle) {
  var cosAngle = Math.cos(angle);
  var sinAngle = Math.sin(angle);
  var rotPoint = new Point3D();
  rotPoint.x = cosAngle * srcPoint.x - sinAngle * srcPoint.z;
  rotPoint.y = srcPoint.y;
  rotPoint.z = sinAngle * srcPoint.x + cosAngle * srcPoint.z;
  return rotPoint;
};

/** Method wrapper to static function.  */
Point3D.prototype.rotateY = function(angle) {
  return Point3D.rotateY(this, angle);
};

/** Return a new point rotated around the Z axis by the angle given in
    radians.  */
Point3D.rotateZ = function(srcPoint, angle) {
  var cosAngle = Math.cos(angle);
  var sinAngle = Math.sin(angle);
  var rotPoint = new Point3D();
  rotPoint.x = cosAngle * srcPoint.x - sinAngle * srcPoint.y;
  rotPoint.y = sinAngle * srcPoint.x + cosAngle * srcPoint.y;
  rotPoint.z = srcPoint.z;
  return rotPoint;
};

/** Method wrapper to static function.  */
Point3D.prototype.rotateZ = function(angle) {
  return Point3D.rotateZ(this, angle);
};

/** Return a new point vector of unit length.  */
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

/** Method wrapper to static function.  */
Point3D.prototype.normalize = function() {
  return Point3D.normalize(this);
};

/** Create a new polar coordinate in radians from the given
    rectangular coordinate.  The rectangular coordinate vector must be
    of unit length.  */
Point3D.toPolarPoint = function(srcPoint) {
  var polarPt = new PolarPoint();
  polarPt.lat = Math.asin(srcPoint.z);
  polarPt.lon = Math.atan2(srcPoint.y, srcPoint.x);
  return polarPt;
};

/** Method wrapper to static function.  */
Point3D.prototype.toPolarPoint = function() {
  return Point3D.toPolarPoint(this);
};

/** Similar to {@linkcode Point3D.toPolarPoint}, but the polar axis is
    the Y axis and longitude zero is aligned with the positive Z
    axis.  */
Point3D.toYPolarPoint = function(srcPoint) {
  var polarPt = new PolarPoint();
  polarPt.lat = Math.asin(srcPoint.y);
  polarPt.lon = Math.atan2(srcPoint.x, srcPoint.z);
  return polarPt;
};

/** Method wrapper to static function.  */
Point3D.prototype.toYPolarPoint = function() {
  return Point3D.toYPolarPoint(this);
};
