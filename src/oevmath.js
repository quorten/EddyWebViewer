/* Mathematical definitions of the Ocean Eddies Web Viewer.  Many of
   these mathematical definitions aren't actually used in the main
   body code, but they are here for completeness: the main body code
   algorithms were derived by hand-optimizing compositions of these
   primitives.  */

import "oevns";

/** Degrees to radians conversion constant.  */
var DEG2RAD = Math.PI / 180;
OEV.DEG2RAD = DEG2RAD;

/** Radians to degrees conversion constant.  */
var RAD2DEG = 180 / Math.PI;
OEV.RAD2DEG = RAD2DEG;

/** 1 / 180 */
var inv_180 = 1 / 180;
/** 1 / 360 */
var inv_360 = 1 / 360;

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
  if (polarPt.lat < -90)
    { polarPt.lat = -180 - polarPt.lat; polarPt.lon += 180; }
  if (polarPt.lat > 90)
    { polarPt.lat = 180 - polarPt.lat; polarPt.lon += 180 }
  polarPt.lon %= 360;
  if (polarPt.lon < -180) polarPt.lon += 360;
  if (polarPt.lon >= 180) polarPt.lon -= 360;
  return polarPt;
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
  return polarPt;
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
  return polarPt;
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
  return srcPoint;
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
  return srcPoint;
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
  rotPoint.x = sinAngle * srcPoint.z + cosAngle * srcPoint.x;
  rotPoint.y = srcPoint.y;
  rotPoint.z = cosAngle * srcPoint.z - sinAngle * srcPoint.x;
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

/********************************************************************/

/**
 * This function is the same as {@linkcode polShiftOrigin}, except
 * that it is decomposed into the respective conceptual modules.
 */
var modPolShiftOrigin = function(polarPt, fwd) {
  var objPolarPt = new PolarPoint(polarPt[1], polarPt[0]);
  var r3src = objPolarPt.degToRad().yppToPoint3D();
  // FIXME: Why does using fwd cause incorrect results?
  var r3dest = r3src.rotateX(/* fwd * */ -DEG2RAD * gViewParams.polCenter[1]);
  var polDest = r3dest.toYPolarPoint().radToDeg();
  polDest.lon += -fwd * gViewParams.polCenter[0];
  polDest.degNormalize();
  polarPt[0] = polDest.lon;
  polarPt[1] = polDest.lat;
};

OEV.modPolShiftOrigin = modPolShiftOrigin;

/**
 * Rotate a point to so that it is on a globe with
 * `gViewParams.polCenter` as the center.
 * @param {Array} polarPt - The polar point to transform
 * @param {integer} fwd - +1 if this is for forward transformation, -1
 * if it is for reverse transformation.
 */
var polShiftOrigin = function(polarPt, fwd) {
  var polCenter = gViewParams.polCenter;
  if (isNaN(polarPt[0]))
    return;
  if (fwd > 0)
    polarPt[0] += 180 - polCenter[0];
  if (polCenter[1] != 0) {
    /* 1. Get the 3D rectangular coordinate of the given polar
       coordinate.  The camera is looking down the negative z
       axis.  */
    var r3src_x, r3src_y, r3src_z;

    var latitude = DEG2RAD * polarPt[1];
    var longitude = DEG2RAD * polarPt[0];
    r3src_y = Math.sin(latitude);
    r3src_x = Math.sin(longitude) * Math.cos(latitude);
    r3src_z = Math.cos(longitude) * Math.cos(latitude);

    /* 2. Rotate this coordinate around the x axis by the current
       globe tilt.  */
    // FIXME: Why does using fwd cause incorrect results?
    // Force negative rather than use `fwd'.
    var tilt = /* fwd * */ -DEG2RAD * polCenter[1];
    var cos_tilt = Math.cos(tilt); var sin_tilt = Math.sin(tilt);
    var r3dest_x, r3dest_y, r3dest_z;
    r3dest_x = r3src_x;
    r3dest_y = r3src_y * cos_tilt - r3src_z * sin_tilt;
    r3dest_z = r3src_y * sin_tilt + r3src_z * cos_tilt;

    /* 3. Measure the latitude and longitude of this coordinate.  */
    latitude = RAD2DEG * Math.asin(r3dest_y);
    longitude = RAD2DEG * Math.atan2(r3dest_x, r3dest_z);

    /* 4. Shift by the longitudinal rotation around the pole.  For the
       sake of the normalization calculation below, move the prime
       meridian to 180 degrees.  */
    if (fwd < 0)
      longitude += 180 + polCenter[0];
  } else {
    /* Only perform the longitude shift computations.  For the sake of
       the normalization calculation below, move the prime meridian to
       180 degrees.  */
    latitude = polarPt[1];
    if (fwd < 0)
      longitude = polarPt[0] + 180 + polCenter[0];
    else longitude = polarPt[0];
  }

  /* 5. Verify that the coordinates are in bounds.  */
  if (latitude < -90) latitude = -90;
  if (latitude > 90) latitude = 90;
  longitude %= 360;
  longitude += (longitude < 0) * 360;
  longitude -= 180;
  polarPt[0] = longitude;
  polarPt[1] = latitude;
};

