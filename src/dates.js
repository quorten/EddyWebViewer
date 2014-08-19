/* Load the dates that correspond to the date indexes and create the
   array of Date objects needed to calculate the real time intervals
   of the dates.  */

import "oevns";
import "ajaxloaders";

/**
 * Dates list object.  This object keeps track of the list of date
 * indexes and the current date index selected by the user.
 */
var Dates = new XHRLoader("../data/dates.dat");
OEV.Dates = Dates;

/** The current date index selected by the user.  */
Dates.curDate = 0;

/**
 * Assign the current date index using a date given as a string.
 * @returns `true` on successful date change, `false` otherwise.
 */
Dates.curDateFromString = function(dateStr) {
  if (!this.dateList)
    return;
  var dateVal = +(new Date(dateStr));
  if (isNaN(dateVal))
    return false;

  /* Linear search for the closest match to the user-provided
     date.  */
  var numDates = this.dateList.length;
  var Dates_realTimes = OEV.Dates.realTimes;
  var realTimes = this.realTimes;
  for (var i = 0; i < numDates; i++) {
    if (realTimes[i] > dateVal) {
      if (i > 0) this.curDate = i - 1;
      else this.curDate = 0;
      return true;
    }
  }

  /* If the date is greater than all date indexes, then set curDate to
     the last possible date index.  */
  this.curDate = numDates - 1;
  return true;
};

Dates.procData = function(httpRequest, responseText) {
  var doneProcData = false;
  var procError = false;

  if (httpRequest.readyState == 4) { // DONE
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

    // Parse the dates.
    Dates.dateList = responseText.split("\n");
    /* Remove the last element created from the newline at the end of
       the file.  */
    Dates.dateList.pop();

    Dates.realTimes = [];
    var dateList = Dates.dateList;
    var numDates = dateList.length;
    if (numDates == 0)
      procError = true;
    for (var i = 0; i < numDates; i++) {
      // First change the date to a more readable hyphenated date.
      var dlen = dateList[i].length;
      if (dlen < 8)
	  { procError = true; break; }
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
