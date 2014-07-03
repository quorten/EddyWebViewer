/* Ocean Eddies Web Viewer namespace definition.  */

/* See <http://spoken.fortybelow.ca/Browser_Scripting_101/#twenty_two>
   if you are unfamiliar with the following declaration.  */
var global = this;

/**
 * Ocean Eddies Web Viewer namespace.
 * @namespace
 */
var oev;

if (!oev)
  oev = {};
else if (typeof(oev) != "object") {
  throw new Error("Namespace conflict: oev already exists " +
		  "and is not an object.");
}
