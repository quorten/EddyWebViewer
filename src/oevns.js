/* Ocean Eddies Web Viewer namespace definition.  */

var oev;
if (!oev)
  oev = {};
else if (typeof oev != "object") {
  throw new Error("Namespace conflict: oev already exists " +
		  "and is not an object.");
}
