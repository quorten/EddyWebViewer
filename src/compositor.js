/* Composite rendering of RenderLayers, either as a 2D map or through
   a 3D raytrace renderer.  Also contains main loop and hooks to
   integrate with the GUI, if available.  */

import "oevns";
import "compat";
import "oevmath";
import "projector";
import "viewparams";
import "cothread";
import "dates";
import "earthtexlayer";
import "trackslayer";
import "sshlayer";

/**
 * Manages composite rendering of RenderLayers, either as a 2D map or
 * through a 3D raytrace renderer.  Also contains main loop and hooks
 * to integrate with the GUI, if available.
 */
var Compositor = {};
OEV.Compositor = Compositor;

// Important parameters:

/** Density of the graticule lines in degrees per line.  */
Compositor.gratDensity = 15;

/** Boolean indicating whether the EarthTexLayer is visible or not.  */
Compositor.landMassVis = true;

/** Style to draw the Earth texture, 1 = silhouettes, 2 = textured, 3
 * = seasonal textured.  */
Compositor.earthTexStyle = 2;

/** Boolean indicating whether the SSHLayer is visible or not.  */
Compositor.sshVisible = true;

/** Playback speed in frames per second.  */
Compositor.playSpeed = 2;

/** Event handler that gets called once the Compositor is fully
    loaded.  */
Compositor.onloaded = function() {};

/** Event handler that gets called when the current date is changed
    during playback.  */
Compositor.ondatechange = function() {};

/** Event handler that gets called when the scale factor is
    changed.  */
Compositor.onscalechange = function() {};

/** Event handler that gets called when the perspective field of view
    changes.  */
Compositor.onfovchange = function() {};

/** Event handler that gets called once playback is forced to stop at
    the end of the data.  */
Compositor.onstop = function() {};

// Internal fields:
// FIXME: These are still kind of ad-hoc.

Compositor.drawingContainer = null;
Compositor.noDouble = false;
Compositor.renderInProg = false;
Compositor.renderPart = 0;
Compositor.stopSignal = false;
Compositor.playMode = false;
Compositor.frameStart = 0;
Compositor.renderStart = 0;
Compositor.datesProg = null;
Compositor.earthTexProg = null;
Compositor.sshProg = null;
Compositor.tracksProg = null;
Compositor.dispLoadBar = false;

/** Perform startup initialization for the whole web viewer.  */
Compositor.init = function() {
  // Add all the RenderLayers to the GUI containment.
  /* NOTE: EarthTexLayer was originally the bottom-most layer.  Since
     the SSH and land masses aren't exactly complementary, having the
     SSHLayer on top guarantees that all SSH samples are visible.  */
  this.drawingContainer = document.getElementById("drawingContainer");
  SSHLayer.frontBuf.className = "renderLayer";
  this.drawingContainer.appendChild(SSHLayer.frontBuf);
  EarthTexLayer.frontBuf.className = "renderLayer";
  this.drawingContainer.appendChild(EarthTexLayer.frontBuf);
  TracksLayer.frontBuf.className = "renderLayer";
  this.drawingContainer.appendChild(TracksLayer.frontBuf);

  this.fitViewportToCntr();
  gViewParams.projector = EquirectProjector;
  this.optiRenderImp();

  EarthTexLayer.frontBuf.style.cssText = "visibility: hidden";
  SSHLayer.frontBuf.style.cssText = "visibility: hidden";
  TracksLayer.frontBuf.style.cssText = "visibility: hidden";

  this.noDouble = false;

  /* Preload the required data so that the GUI can indicate these
     steps are in progress.  */
  /* NOTE: Right now, the loading loop does not use I/O notification
     since that can be slow.  This is a great place where feature
     detection would help.  However, such feature detection would be
     very difficult to assess, perhaps not even practical.  */
  // var finishWrapper = makeEventWrapper(Compositor, "finishStartup");
  Dates.timeout = 15;
  // Dates.notifyFunc = finishWrapper;
  SSHLayer.loadData.timeout = 15;
  // SSHLayer.loadData.notifyFunc = finishWrapper;
  TracksLayer.loadData.timeout = 15;
  // TracksLayer.loadData.notifyFunc = finishWrapper;
  TracksLayer.loadData.listenOnProgress = true;
  // TracksLayer.loadData.notifyProgress = true;

  Dates.initCtx();
  EarthTexData.initLoad(15, null /* finishWrapper */);
  SSHLayer.loadData.initCtx();
  TracksLayer.loadData.initCtx();

  /* Setup the loading screen.  */
  var loadingScreen = document.getElementById("loadingScreen");
  this.datesProg = document.createTextNode("Date indexes: 0%");
  loadingScreen.appendChild(this.datesProg);
  loadingScreen.appendChild(document.createElement("br"));
  this.earthTexProg = document.createTextNode("Earth texture: 0%");
  loadingScreen.appendChild(this.earthTexProg);
  loadingScreen.appendChild(document.createElement("br"));
  this.sshProg = document.createTextNode("SSH preload data: 0%");
  loadingScreen.appendChild(this.sshProg);
  loadingScreen.appendChild(document.createElement("br"));
  this.tracksProg = document.createTextNode("Tracks data: 0%");
  loadingScreen.appendChild(this.tracksProg);
  loadingScreen.appendChild(document.createElement("br"));

  this.loadingBar = document.getElementById("loadingBar");

  return this.finishStartup();
};

