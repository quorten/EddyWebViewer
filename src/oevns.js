/* Ocean Eddies Web Viewer namespace definition.

@licstart  The following is the entire license notice for the
JavaScript code in this page.

Copyright (C) 2014 University of Minnesota

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

@licend  The above is the entire license notice for the JavaScript
code in this page.

*/

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
