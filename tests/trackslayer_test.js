/* Test the TracksLayer module.  */

import "../src/trackslayer";
import "../src/projector";

function execTime2() {
  var status = TracksLayer.render.continueCT();
  document.getElementById("rendProgElmt").innerHTML = [ "Render: ",
    (status.percent * 100 / CothreadStatus.MAX_PERCENT).toFixed(2), "%" ].
    join("");
  if (status.returnType == CothreadStatus.FINISHED) {
    var rendTimeElmt = document.getElementById("rendTimeElmt");
    var totalTime = (Date.now() - rendStartTime) / 1000;
    rendTimeElmt.innerHTML = "Total render time: " +
      totalTime.toFixed(3) + " seconds";
    // Free up some memory.
    TracksLayer = null;
    return;
  }
  return browserTime2();
}

function browserTime2() {
  return setTimeout(execTime2, 0);
}

var rendStartTime;

function setup2() {
  var rendProgElmt = document.createElement("p");
  rendProgElmt.id = "rendProgElmt";
  rendProgElmt.innerHTML = "Starting render...";
  var rendTimeElmt = document.createElement("p");
  rendTimeElmt.id = "rendTimeElmt";
  rendTimeElmt.innerHTML = "Calculating total render time...";
  rendStartTime = Date.now();

  document.documentElement.children[1].appendChild(rendProgElmt);
  document.documentElement.children[1].appendChild(rendTimeElmt);
  document.documentElement.children[1].appendChild(TracksLayer.frontBuf);

  var width = 1000, height = 500;
  TracksLayer.setViewport(null, width, height, width / height,
			  EquirectMapProjector);
  TracksLayer.render.timeout = 20;
  if (TracksLayer.render.start().returnType != CothreadStatus.FINISHED)
    return browserTime2();
}

function execTime() {
  var status = TracksLayer.loadData.continueCT();
  if (status.preemptCode != CothreadStatus.PROC_DATA) {
    document.getElementById("progElmt").innerHTML = [ "Download: ",
      (status.percent * 100 / CothreadStatus.MAX_PERCENT).toFixed(2), "%"].
      join("");
  } else
    document.getElementById("progElmt").innerHTML = "Parsing JSON, please wait...";

  if (status.returnType == CothreadStatus.FINISHED) {
    var resultElmt = document.createElement("p");
    resultElmt.id = "resultElmt";
    resultElmt.innerHTML = "Result: " +
      (TracksLayer.acTracksData.length + TracksLayer.cTracksData.length) +
      " tracks";
    document.documentElement.children[1].appendChild(resultElmt);

    // Next move on to testing the progressive renderer.
    return setTimeout(setup2, 80);
  }
  if (status.preemptCode == CothreadStatus.IOWAIT)
    return;
  return browserTime();
}

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
  document.documentElement.children[1].appendChild(progElmt);

  TracksLayer.loadData.timeout = 20;
  var status = TracksLayer.loadData.start();
  if (status.returnType != CothreadStatus.FINISHED) {
    if (status.preemptCode == CothreadStatus.IOWAIT)
      return;
    return browserTime();
  }
}
