CPP = cpp # C preprocessor
cjs_dir = ../libs/cjs
SOURCES = triglut.js oevns.js oevmath.js cothread.js renderlayer.js \
	projector.js trackslayer.js sshlayer.js csv.js compat.js \
	ajaxloaders.js dates.js compositor.js bundle.js doc.js
BUNDLES = bundle.js docbundle.js

# all: docs
all: docbundle.js bundle.js

include $(cjs_dir)/cjs.mak

bundle.js: compositor.hjs
	$(cjs_dir)/hjssmash.sh $< -o $@

docs: docbundle.js
	../libs/jsdoc-master/jsdoc $^ ../README.md -u docs_in
	rm -rf ../docs/jsdocs
	mv out jsdocs
	mv jsdocs ../docs/

docbundle.js: doc.hjs
	$(cjs_dir)/hjssmash.sh $< -o $@

sshdata: ../data
	CLASSES='jpgssh pngssh' ./sshproc.sh

install: bundle.js
	mkdir -p ../htdocs
	cp bundle.js ../htdocs/
	sed -i -e 's/\.\.\///g' ../htdocs/bundle.js
	cp ../slim_gui/* ../htdocs/
	cp ../alpha/index.html ../htdocs/index.html
	sed -i -e 's/\.\.\/src\///g' ../htdocs/index.html
	-chmod go+r ../htdocs/*

clean::
	rm -f $(BUNDLES)

distclean: clean
	rm -rf ../docs/jsdocs
	rm -rf ../htdocs