Compositor.finishStartup = function() {
  var datesStatus = Dates.continueCT();
  var earthTexStatus = EarthTexData.loadData.continueCT();
  var sshStatus = SSHLayer.loadData.continueCT();
  var tracksStatus = TracksLayer.loadData.continueCT();

  this.datesProg.nodeValue = "Date indexes: " +
    (datesStatus.percent * 100 /
     CothreadStatus.MAX_PERCENT).toFixed(0) + "%";
  this.earthTexProg.nodeValue = "Earth texture: " +
    (earthTexStatus.percent * 100 /
     CothreadStatus.MAX_PERCENT).toFixed(0) + "%";
  this.sshProg.nodeValue = "SSH preload data: " +
    (sshStatus.percent * 100 /
     CothreadStatus.MAX_PERCENT).toFixed(0) + "%";
  this.tracksProg.nodeValue = "Tracks data: " +
    (tracksStatus.percent * 100 /
     CothreadStatus.MAX_PERCENT).toFixed(0) + "%";

  if (datesStatus.returnType != CothreadStatus.FINISHED ||
      earthTexStatus.returnType != CothreadStatus.FINISHED ||
      sshStatus.returnType != CothreadStatus.FINISHED ||
      tracksStatus.returnType != CothreadStatus.FINISHED) {
    /* If our progress meters don't send notifications, then we don't
       return on IOWAIT.  Progress meters that send notifications can
       be slow.  Then again, using progress meters at all is slower
       than no progress meters.  */
    /* if (datesStatus.preemptCode == CothreadStatus.IOWAIT ||
	earthTexStatus.preemptCode == CothreadStatus.IOWAIT ||
	sshStatus.preemptCode == CothreadStatus.IOWAIT ||
	tracksStatus.preemptCode == CothreadStatus.IOWAIT)
      return; */
    return window.setTimeout(
	makeEventWrapper(Compositor, "finishStartup"), 2000);
  }

  /* Prevent final initialization from being run twice.  (This is now
     impossible in the current codebase, due to elimination of I/O
     notification.  The old code was buggy, though: it should have
     guaranteed that only one loading loop was active.)  */
  if (Compositor.noDouble)
    return;
  Compositor.noDouble = true;

  /* Connect the front buffers to the GUI now that loading is
     finished.  */
  var loadingScreen = document.getElementById("loadingScreen");
  if (loadingScreen)
    loadingScreen.style.cssText = "visibility: hidden";

  EarthTexLayer.frontBuf.style.cssText = "";
  SSHLayer.frontBuf.style.cssText = "";
  TracksLayer.frontBuf.style.cssText = "";

  this.onloaded();

  /* Now that all the necessary startup data is loaded, we should
     proceed to rendering the first frame.  */
  /* FIXME: The render loop hasn't been designed to suspend and resume
     jobs on IOWAIT.  Sorry.  */
  // var renderWrapper = makeEventWrapper(Compositor, "finishRenderJobs");
  EarthTexLayer.timeout = 15;
  // EarthTexLayer.notifyFunc = renderWrapper;
  SSHLayer.timeout = 15;
  // SSHLayer.notifyFunc = renderWrapper;
  TracksLayer.timeout = 15;
  // TracksLayer.notifyFunc = renderWrapper;
  return this.startRender();
};

