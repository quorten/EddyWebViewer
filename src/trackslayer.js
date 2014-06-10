/* Render layer for display of the eddy tracks layer.  */

/*

What data is needed for the tracks rendering class?

1. Eddy track data.
2. Date list (global pointer).

* Render cache

 */

var Tracks = function() {
  RenderLayer.call(this);
};

Tracks.prototype = new RenderLayer();
Tracks.constructor = Tracks;

Tracks.prototype.setCacheLimits = function(dataCache, renderCache) {
};

Tracks.prototype.loadData = (function() {
  "use strict";

  function startExec() {
  }

  function contExec() {
  }

  return new Cothread(startExec, contExec);
})();

Tracks.prototype.setViewport = function(center, width, height, projection) {
  RenderLayer.call(center, width, height, projection);
};

Tracks.prototype.render = (function() {
  "use strict";

  function startExec() {
  }

  function contExec() {
  }

  return new Cothread(startExec, contExec);
})();
