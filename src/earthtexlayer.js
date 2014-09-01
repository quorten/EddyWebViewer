/* A RenderLayer used to show a projected Earth texture.  */

import "oevns";
import "cothread";
import "renderlayer";
import "ajaxloaders";

/**
 * Pseudo-namespace for objects in `earthtexlayer.js`.
 * @namespace EarthTexLayerJS
 */

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
 *
 * @memberof EarthTexLayerJS
 */
var EarthTexData = {};
OEV.EarthTexData = EarthTexData;
EarthTexData.loadTrans =
  new ImageLoader("../misc_earth/ocean.png");
EarthTexData.loadTrans.prontoMode = true;
EarthTexData.loadColors =
  new ImageLoader("../blue_marble/land_shallow_topo_2048.jpg");
// "../blue_marble/land_shallow_topo_2048.jpg";
// "../blue_marble/world.200408.3x5400x2700.jpg";
// "../blue_marble/world.200402.3x5400x2700.jpg";
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
  EarthTexData.canvasTex = tmpCanvas;
  EarthTexData.dataTex =
    ctx.getImageData(0, 0, tmpCanvas.width, tmpCanvas.height);
  EarthTexData.loadTrans.image = null;
  tmpCanvas = null; ctx = null;

  /* Initialize all the backbuffers of the various
     implementations.  */
  GenEarthTexLayer.render.backBuf = EarthTexData.dataTex;
  TDEarthTexLayer.render.backBuf = EarthTexData.dataTex;
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
 * @memberof EarthTexLayerJS
 * @type RenderLayer
 */
var GenEarthTexLayer = new RenderLayer();
OEV.GenEarthTexLayer = GenEarthTexLayer;
GenEarthTexLayer.loadData = EarthTexData.loadData;
GenEarthTexLayer.render = new RayTracer(null, 0, 1);
GenEarthTexLayer.frontBuf = GenEarthTexLayer.render.frontBuf;
GenEarthTexLayer.setViewport = function(width, height) {
  return this.render.setViewport(width, height);
};
GenEarthTexLayer.setViewParams = function(vp) {
  this.vp = vp; return this.render.setViewParams(vp);
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
  var status = this.render.continueCT();
  this.status.returnType = status.returnType;
  this.status.preemptCode = status.preemptCode;
  this.status.percent = status.percent;
  return this.status;
};

/********************************************************************/

/**
 * A specialized EarthTexLayer implementation for raytacing a 3D
 * projection (orthographic or perspective) of the Earth.
 * @memberof EarthTexLayerJS
 * @type RenderLayer
 */
