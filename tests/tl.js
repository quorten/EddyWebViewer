/* Test the TracksLayer module.  */

import "../src/trackslayer";

function execTime() {
  var status = TracksLayer.loadData.continueCT();
  if (status.preemptCode != TracksLayer.PROC_DATA) {
    document.getElementById("progElmt").innerHTML =
      (status.percent * 100 / CothreadStatus.MAX_PERCENT).toFixed(2) + "%";
  } else
    document.getElementById("progElmt").innerHTML = "Parsing JSON, please wait...";

  if (status.returnType == CothreadStatus.FINISHED) {
    var resultElmt = document.createElement("p");
    resultElmt.id = "resultElmt";
    resultElmt.innerHTML = "Result: " + TracksLayer.tracksData.length +
      " tracks";
    document.documentElement.children[1].appendChild(resultElmt);
    return;
  }
  return browserTime();
}

function browserTime() {
  /* Note: If a cothread should use all available processing time yet
     still let the browser stay responsive, this timeout should be set
     to zero.  Otherwise, any value larger than zero can be used to
     throttle a task to use only a fraction of available processing
     time.  */
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
  if (TracksLayer.loadData.start() != CothreadStatus.FINISHED)
    return browserTime();
}
