/* CSV parsing functions.  */

/* Note: This algorithm needs a newline at the end of the file.  It
   also does not handle files with non-Unix line endings.  */
function csvParse(csvText) {
  var tgtArray = [];
  var i = 0;
  var rowEnd;

  while ((rowEnd = csvText.indexOf('\n', i)) != -1) {
    var taEnd = tgtArray.push([]) - 1;
    var commaIdx;

    while ((commaIdx = csvText.indexOf(',', i)) < rowEnd &&
	   commaIdx != -1) {
      tgtArray[taEnd].push(csvText.substring(i, commaIdx));
      i = commaIdx + 1
    }

    if (csvText[rowEnd-1] != ',') {
      // Parse the last entry in the row.
      tgtArray[taEnd].push(csvText.substring(i, rowEnd))
    }
    i = rowEnd + 1
  }

  return tgtArray;
};