/**
 * Reset RenderLayers to their start condition and start a render loop
 * if there isn't one already running.
 * @param {Array} layers - (optional) An array of RenderLayers that
 * indicates which layers should be reset to their start condition.
 * If this parameter is not given, then all layers are reset to their
 * start condition.
 */
Compositor.startRender = function(layers) {
  if (!layers) {
    // If layer is visible, render it.
    if (!EarthTexLayer.frontBuf.style.visibility)
      EarthTexLayer.initCtx();
    if (!SSHLayer.frontBuf.style.visibility)
      SSHLayer.initCtx();
    if (!TracksLayer.frontBuf.style.visibility)
      TracksLayer.initCtx();
  } else {
    for (var i = 0, len = layers.length; i < len; i++) {
      // If layer is visible, render it.
      if (!layers[i].frontBuf.style.visibility)
	layers[i].initCtx();
    }
  }
  this.renderStart = Cothread.now();
  if (!this.renderInProg) {
    this.renderPart = 0;
    this.frameStart = this.renderStart;
    return this.finishRenderJobs();
  }
};

/** If there is not a currently running render loop, start one.  */
Compositor.startRenderLoop = function() {
  if (!this.renderInProg) {
    this.renderPart = 0;
    return this.finishRenderJobs();
  }
};

/** Wrapper function for starting rendering during animation.  This
    function is for internal use only.  */
Compositor.startRenderAnim = function() {
  this.renderStart = Cothread.now();
  if (!SSHLayer.frontBuf.style.visibility)
    SSHLayer.initCtx();
  if (!TracksLayer.frontBuf.style.visibility)
    TracksLayer.initCtx();
  return this.finishRenderJobs();
};

/**
 * Finish any render jobs that may be pending from TracksLayer or
 * SSHLayer.
 */
