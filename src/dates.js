/* Load the dates that correspond to the date indexes and create the
   array of Date objects needed to calculate the real time intervals
   of the dates.  */

import "ajaxloaders";

var Dates = new XHRLoader("../data/dates.dat", execTime);

/* Important parameter: the current date selected by the user.  */
Dates.curDate = "";

Dates.procData = function(httpRequest) {
  var doneProcData = false;
  var procError = false;

  // Program timed cothread loop here.
  if (httpRequest.readyState == 4) {
    Dates.dateList = httpRequest.responseText.split("\n");
    /* Remove the last element created from the newline at the end of
       the file.  */
    Dates.dateList.pop();

    Dates.realTimes = [];
    var dateList = Dates.dateList;
    var numDates = dateList.length;
    for (var i = 0; i < numDates; i++) {
      var dlen = dateList[i].length;
      var day = dateList[i].substr(dlen - 2, 2);
      var month = dateList[i].substr(dlen - 4, 2);
      var year = dateList[i].substring(0, dlen - 4);
      var fmtDate = [ year, month, day ].join("-");
      var realTime = +(new Date(fmtDate)) / (1000 * 60 * 60 * 24 * 7);
      Dates.realTimes.push(realTime);
    }

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
