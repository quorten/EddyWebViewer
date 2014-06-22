CPP = cpp
cjs_dir = ../libs/cjs
SOURCES = triglut.js oevns.js oevmath.js cothread.js renderlayer.js \
	projector.js trackslayer.js sshlayer.js csv.js compat.js \
	ajaxloaders.js doc.js
BUNDLES = bundle.js docbundle.js

# all: docs
all: docbundle.js

include $(cjs_dir)/cjs.mak

# bundle.js: ...
# 	$(cjs_dir)/hjssmash.sh $< -o $@

docs: docbundle.js
	../libs/jsdoc-master/jsdoc $^ ../README.md -u docs_in
	rm -rf ../docs/jsdocs
	mv out jsdocs
	mv jsdocs ../docs/

docbundle.js: doc.hjs
	$(cjs_dir)/hjssmash.sh $< -o $@

clean::
	rm -f $(BUNDLES)

distclean: clean
	rm -rf ../docs/jsdocs