OEV.polShiftOrigin = polShiftOrigin;

/**
 * Check if a line is partially contained within a bounding box.  Note
 * that for this algorithm, lines that only touch the outside of the
 * box, but don't go through it, are excluded.
 * @param {Array} line - Line segment defined in the form [ minX,
 * minY, maxX, maxY ].
 * @param {Array} vbox - Bounding box defined in the form [ minX,
 * minY, maxX, maxY ].
 * @returns `true` if partially contained, `false` otherwise
 */
var lineInVBox = function(line, vbox) {
  var vbox_min_x = vbox[0], vbox_min_y = vbox[1];
  var vbox_max_x = vbox[2], vbox_max_y = vbox[3];
  var p1_x = line[0], p1_y = line[1];
  var p2_x = line[2], p2_y = line[3];

  /* Check if either of the line's points are entirely within the
     bounding box.  We will know for sure the line is visible.  */
  if ((vbox_min_x < p1_x && p1_x < vbox_max_x &&
       vbox_min_y < p1_y && p1_y < vbox_max_y) ||
      (vbox_min_x < p2_x && p2_x < vbox_max_x &&
       vbox_min_y < p2_y && p2_y < vbox_max_y))
    return true;

  // a*x + b*y + c == 0
  var a = p1_y - p2_y;
  var b = p2_x - p1_x;
  var c = p1_x * p2_y - p1_y * p2_x;

  // y = -(a*x + c) / b
  // x = -(b*y + c) / a

  // Compute the intersections.
  var vbox_min_y_ict = (a != 0) ? (-(b * vbox_min_y) / a) : vbox_max_x * 2;
  var vbox_max_y_ict = (a != 0) ? (-(b * vbox_max_y) / a) : vbox_max_x * 2;
  var vbox_min_x_ict = (b != 0) ? (-(a * vbox_min_x) / b) : vbox_max_y * 2;
  var vbox_max_x_ict = (b != 0) ? (-(a * vbox_max_x) / b) : vbox_max_y * 2;
  if ((vbox_min_x < vbox_min_y_ict && vbox_min_y_ict < vbox_max_x) ||
      (vbox_min_x < vbox_max_y_ict && vbox_max_y_ict < vbox_max_x) ||
      (vbox_min_y < vbox_min_x_ict && vbox_min_x_ict < vbox_max_y) ||
      (vbox_min_y < vbox_max_x_ict && vbox_max_x_ict < vbox_max_y))
    return true;
  return false;
};

OEV.lineInVBox = lineInVBox;

/**
 * Check if a box is partially contained within a bounding box.  Note
 * that for this algorithm, boxes that only touch on the edges, but do
 * not intersect at the interiors, are excluded.
 * @param box1 - Box to test defined in the form [ minX, minY, maxX,
 * maxY ].
 * @param vbox - Bounding box defined in the form [ minX, minY, maxX,
 * maxY ].
 * @returns `true` if partially contained, `false` otherwise
 */