var TDEarthTexLayer = new RenderLayer();
OEV.TDEarthTexLayer = TDEarthTexLayer;
TDEarthTexLayer.loadData = EarthTexData.loadData;
TDEarthTexLayer.render = new TDRayTracer(null, 0, 1);
TDEarthTexLayer.frontBuf = TDEarthTexLayer.render.frontBuf;
TDEarthTexLayer.initCtx = GenEarthTexLayer.initCtx;
TDEarthTexLayer.contExec = GenEarthTexLayer.contExec;
TDEarthTexLayer.setViewport = function(width, height) {
  return this.render.setViewport(width, height);
};
TDEarthTexLayer.setViewParams = function(vp) {
  this.vp = vp; return this.render.setViewParams(vp);
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
 *
 * @memberof EarthTexLayerJS
 * @type EquiRenderLayer
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
 * @memberof EarthTexLayerJS
 * @type EquiCSSRenderLayer
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
 * @memberof EarthTexLayerJS
 * @type EquiCSSRenderLayer
 */
var EquiCSSSilEarthTexLayer = new EquiCSSRenderLayer();
OEV.EquiCSSSilEarthTexLayer = EquiCSSSilEarthTexLayer;
EquiCSSSilEarthTexLayer.loadData =
  new ImageLoader("../misc_earth/oland.png");

EquiCSSSilEarthTexLayer.loadData.procData = function(image) {
  this.backBuf = image; this.image = null;
  this.status.returnType = CothreadStatus.FINISHED;
  this.status.preemptCode = 0;
  return this.status;
};

EquiCSSSilEarthTexLayer.initCtx = function() {
  if (!this.backBuf) {
    this.loadData.timeout = this.timeout;
    this.loadData.notifyFunc = this.notifyFunc;
    this.loadData.initCtx();
  }

  this.status.returnType = CothreadStatus.PREEMPTED;
  this.status.preemptCode = 0;
  this.status.percent = 0;
};

/********************************************************************/

/**
 * A specialized EarthTexLayer implementation for:
 *
 * * equirectangular projection, and
 *
 * * SVG silhouette image for background map.
 *
 * @memberof EarthTexLayerJS
 * @type EquiCSSRenderLayer
 */
var EquiSVGEarthTexLayer = new RenderLayer();
OEV.EquiSVGEarthTexLayer = EquiSVGEarthTexLayer;
EquiSVGEarthTexLayer.loadData = new XHRLoader("../misc_earth/land.svg");
EquiSVGEarthTexLayer.frontBuf = document.createElement("div");
EquiSVGEarthTexLayer.frontBuf.appendChild(document.createElement("div"));

EquiSVGEarthTexLayer.initCtx = function() {
  if (!this.backBuf) {
    this.loadData.timeout = this.timeout;
    this.loadData.notifyFunc = this.notifyFunc;
    this.loadData.initCtx();
  }

  this.status.returnType = CothreadStatus.PREEMPTED;
  this.status.preemptCode = 0;
  this.status.percent = 0;
};

EquiSVGEarthTexLayer.loadData.procData = function(httpRequest, responseText) {
  var doneProcData = false;
  var procError = false;

  if (httpRequest.readyState == 3) { // LOADING
    /* Process partial data here (possibly with timed cothread
       loop).  */
  }
  else if (httpRequest.readyState == 4) { // DONE
    /* Determine if the HTTP status code is an acceptable success
       condition.  */
    if ((httpRequest.status == 200 || httpRequest.status == 206) &&
	responseText == null)
      this.retVal = XHRLoader.LOAD_FAILED;
    if (httpRequest.status != 200 && httpRequest.status != 206 ||
	responseText == null) {
      // Error
      httpRequest.onreadystatechange = null;
      this.httpRequest = null;
      this.status.returnType = CothreadStatus.FINISHED;
      this.status.preemptCode = 0;
      return this.status;
    }

    /* Perform final cothreaded (or possibly synchronous) data
       processing here.  */
    var xmlDoc = httpRequest.responseXML;
    if (!xmlDoc)
      procError = true;
    else this.backBuf = xmlDoc.documentElement;
    doneProcData = true;
  }

  if (procError) {
    httpRequest.abort();
    httpRequest.onreadystatechange = null;
    this.httpRequest = null;
    this.retVal = XHRLoader.PROC_ERROR;
    this.status.returnType = CothreadStatus.FINISHED;
    this.status.preemptCode = 0;
    return this.status;
  }

  if (httpRequest.readyState == 4 && doneProcData) {
    /* Only manipulate the CothreadStatus object from within this
       function when processing is entirely finished.  */
    httpRequest.onreadystatechange = null;
    this.httpRequest = null;
    this.status.returnType = CothreadStatus.FINISHED;
    this.status.preemptCode = 0;
  }

  return this.status;
};

EquiSVGEarthTexLayer.setViewport = function(width, height) {
  var inner = this.frontBuf.firstChild;
  var fbstyle = this.frontBuf.style;
  fbstyle.width = width + "px";
  fbstyle.height = height + "px";
  var cssText = "";
  /* NOTE: You must have the "ie-inline-block" class defined in your
     HTML for this to work.  */
  var className = document.getElementById("topBody").className;
  if (className == "ie6" || className =="ie7")
    inner.className = "ie-inline-block";
  else cssText = "display: inline-block; ";
  cssText += "position: relative; width: " + width +
    "px; height: " + height + "px; overflow: hidden";
  inner.style.cssText = cssText;
  if (this.backBuf) {
    this.backBuf.setAttribute("width", width.toString());
    this.backBuf.setAttribute("height", height.toString());
  }
};

EquiSVGEarthTexLayer.contExec = function() {
  // Load the data if it has not yet been loaded.
  if (this.loadData.status.returnType != CothreadStatus.FINISHED) {
    var status = this.loadData.continueCT();
    this.status.returnType = CothreadStatus.PREEMPTED;
    this.status.preemptCode = status.preemptCode;
    this.status.percent = status.percent;
    if (status.returnType == CothreadStatus.FINISHED) {
      if (this.loadData.retVal == 200) {
	this.backBuf = this.loadData.backBuf;
	this.loadData.backBuf = null;
	this.frontBuf.firstChild.appendChild(this.backBuf);
	this.backBuf.setAttribute("width", this.vp.viewport[0]);
	this.backBuf.setAttribute("height", this.vp.viewport[1]);
	this.retVal = 0;
      } else {
	this.status.returnType = CothreadStatus.FINISHED;
	this.retVal = RenderLayer.LOAD_ERROR;
	return this.status;
      }
    } else return this.status;
  }

  // Otherwise, render.
  return this.render();
};

EquiSVGEarthTexLayer.render = function() {
  var width = this.vp.viewport[0];
  var height = this.vp.viewport[1];

  var scale = this.vp.scale * width / 360;
  var xofs = (1 + this.vp.mapCenter[0] -
	      this.vp.polCenter[0] / 180 * this.vp.scale) / 2 * width;
  var yofs = (1 - this.vp.mapCenter[1] * this.vp.aspectXY) / 2 * height;

  var landxform = document.getElementById("landxform");
  landxform.setAttribute("transform", "matrix(" +
	[ scale, 0, 0, -scale, xofs, yofs ].join(",") + ")");

  this.status.returnType = CothreadStatus.FINISHED;
  this.status.preemptCode = RenderLayer.RENDERING;
  this.status.percent = CothreadStatus.MAX_PERCENT;
  return this.status;
};

/********************************************************************/

/**
 * Pointer to the current EarthTexLayer implementation.
 * @memberof EarthTexLayerJS
 */
var EarthTexLayer = OEV.EarthTexLayer = GenEarthTexLayer;

/**
 * List of all EarthTexLayer implementations by name.
 * @memberof EarthTexLayerJS
 */
var EarthTexLayerImps =
  [ "GenEarthTexLayer", "TDEarthTexLayer", "EquiEarthTexLayer",
    "EquiCSSEarthTexLayer", "EquiCSSSilEarthTexLayer",
    "EquiSVGEarthTexLayer" ];
OEV.EarthTexLayerImps = EarthTexLayerImps;
