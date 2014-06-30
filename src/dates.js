/* Load the dates that correspond to the date indexes and create the
   array of Date objects needed to calculate the real time intervals
   of the dates.  */

import "ajaxloaders";

var Dates = new XHRLoader("../data/dates.dat", execTime);

/* Important parameter: the current date index selected by the
   user.  */
Dates.curDate = 0;

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
      // First change the date to a more readable hyphenated date.
      var dlen = dateList[i].length;
      var day = dateList[i].substr(dlen - 2, 2);
      var month = dateList[i].substr(dlen - 4, 2);
      var year = dateList[i].substring(0, dlen - 4);
      var fmtDate = [ year, month, day ].join("-");
      Dates.dateList[i] = fmtDate;

      var realTime = +(new Date(fmtDate));
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