var boxInVBox = function(box1, vbox) {
  var vbox_min_x = vbox[0], vbox_min_y = vbox[1];
  var vbox_max_x = vbox[2], vbox_max_y = vbox[3];
  var box1_min_x = box1[0], box1_min_y = box1[1];
  var box1_max_x = box1[2], box1_max_y = box1[3];
  var vbox_yorder = vbox_max_y - vbox_min_y;

  /* Check if any of the first box's points are within the bounding
     box.  */
  var xrange_contained =
    (vbox_min_x < box1_min_x && box1_min_x < vbox_max_x) ||
    (vbox_min_x < box1_max_x && box1_max_x < vbox_max_x);
  var yrange_contained =
    (vbox_min_y < box1_min_y && box1_min_y < vbox_max_y) ||
    (vbox_min_y < box1_max_y && box1_max_y < vbox_max_y) ||
    (vbox_yorder < 0 && // min and max are swapped
     (box1_min_y > vbox_max_y || box1_max_y > vbox_max_y ||
      box1_min_y < vbox_min_y || box1_max_y < vbox_min_y));

  if (xrange_contained && yrange_contained)
    return true;
  return false;
};

OEV.boxInVBox = boxInVBox;

/**
 * Check if a point is contained within a bounding box.  Note that for
 * this algorithm, points that only touch the edge of the box, but are
 * not contained within it, are excluded.
 * @param {Number} pt_x - x coordinate
 * @param {Number} pt_y - y coordinate
 * @param {Array} vbox [ minX, minY, maxX, maxY ]
 * @returns `true` if contained, `false` otherwise
 */
var ptInVBox = function(pt_x, pt_y, vbox) {
  var vbox_min_x = vbox[0], vbox_min_y = vbox[1];
  var vbox_max_x = vbox[2], vbox_max_y = vbox[3];
  var vbox_yorder = vbox_max_y - vbox_min_y;
  if (vbox_min_x < pt_x && pt_x < vbox_max_x &&
      vbox_min_y < pt_y && pt_y < vbox_max_y)
    return true;
  if (vbox_yorder < 0 && // min and max are swapped
      (pt_y > vbox_max_y || pt_y < vbox_min_y) &&
      vbox_min_x < pt_x && pt_x < vbox_max_x)
    return true;
  return false;
};

OEV.ptInVBox = ptInVBox;

/**
 * Clip an absolutely oversized viewport bounding box (vbox) to a
 * reasonable size.  The center of the vbox must be located on a
 * normalized polar coordinate, i.e. it cannot be way off the edges of
 * the map.
 * @param {Array} vbox - The vbox [ minLat, minLon, maxLat, maxLon ]
 * to clip by modifying in place.
 */
var clipVBox = function(vbox) {
  // var EPSILON = 1 / (1 << 6);

  /* Clip the latitudes if the both exceed the bounds.  */
  if (vbox[0] < -90 && vbox[2] > 90)
    { vbox[0] = -90; vbox[2] = 90; }

  /* If the min or max latitude exceeds the top or the bottom of the
     latitude range, then make the box cover the entire respective top
     or bottom of the map.  (The user is looking at the polar
     regions.)  */
  else if (vbox[0] < -90) {
    var newEdge = -180 - vbox[0]; vbox[0] = -90;
    if (newEdge > vbox[2]) vbox[2] = newEdge;
    vbox[1] = -180; vbox[3] = 180 /* - EPSILON */;
    return;
  } else if (vbox[2] > 90) {
    var newEdge = 180 - vbox[2]; vbox[2] = 90;
    if (newEdge < vbox[0]) vbox[0] = newEdge;
    vbox[1] = -180; vbox[3] = 180 /* - EPSILON */;
    return;
  }

  /* If the min or max longitudes greatly exceed the longitudinal
     bounds of the map, then adjust the min and max longitudes to
     cover the entire longitudinal range.  */
  if (vbox[1] < -360 || vbox[3] >= 360 ||
      (vbox[1] < -180 && vbox[3] >= 180) ||
      vbox[3] - vbox[1] >= 360)
    { vbox[1] = -180; vbox[3] = 180 /* - EPSILON */; }

  /* Otherwise, if the min or max longitudes only partially exceed the
     bounds, then create a box that wraps around the edges of the
     map.  */
  else if (vbox[1] < -180)
    vbox[1] = 360 + vbox[1];
  else if (vbox[3] > 180)
    vbox[3] = -360 + vbox[3];
};

OEV.clipVBox = clipVBox;
