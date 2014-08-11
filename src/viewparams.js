/* A global object that contains the logical grouping of general
   view-related properties.  */

import "oevns";

/**
 * A global object that contains the logical grouping of general
 * view-related properties.
 *
 * Note that JSDocs do not show the documentation of the members of
 * `ViewParams`.  See the source code for these details.
 */
var ViewParams = {};
OEV.ViewParams = ViewParams;

/** Viewport [ width, height ] */
ViewParams.viewport = [ 32, 32 ];
/** Viewport width / height */
ViewParams.aspectXY = 1;
/** [ longitude, latitude ] of center of view.  */
ViewParams.polCenter = [ 0, 0 ];
/** Current projection as a pointer to a Projector object.  */
ViewParams.projector = null; // EquirectProjector
/** Clip projected points that exceed +/- 90/180 degrees.  */
ViewParams.clip = true;
/** Scale factor for map rendering.  */
ViewParams.scale = 1;
/** 1 / scale, used for improving performance.  */
ViewParams.inv_scale = 1;
/** [ x, y ] 2D center of projected map.  */
ViewParams.mapCenter = [ 0, 0 ];

/** Perspective field of view */
ViewParams.perspFOV = 17.5;
/** Perspective altitude in kilometers */
ViewParams.perspAltitude = 35786;
