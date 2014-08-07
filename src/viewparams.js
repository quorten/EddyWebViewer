/* A global object that contains the logical grouping of all
   view-related graphics properties.  */

import "oevns";

var ViewParams = {};
OEV.ViewParams = ViewParams;

ViewParams.viewport = [ 32, 32 ]; // width, height
ViewParams.aspectXY = 1; // width / height
ViewParams.projector = null;
ViewParams.center = [ 0, 0 ]; // Latitude, Longitude