Compositor.finishRenderJobs = function() {
  var earthTexStatus = EarthTexLayer.status;
  var sshStatus = SSHLayer.status;
  var tracksStatus = TracksLayer.status;
  this.renderInProg = true;

  if (this.fitViewportToCntr()) {
    EarthTexLayer.initCtx();
    SSHLayer.initCtx();
    TracksLayer.initCtx();
  }

  var ctnow = Cothread.now;
  var startTime = ctnow();
  var timeout = 15;

  switch (this.renderPart) {
  case 0:
    this.renderPart = 1;
    if (earthTexStatus.returnType != CothreadStatus.FINISHED) {
      earthTexStatus = EarthTexLayer.continueCT();
      if (ctnow() - startTime >= timeout) break;
    }
  case 1:
    this.renderPart = 2;
    if (sshStatus.returnType != CothreadStatus.FINISHED) {
      sshStatus = SSHLayer.continueCT();
      if (ctnow() - startTime >= timeout) break;
    }
  case 2:
    this.renderPart = 0;
    if (tracksStatus.returnType != CothreadStatus.FINISHED) {
      tracksStatus = TracksLayer.continueCT();
      if (ctnow() - startTime >= timeout) break;
    }
  }

  if (this.stopSignal) {
    if (this.dispLoadBar) {
      this.loadingBar.style.cssText = "";
      this.dispLoadBar = false;
    }
    this.renderInProg = false;
    this.stopSignal = false;
    if (this.playMode) {
      this.playMode = false;
      this.onstop();
    }
  } else if (earthTexStatus.returnType != CothreadStatus.FINISHED ||
	     sshStatus.returnType != CothreadStatus.FINISHED ||
	     tracksStatus.returnType != CothreadStatus.FINISHED) {
    if ((sshStatus.preemptCode == CothreadStatus.IOWAIT ||
	 tracksStatus.preemptCode == CothreadStatus.IOWAIT) &&
	ctnow() - this.renderStart > 4000) {
      if (!this.dispLoadBar) {
	this.loadingBar.style.cssText = "display: block";
	this.dispLoadBar = true;
      }
      /* TODO: Add properly detailed loading diagnostics.  */
    } else if (this.dispLoadBar) {
      this.loadingBar.style.cssText = "";
      this.dispLoadBar = false;
    }
    return requestAnimationFrame(
		    makeEventWrapper(Compositor, "finishRenderJobs"));
  } else if (earthTexStatus.returnType == CothreadStatus.FINISHED &&
	   sshStatus.returnType == CothreadStatus.FINISHED &&
	   tracksStatus.returnType == CothreadStatus.FINISHED &&
	   this.playMode) {
    if (this.dispLoadBar) {
      this.loadingBar.style.cssText = "";
      this.dispLoadBar = false;
    }
    if ((this.playSpeed > 0 && Dates.curDate >= Dates.dateList.length - 1) ||
	(this.playSpeed < 0 && Dates.curDate <= 0)) {
      this.playMode = false;
      this.renderInProg = false;
      this.onstop();
      return;
    }

    // Dates.curDate++; // Simpler, but only runs at one speed.

    var frameElap = 1000 / this.playSpeed;
    var curTime = ctnow();
    var nextTime = Math.abs(frameElap) - (curTime - this.renderStart);
    var numFrames = 0|((curTime - this.frameStart) / 1000 * this.playSpeed);
    this.frameStart += numFrames * frameElap;
    Dates.curDate += numFrames;
    if (Dates.curDate < 0) Dates.curDate = 0;
    if (Dates.curDate > Dates.dateList.length - 1)
      Dates.curDate = Dates.dateList.length - 1;
    this.ondatechange();

    this.renderPart = 0;
    /* if (!SSHLayer.frontBuf.style.visibility)
      SSHLayer.initCtx();
    if (!TracksLayer.frontBuf.style.visibility)
      TracksLayer.initCtx();
    return requestAnimationFrame(
                    makeEventWrapper(Compositor, "finishRenderJobs")); */
    if (Math.abs(this.playSpeed) >= 30 || nextTime <= 0)
      return requestAnimationFrame(
	         makeEventWrapper(Compositor, "startRenderAnim"));
    else
      return window.setTimeout(
                 makeEventWrapper(Compositor, "startRenderAnim"),
		 nextTime);
  } else {
    if (this.dispLoadBar) {
      this.loadingBar.style.cssText = "";
      this.dispLoadBar = false;
    }
    this.renderInProg = false;
  }
};

/** If a render loop is in progress, force it to halt.  */
Compositor.halt = function() {
  this.stopSignal = true;
};

/** Change the viewport in a safe way for all RenderLayers.  */
Compositor.setViewport = function(width, height) {
  gViewParams.viewport[0] = width;
  gViewParams.viewport[1] = height;
  gViewParams.aspectXY = width / height;
  EarthTexLayer.setViewport(width, height);
  SSHLayer.setViewport(width, height);
  TracksLayer.setViewport(width, height);
};

