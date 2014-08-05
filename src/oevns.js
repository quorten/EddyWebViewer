/* Ocean Eddies Web Viewer namespace definition.  */

/* See <http://spoken.fortybelow.ca/Browser_Scripting_101/#twenty_two>
   if you are unfamiliar with the following declaration.  */
var Global = this;

/**
 * Ocean Eddies Web Viewer namespace.
 *
 * Note that all documented objects are members of the OEV namespace.
 * However, they are not marked as such in the JSDocs because JSDoc
 * isn't sophisticated enough to gracefully handle default namespaces.
 * @namespace
 */
var OEV;

if (!OEV)
  OEV = {};
else if (typeof(OEV) != "object") {
  /* NOTE: The entire source code of the web viewer has been written
     to be runnable in JavaScript environments that don't feature
     exception handling.  We can't just write `throw' because
     context-free grammar parsers are too dumb to simply count
     parentheses to skip a non-interpreted token sequence.  Thus, we
     use an exception-throwing abstraction function instead, provided
     from feature detections during startup.  */
  throw_new_Error("Namespace conflict: OEV already exists " +
		  "and is not an object.");
}

/* Wrap all OEV code within a closure so that we don't clutter our own
   code with OEV prefixes.  */
(function() {
