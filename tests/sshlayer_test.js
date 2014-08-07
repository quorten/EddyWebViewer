/* Test the TracksLayer module.  */

import "../src/sshlayer";
import "../src/projector";
import "../src/viewparams";

var rendStartTime;

function execTime() {
  var status = SSHLayer.continueCT();
  if (status.preemptCode != CothreadStatus.PROC_DATA) {
    document.getElementById("progElmt").innerHTML = [ "Download: ",
      (status.percent * 100 / CothreadStatus.MAX_PERCENT).toFixed(2), "%"].
      join("");
  } else {
    document.getElementById("progElmt").innerHTML = [ "Render: ",
      (status.percent * 100 / CothreadStatus.MAX_PERCENT).toFixed(2), "%" ].
      join("");
  }

  if (status.returnType == CothreadStatus.FINISHED) {
    var rendTimeElmt = document.getElementById("rendTimeElmt");
    var totalTime = (Date.now() - rendStartTime) / 1000;
    rendTimeElmt.innerHTML = "Total render time: " +
      totalTime.toFixed(3) + " seconds";
    return;
  }
  if (status.preemptCode == CothreadStatus.IOWAIT)
    return;
  return browserTime();
}

OEV.execTime = execTime;

function browserTime() {
  /* Note: If a cothread should use all available processing time yet
     still let the browser stay responsive, this timeout should be set
     to zero.  Otherwise, any value larger than zero can be used to
     throttle a task to use only a fraction of available processing
     time.  In some cases, such as during synchronous JSON parsing by
     the browser, you may need to set this value to greater than zero
     for the browser to remain responsive just before the point when
     the browser becomes unresponsive, so that you can put an
     notification on the screen before the onset of
     unresponsiveness.  */
  return setTimeout(execTime, 80);
}

function setup() {
  /* Append a progress counter element to the document body, assuming
     that the <body> element is the second child of the
     documentElement.  */
  var progElmt = document.createElement("p");
  progElmt.id = "progElmt";
  progElmt.innerHTML = "Please wait...";
  var rendTimeElmt = document.createElement("p");
  rendTimeElmt.id = "rendTimeElmt";
  rendTimeElmt.innerHTML = "Calculating total render time...";
  rendStartTime = Date.now();

  document.documentElement.children[1].appendChild(progElmt);
  document.documentElement.children[1].appendChild(rendTimeElmt);
  document.documentElement.children[1].appendChild(SSHLayer.frontBuf);

  var width = 1440, height = 721;
  ViewParams.viewport[0] = width; ViewParams.viewport[1] = height;
  ViewParams.aspectXY = width / height;
  ViewParams.projector = EquirectMapProjector;
  ViewParams.center[0] = 0; ViewParams.center[1] = 0;
  SSHLayer.setViewport(width, height);
  SSHLayer.timeout = 20;
  SSHLayer.notifyFunc = execTime;
  var status = SSHLayer.start();
  if (status.returnType != CothreadStatus.FINISHED) {
    /* if (status.preemptCode == CothreadStatus.IOWAIT)
      return; */
    return browserTime();
  }
}

OEV.setup = setup;

/* Since this is the main JavaScript file, all other dependent
   JavaScripts will be included before this file.  Close the OEV
   namespace now that there are no more JavaScripts to be
   included.  */
import "../src/oevnsend";