/**
 * Resize the viewports of the RenderLayers to fit the CSS allocated
 * space.  Returns `true` if the viewport size was changed, `false`
 * otherwise.
 *
 * NOTE: Because modern browsers do not provide an event that fires if
 * the width or height of a CSS element has changed, this function
 * must be called every time the screen is updated via one of the
 * render() functions.
 */
Compositor.fitViewportToCntr = function() {
  // Warning: clientWidth and clientHeight marked as unstable in MDN.
  if (gViewParams.viewport[0] == this.drawingContainer.clientWidth &&
      gViewParams.viewport[1] == this.drawingContainer.clientHeight)
    return false;
  this.setViewport(this.drawingContainer.clientWidth,
		   this.drawingContainer.clientHeight);
  // window.innerWidth, window.innerHeight
  return true;
};

/**
 * Show the SSHLayer if the given parameter is `true`, hide it if it
 *  is `false`.
 * @param show
 */
Compositor.dispSSH = function(show) {
  if (show) {
    this.sshVisible = true;
    SSHLayer.frontBuf.style.visibility = "";
  } else {
    this.sshVisible = false;
    SSHLayer.frontBuf.style.visibility = "hidden";
  }
};

/**
 * Show the EarthTexLayer if the given parameter is `true`, hide it if
 *  it is `false`.
 * @param show
 */
Compositor.dispLandMasses = function(show) {
  if (show) {
    this.landMassVis = true;
    EarthTexLayer.frontBuf.style.visibility = "";
  } else {
    this.landMassVis = false;
    EarthTexLayer.frontBuf.style.visibility = "hidden";
  }
};

/**
 * Switch which RenderLayer implementation is contained within the
 * GUI.
 * @param {String} absName - The abstract name of the RenderLayer to
 * switch, as a string.
 * @param {String} impName - The name of the new RenderLayer
 * implementation to use, as a string.
 */
Compositor.switchRenderLayer = function(absName, impName) {
  var absObj = eval(absName);
  var impObj = eval(impName);
  impObj.frontBuf.className = "renderLayer";
  impObj.frontBuf.style.cssText = absObj.frontBuf.style.cssText;
  this.drawingContainer.replaceChild(impObj.frontBuf, absObj.frontBuf);
  if (gViewParams.viewport[0] != impObj.frontBuf.width ||
      gViewParams.viewport[1] != impObj.frontBuf.height)
    impObj.setViewport(gViewParams.viewport[0], gViewParams.viewport[1]);
  var setAbsVars =
    [ "OEV.", absName, " = ", absName, " = ", impName ].join("");
  eval(setAbsVars);
};

/**
 * Analyze the current rendering parameters and for each RenderLayer,
 * choose the most optimal implementation.
 */
Compositor.optiRenderImp = function() {
  if (gViewParams.projector == EquirectProjector &&
      gViewParams.polCenter[1] == 0) {
    this.switchRenderLayer("EarthTexLayer", "EquiEarthTexLayer");
    if (SSHParams.shadeStyle == 0 &&
	SSHParams.shadeBase == -3 &&
	SSHParams.shadeScale == 4) {
      this.switchRenderLayer("SSHLayer", "EquiGraySSHLayer");
    } else {
      this.switchRenderLayer("SSHLayer", "GenSSHLayer");
    }
  } else if (gViewParams.projector == OrthoProjector ||
	     gViewParams.projector == PerspProjector) {
    this.switchRenderLayer("EarthTexLayer", "TDEarthTexLayer");
    this.switchRenderLayer("SSHLayer", "GenSSHLayer");
  } else {
    this.switchRenderLayer("EarthTexLayer", "GenEarthTexLayer");
    this.switchRenderLayer("SSHLayer", "GenSSHLayer");
  }
};

/**
 * Choose between having the EarthTexLayer as the bottom-most layer or
 * not.
 * @param {Boolean} bottom - If `true`, then the EarthTexLayer is the
 * bottom-most layer.  Otherwise, it is set on top of SSHLayer.
 */
