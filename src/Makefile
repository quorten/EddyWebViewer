CPP = cpp
cjs_dir = ../libs/cjs
SOURCES = triglut.js oevns.js oevmath.js cothread.js renderlayer.js \
	projector.js trackslayer.js doc.js
BUNDLES = bundle.js docbundle.js

all: bundle.js docs

include $(cjs_dir)/cjs.mak

bundle.js: cttest.hjs
	$(cjs_dir)/hjssmash.sh $< -o $@

docs: docbundle.js
	../../jsdoc-master/jsdoc $^ ../README.md -u docs_in
	rm -rf ../docs/jsdocs
	mv out jsdocs
	mv jsdocs ../docs/

docbundle.js: doc.hjs
	$(cjs_dir)/hjssmash.sh $< -o $@

clean::
	rm -f $(BUNDLES)
