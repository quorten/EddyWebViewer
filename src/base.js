// TODO: Do all those class object existence checks...
// "use strict";

var oev;
if (!oev)
  oev = {};
else if (typeof oev != 'object')
  throw new
    Error("Namespace conflict: oev already exists and is not an object.");

oev.DEG2RAD = function(deg) {
  return deg * Math.PI / 180;
};

oev.RAD2DEG = function(rad) {
  return rad * 180 / Math.PI;
};

// Abstract class
oev.MapProjector = {};

/* Project a latitude-longitude polar coordinate to a map coordinate
   for the current projection.

   mapCoord.lat - latitude
   mapCoord.lon - longitude

   The coordinates must be normalized before this function call.

   Returns map coordinates [-1..1] for both X and Y.

   This is an abstract class that specifies the calling convention.
   Use one of the concrete classes for the actual projection.
*/
oev.MapProjector.project = function(polCoord) {
};

oev.MapProjector.unproject = function(scrCoord) {
};

/* Equirectangular map projection */
oev.EquirectMapProjector = {};

oev.EquirectMapProjector.project = function(polCoord) {
  var mapCoord = {};
  mapCoord.y = polCoord.lat / 90;
  mapCoord.x = polCoord.lon / 180;
  return mapCoord;
};

oev.EquirectMapProjector.unproject = function(mapCoord) {
  var polCoord = {};
  polCoord.lat = mapCoord.y * 90;
  polCoord.lon = mapCoord.x * 180;
  return polCoord;
};

/* Mercator map projection */
oev.MercatorMapProjector = {};

oev.MercatorMapProjector.project = function(polCoord) {
  var r = 1; // Radius
  var mapCoord = {};
  mapCoord.y = r * Math.log(Math.tan(Math.PI / 4 +
				     oev.DEG2RAD(polCoord.lat) / 2));
  mapCoord.x = polCoord.lon / 180;
  return mapCoord;
};

oev.MercatorMapProjector.unproject = function(mapCoord) {
  var r = 1; // Radius
  var polCoord = {};
  polCoord.lat = 2 * Math.atan(Math.exp(y / r)) - Math.PI / 2;
  polCoord.lon = mapCoord.x * 180;
  return polCoord;
};

/* Robinson map projection */
oev.RobinsonMapProjector = {};

oev.RobinsonMapProjector.table = [
//  PLEN    PDFE         LAT
  [ 1.0000, 0.0000 ], // 00
  [ 0.9986, 0.0620 ], // 05
  [ 0.9954, 0.1240 ], // 10
  [ 0.9900, 0.1860 ], // 15
  [ 0.9822, 0.2480 ], // 20
  [ 0.9730, 0.3100 ], // 25
  [ 0.9600, 0.3720 ], // 30
  [ 0.9427, 0.4340 ], // 35
  [ 0.9216, 0.4958 ], // 40
  [ 0.8962, 0.5571 ], // 45
  [ 0.8679, 0.6176 ], // 50
  [ 0.8350, 0.6769 ], // 55
  [ 0.7986, 0.7346 ], // 60
  [ 0.7597, 0.7903 ], // 65
  [ 0.7186, 0.8435 ], // 70
  [ 0.6732, 0.8936 ], // 75
  [ 0.6213, 0.9394 ], // 80
  [ 0.5722, 0.9761 ], // 85
  [ 0.5322, 1.0000 ]  // 90
];

oev.RobinsonMapProjector.project = function(polCoord) {
  var table = oev.RobinsonProjector.table;
  var alat = Math.abs(polCoord.lat);
  var tbIdx1 = ~~Math.floor(alat / 5);
  var tbIdx2 = ~~Math.ceil(alat / 5);
  var interpol = alat % 5;
  var plen = ((interpol * table[tbIdx1][0]) +
	      ((1 - interpol) * table[tbIdx2][0])) / 2;
  var pdfe = ((interpol * table[tbIdx1][1]) +
	      ((1 - interpol) * table[tbIdx2][1])) / 2;
  var mapCoord = {};
  mapCoord.x = polCoord.lon * plen / 180;
  mapCoord.y = pdfe * 0.5072;
  if (polCoord.lat < 0)
    mapCoord.y = -mapCoord.y;
};

// TODO: Need an efficient reverse lookup table.  Hash function.
oev.RobinsonMapProjector.unproject = function(mapCoord) {
};

/* Winkel tripel map projection (not usable) */
oev.W3MapProjector = {};

oev.W3MapProjector.project = function(polCoord) {
  var mapCoord = {};
  var a = Math.acos(Math.cos(polCoord.lat) * Math.cos(polCoord.lon / 2));
  var sinc_a = Math.sin(a) / a;
  mapCoord.y = 1 / 2 * (polCoord.lat + Math.sin(polCoord.lat) / sinc_a);
  mapCoord.x = 1 / 2 * (polCoord.lon * Math.cos(polCoord.lat) +
			2 * Math.cos(polCoord.lat) * sin(polCoord.lon / 2) /
			sinc_a);
};

oev.W3MapProjector.unproject = function(mapCoord) {
  // Complicated reverse projection
};

/* Note: This algorithm needs a newline at the end of the file.  It
   also does not handle files with non-Unix line endings.  */
oev.csvParse = function(csvText) {
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