Compositor.bottomEarthTex = function(bottom) {
  if (bottom)
    this.drawingContainer.insertBefore(EarthTexLayer.frontBuf,
				       SSHLayer.frontBuf);
  else
    this.drawingContainer.insertBefore(EarthTexLayer.frontBuf,
				       TracksLayer.frontBuf);
};

/**
 * Gracefully switch from one projection to another by transforming
 * various ViewParams.
 *
 * The scale factor is adjusted so that the new projection will look
 * like the previous one as seamlessly as possible.
 *
 * Assuming the user wants the most optimal equirectangular projection
 * experience, switch between whether gViewParams.mapCenter[1] or
 * gViewParams.polCenter[1] is used to position the center of the
 * screen at the correct latitude.
 *
 * @param {Projector} newProj - The new projection to use.
 * `gViewParams.projector` will be set automatically.
 */
Compositor.gracefulProj = function(newProj) {
  var oldProj = gViewParams.projector;
  // Change the y-panning mechanism.
  if (oldProj != EquirectProjector &&
      newProj == EquirectProjector) {
    gViewParams.mapCenter[1] =
      -gViewParams.polCenter[1] / 180 * gViewParams.scale;
    gViewParams.polCenter[1] = 0;
  } else if (oldProj == EquirectProjector) {
    gViewParams.polCenter[1] =
      -gViewParams.mapCenter[1] * 180 / gViewParams.scale;
    gViewParams.mapCenter[1] = 0;
  }

  // Gracefully change the scale factor.
  var oldScale = gViewParams.scale;
  if (oldProj != PerspProjector && oldProj != OrthoProjector &&
      (newProj == OrthoProjector || newProj == PerspProjector))
    gViewParams.scale /= Math.PI;
  if (oldProj != PerspProjector && newProj == PerspProjector) {
    var r = 1; // 6371; // radius of the earth in kilometers
    var d = gViewParams.perspAltitude / 6371; // altitude in kilometers
    /* 1. Find the furthest visible point on the equator.  */
    var z = r / (r + d), x = Math.sqrt(1 - z * z);

    /* Set the field of view to match with the visible bounds of the
       orthographic scale (exact reverse of calculation below).  */
    var px = gViewParams.scale / x;
    var f = px / x * (-z + (r + d));
    gViewParams.perspFOV = RAD2DEG * Math.atan(1 / f) * 2;
    gViewParams.scale = 1;
    this.onfovchange();
  }
  if (oldProj == PerspProjector && newProj != PerspProjector) {
    var r = 1; // 6371; // radius of the earth in kilometers
    var d = gViewParams.perspAltitude / 6371; // altitude in kilometers
    var f = 1 / Math.tan(DEG2RAD * gViewParams.perspFOV / 2);
    /* 1. Find the furthest visible point on the equator.  */
    var z = r / (r + d), x = Math.sqrt(1 - z * z);

    /* 2. Project this point (only from 2D to 1D, of course).  */
    var px = x * f / (-z + (r + d));

    /* 3. Use the ratio of the projected position to the unprojected
       position as the scale factor.  */
    gViewParams.scale = px / x;
  }
  if ((oldProj == OrthoProjector || oldProj == PerspProjector) &&
      newProj != OrthoProjector && newProj != PerspProjector)
    gViewParams.scale *= Math.PI;

  gViewParams.inv_scale = 1 / gViewParams.scale;
  this.onscalechange();

  // Update the Y panning with the new scale factor, if necessary.
  if (newProj == EquirectProjector)
    gViewParams.mapCenter[1] *= gViewParams.scale / oldScale;

  // Change the actual projection method.
  gViewParams.projector = newProj;
};

// -------------------------------------------------------------------

/* Since this is the main JavaScript file, all other dependent
   JavaScripts will be included before this file.  Close the OEV
   namespace now that there are no more JavaScripts to be
   included.  */
import "oevnsend";
