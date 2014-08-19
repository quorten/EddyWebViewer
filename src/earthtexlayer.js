/* A RenderLayer used to show a projected Earth texture.  */

import "oevns";
import "cothread";
import "renderlayer";
import "ajaxloaders";

/**
 * Earth Texture data loader object.  Contains the following members
 * once `loadData()` has finished:
 *
 * * `this.imageTex` -- Unmodified Earth colors texture.
 *
 * * `this.canvasTex` -- Earth colors with transparent oceans on an
 *   HTML canvas.
 *
 * * `this.dataTex` -- The image data of the above canvas.
 */
var EarthTexData = {};
OEV.EarthTexData = EarthTexData;
EarthTexData.loadTrans =
  new ImageLoader("../misc_earth/ocean.png");
EarthTexData.loadTrans.prontoMode = true;
EarthTexData.loadColors =
  new ImageLoader("../data/blue_marble/land_shallow_topo_2048.jpg");
// "../data/blue_marble/land_shallow_topo_2048.jpg";
// "../data/blue_marble/world.200408.3x5400x2700.jpg";
// "../data/blue_marble/world.200402.3x5400x2700.jpg";
EarthTexData.loadColors.prontoMode = true;
EarthTexData.loadData = new SeriesCTCtl([ EarthTexData.loadTrans,
					  EarthTexData.loadColors ]);

EarthTexData.initLoad = function(timeout, notifyFunc) {
  this.loadTrans.timeout = timeout;
  this.loadColors.timeout = timeout;
  this.loadTrans.notifyFunc = notifyFunc;
  this.loadColors.notifyFunc = notifyFunc;
  this.loadData.timeout = timeout;
  this.loadData.initCtx();
};

EarthTexData.loadColors.procData = function(image) {
  /* Pull the pixels off of the image and fill them into the sshData
     array as floating point numbers.  */
  var tmpCanvas = document.createElement("canvas");
  tmpCanvas.width = image.width;
  tmpCanvas.height = image.height;
  var ctx = tmpCanvas.getContext("2d");
  ctx.drawImage(image, 0, 0);
  /* Note: Using "destination-in" with a land alpha texture would be
     ideal, but that causes problems on some computers, so we use
     "destination-out" with an ocean alpha texture instead.  */
  ctx.globalCompositeOperation = "destination-out";
  ctx.drawImage(EarthTexData.loadTrans.image, 0, 0);
  ctx.globalCompositeOperation = "source-over";

  this.image = null;
  EarthTexData.imageTex = image;
  EarthTexData.loadTrans.image = null;
  EarthTexData.canvasTex = tmpCanvas;
  EarthTexData.dataTex =
    ctx.getImageData(0, 0, tmpCanvas.width, tmpCanvas.height);
  tmpCanvas = null; ctx = null;

  /* Initialize all the backbuffers of the various
     implementations.  */
  GenEarthTexLayer.render.backBuf = EarthTexData.dataTex;
  EquiEarthTexLayer.backBuf = EarthTexData.canvasTex;
  EquiCSSEarthTexLayer.backBuf = EarthTexData.imageTex;

  if (EarthTexData.loadTrans.retVal != ImageLoader.SUCCESS)
    this.retVal = EarthTexData.loadTrans.retVal;

  this.status.returnType = CothreadStatus.FINISHED;
  this.status.preemptCode = 0;
  return this.status;
};

/********************************************************************/

/**
 * Generic Earth Texture Layer.  This variant can render in every
 * possible style.  It is also the slowest of all variants,
 * unfortunately.
 *
 * `this.notifyFunc` is used to wake up the main loop to load more
 * data, if provided.
 */
var GenEarthTexLayer = new RenderLayer();
OEV.GenEarthTexLayer = GenEarthTexLayer;
GenEarthTexLayer.loadData = EarthTexData.loadData;
GenEarthTexLayer.render = new RayTracer(null, 0, 1);
GenEarthTexLayer.frontBuf = GenEarthTexLayer.render.frontBuf;
GenEarthTexLayer.setViewport = function(width, height) {
  return this.render.setViewport(width, height);
};

GenEarthTexLayer.initCtx = function() {
  if (!this.render.backBuf)
    EarthTexData.initLoad(this.timeout, this.notifyFunc);

  this.render.timeout = this.timeout;
  this.render.initCtx();

  this.status.returnType = CothreadStatus.PREEMPTED;
  this.status.preemptCode = 0;
  this.status.percent = 0;
};

GenEarthTexLayer.contExec = function() {
  // Load the data if it has not yet been loaded.
  if (this.loadData.status.returnType != CothreadStatus.FINISHED) {
    var status = this.loadData.continueCT();
    this.status.returnType = CothreadStatus.PREEMPTED;
    this.status.preemptCode = status.preemptCode;
    this.status.percent = status.percent;
    if (status.returnType == CothreadStatus.FINISHED) {
      if (EarthTexData.loadTrans.retVal == ImageLoader.SUCCESS &&
	  EarthTexData.loadColors.retVal == ImageLoader.SUCCESS)
	this.retVal = 0;
      else {
	this.status.returnType = CothreadStatus.FINISHED;
	this.retVal = RenderLayer.LOAD_ERROR;
	return this.status;
      }
    } else return this.status;
  }

  // Otherwise, render.
  return this.render.continueCT();
};

/********************************************************************/

/**
 * A specialized EarthTexLayer implementation for:
 *
 * * equirectangular projection,
 *
 * * with background alpha composited in-browser, and
 *
 * * tiling the source image to a front-buffer HTML Canvas via
 *   drawImage().
 */

var EquiEarthTexLayer = new EquiRenderLayer();
OEV.EquiEarthTexLayer = EquiEarthTexLayer;
EquiEarthTexLayer.loadData = EarthTexData.loadData;

EquiEarthTexLayer.initCtx = function() {
  if (!this.backBuf)
    EarthTexData.initLoad(this.timeout, this.notifyFunc);

  this.status.returnType = CothreadStatus.PREEMPTED;
  this.status.preemptCode = 0;
  this.status.percent = 0;
};

/********************************************************************/

/**
 * A specialized EarthTexLayer implementation for:
 *
 * * equirectangular projection,
 *
 * * with background alpha composited in-browser, and
 *
 * * positioning and scaling the source image as an HTML element via
 *   CSS.
 *
 * This specialization probably isn't useful, though, since it doesn't
 * render an Earth texture with transparent oceans.
 */
var EquiCSSEarthTexLayer = new EquiCSSRenderLayer();
OEV.EquiCSSEarthTexLayer = EquiCSSEarthTexLayer;
EquiCSSEarthTexLayer.loadData = EarthTexData.loadData;

EquiCSSEarthTexLayer.initCtx = function() {
  if (!this.backBuf)
    EarthTexData.initLoad(this.timeout, this.notifyFunc);
  else if (!this.backBuf.parentNode) {
    var inner = this.frontBuf.firstChild;
    if (inner.hasChildNodes())
      inner.removeChild(inner.firstChild);
    inner.appendChild(this.backBuf);
  }

  this.status.returnType = CothreadStatus.PREEMPTED;
  this.status.preemptCode = 0;
  this.status.percent = 0;
};

/********************************************************************/

/** Pointer to the current EarthTexLayer implementation.  */
var EarthTexLayer = OEV.EarthTexLayer = GenEarthTexLayer;
