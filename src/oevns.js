/* Ocean Eddies Web Viewer namespace definition.  */

/* See <http://spoken.fortybelow.ca/Browser_Scripting_101/#twenty_two>
   if you are unfamiliar with the following declaration.  */
var Global = this;

/**
 * Ocean Eddies Web Viewer namespace.
 * @namespace
 */
var OEV;

if (!OEV)
  OEV = {};
else if (typeof(OEV) != "object") {
  throw new Error("Namespace conflict: OEV already exists " +
		  "and is not an object.");
}
