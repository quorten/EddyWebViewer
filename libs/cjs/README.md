CJS
===

`cjs` is a simple system for managing JavaScript projects that have
more than one source file.  The C preprocessor is used to merge
multiple JavaScript files into a single bundle for inclusion on a
website.

GNU Make Makefile rules for the JavaScript bundling build steps are
available in the `cjs.mak` Makefile fragments.  The following is a
simple example Makefile that includes `cjs.mak` for building a bundled
JavaScript:

~~~
CPP = cpp # The C preprocessor command to use
cjs_dir = ../libs/cjs # The location of cjs.  This must be set in
                      # order to include `cjs.mak'.
# You must list all js files that need to be converted to "hjs" files
# below.
SOURCES = main.js libone.js three.js

all: bundle.js

include $(cjs_dir)/cjs.mak

bundle.js: main.hjs
	$(cjs_dir)/hjssmash.sh $< -o $@

clean::
	rm -f bundle.js
~~~

`cjs` was originally a hybrid C++ and JavaScript source format where
the C preprocessor was used to replace special type tags to either a
JavaScript or a C++ target.  The functionality can still be accessed
through the `jsize.sh` and `cppize.sh` shell scripts respectively.

Brief Summary of Included Commands
----------------------------------

* hjsprep.sh --- Convert JavaScript to "hjs" ("header" JavaScript):
  JavaScript with a C preprocessor statements.

* hjssmash.sh --- Merge all JavaScript files included from the given
  input `hjs` file into an output JavaScript bundle.

* converter.c --- Simple declaration-rewriting-based C to JavaScript
  converter.

* jsize.sh --- Convert `cjs` input into JavaScript output.

* cppize.sh --- Convert `cjs` input into C output.

* jsinline.sh --- Simple provisions for mathematical function inlining.
